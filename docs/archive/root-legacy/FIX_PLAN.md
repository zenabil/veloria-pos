# FIX_PLAN.md — Veloria POS — P0→P1→P2 (issu de AUDIT_REPORT.md Phase 1)

> Ordre d'exécution strict. Chaque slice : UI → use-case → domain → repo (prepared) → migration (si schéma) → test SQLite réel → `npm run format && npm run typecheck && npm test && npm run build`. Échec unique = stop.
> Conventions : `[ID | SÉV | TYPE | fichiers | acceptance]`.

---

## P0 — Factures & impression (bloquant commercial)

### P0-1 [P0 | FACTURE-COULEUR-QR-TVA | `electron/printing/receipt-documents.ts`, `electron/ipc/validators.ts`, `electron/printing/printing.service.ts`, `src/shared/documents/*`, `tests/unit/documents*.test.ts`]

- Normaliser tous les builders en `#FFFFFF` fond + `#000000` texte seuls (supprimer `#111/#555/#999/#eee` → `#000`, fonds `#fff`, bordures `#000`). Barcode `fill="#000"`.
- Logo : `filter:grayscale(1) contrast(1.15)` automatique sur `<img>` + A4 + étiquettes.
- Ajouter champs optionnels rétro-compatibles à `ReceiptData` : `seller`, `tvaRatePercent`, `htMinor`, `tvaMinor`, `qrPayload`, `qrSvg`.
- TVA : si `tvaRatePercent>0` → lignes `Total HT / TVA (x%) / Total TTC` en A4 + ticket ; si 0 → rendu actuel (tests existants verts).
- QR : payload déterministe `VELORIA|N°|TTC|DATE|RC|NIF|VENDEUR` + SVG QR réel (générateur pur vendored ISO 18004, zéro dépendance réseau) affiché en A4 + ticket (`[QR]` texte + SVG). Test : déterminisme + présence + échappement.
- Vendeur : affiché quand renseigné (cartouche + ticket `Vendeur : X`), `sale-ticket.ts` le remplit depuis `sales.get` (caissier/poste).
- Acceptance : builders N&B purs, logo grayscale, QR présent, HT/TVA/TTC corrects en centimes, tests verts.

### P0-2 [P0 | THERMIQUE-58/80 | `electron/printing/printing.service.ts`, `electron/ipc/validators.ts`, `src/features/print-templates/*`, `src/features/settings/*`, `src/app/shell/App.tsx`]

- `printingSettingsSchema` += `thermalWidth: 58mm|80mm` (défaut 80mm) + `connection: system` documenté (USB/Réseau/Bluetooth via pilote système — imprimantes listées par `getPrintersAsync`).
- `thermalHtml(text, width)` : 58mm → `width:200px;font-size:11px`, 80mm → `width:280px`. `exportReceiptPdf` pageSize adaptée (58mm : 58000µm).
- UI : sélecteur 58/80mm dans Impression + Paramètres, `Page de test` réelle (ticket calibration + mire N&B + largeurs), aperçu vivant 58/80mm.
- Acceptance : ticket 58mm sans coupe, test réel, choix persisté SQLite.

### P0-3 [P0 | DOCS-LIVRAISON-RETOUR-COMMANDE | `electron/printing/receipt-documents.ts`, `electron/ipc/channels.ts`, `registry.ts`, `validators.ts`, `src/shared/types/ipc-client.ts`, `electron/preload/preload.ts`, écrans Fournisseurs/Retours/Historique]

- Nouveaux builders purs : `buildDeliveryHtml/Text` (bon de livraison : N° BL, vente d'origine, lignes livrées, signatures), `buildReturnSlipHtml/Text` (N° retour, cause, lignes, remboursement), `buildPurchaseOrderHtml/Text` (N° CMD, fournisseur, lignes, totaux, validité).
- Nouveaux canaux `printing.previewDelivery/printDelivery`, `previewReturnSlip/printReturnSlip`, `previewPO/printPO` (+ exports PDF) avec schémas Zod + guards licence + tests.
- Câblage UI : Fournisseurs→Bons (aperçu/impression/export), Retours→fiche (bon retour), Vente/Historique→livraison. Données SQLite réelles, aperçu vivant.
- Acceptance : chaque document s'aperçoit, s'imprime A4+thermique, s'exporte PDF, N&B.

### P0-4 [P0 | ETIQUETTES-THERM | `electron/printing/*`, `electron/ipc/validators.ts`, `src/features/products/dialogs/LabelsDialog.tsx`]

- `labelsPayloadSchema` += `format: 30x20|50x30|58x40|A4-24|custom` + `customWidthMm/HeightMm` + `copies` (déjà) ; `buildLabelsHtml(items, opts)` : dimensions mm via `@page size`, N&B pur, Code39 `#000`, logo exclu.
- UI : sélecteur format lié à l'imprimante sélectionnée, mono/collectif, aperçu vivant (iframe même HTML que l'impression), validation 200 max conservée.
- Acceptance : 4 formats + custom impriment N&B sans coupe, barcode scannable, preview = print.

---

## P1 — Client 360 + Fournisseur + Backup

### P1-1 [P1 | CLIENT-360 | `src/features/customers/ClientsScreen.tsx`, `ClientDialogs.tsx`, `types.ts`]

- 5 onglets réels dans la fiche : Factures (`customers.statement.sales` → ouvrir/imprimer via `InvoicePreviewModal`), Paiements (`statement.payments`), Retours (`returns.list` filtré client), Dettes-Solde (dette/solde en centimes, sans arrondi), Historique (`history.list` filtré).
- Chaque ligne : ouvrir + imprimer. Solde affiché `formatDzd` depuis centimes.
- Acceptance : 5 onglets navigables, données SQLite, impression par ligne.

### P1-2 [P1 | FOURNISSEUR-INLINE | `src/features/suppliers/dialogs/FormDialog.tsx` (extrait réutilisable), `src/features/products/dialogs/FormDialog.tsx`, `src/features/stock/dialogs/IntakeDialog.tsx`]

- Extraire `SupplierQuickForm` (même composant, mêmes validateurs, sauvegarde atomique `suppliers.create` + `operationId`), monté en modale depuis les 2 fenêtres, sélection auto après création, zéro perte (état parent conservé).
- Acceptance : création depuis les 2 fenêtres, même composant, sélection auto, tests.

### P1-3 [P1 | BACKUP-8-DUREES | `electron/backup/backup.service.ts`, `electron/ipc/validators.ts`, `src/features/settings/SettingsSectionsB.tsx`, `electron/main/main.ts`]

- `backupAutoSchema` : `{enabled, frequency: 10min|30min|1h|6h|12h|daily|weekly|custom, customMinutes?:5..10080, retentionCount?:1..100}` + migration douce depuis `intervalDays` legacy.
- Service : `isAutoBackupDue` en minutes, timer main (`startAutoBackupTimer`, 60s), rotation `retentionCount` (défaut 30), log structuré + alerte FR (toast via `backup.status.lastError` + `notify`).
- UI : 8 options + custom + rétention N + liste + restaurer + log visible + alerte FR.
- Acceptance : les 8 fréquences déclenchent réellement, rétention respectée, log + alerte FR.

---

## P2 — Clean & organisation zéro-impureté

### P2-1 [P2 | CLEAN-FICHIERS | racine + `resources/` + `scripts`]

- Supprimer : `stitch_veloria_pos_desktop_system/` (`git rm -r`, archive hors repo), `./eng.traineddata` + `./fra.traineddata` (doublons `resources/ocr/lang/`), `resources/brand-sources/*.jpg` → `docs/brand/` (traçabilité) ou suppression, `*.tsbuildinfo`, `dist*/release/` locaux.
- Ajouter script `clean` (`rimraf` ou `node -e rmSync`), fusionner `package/package:win/package:pos` → `package` unique (+ `:portable` conservé), documenter doublons POS/Manager.
- `0031` : committer + tagger. `private/` : documenter doublon `public.key`, restreindre `private.key` machine vendor.
- Acceptance : `git status` propre, 0 doublon, `CLEANUP_REPORT.md` (supprimé/motif).

### P2-2 [P2 | CLEAN-ARCHI | `src/application/*` vides, découpage `SellScreen`/`OcrImportDialog`]

- Soit supprimer dossiers vides, soit les remplir (use-cases `features/` → `application/`) — décision ADR (recommandé : supprimer vides + garder `domain/features/shared`, pas de reorg Big-Bang risquée).
- Découper `SellScreen.tsx` (1478 l.) et `OcrImportDialog.tsx` (1143 l.) en sous-composants sans changer le comportement.
- `eslint --max-warnings 0` vert, `prettier` vert.
- Acceptance : 0 dossier vide, 0 warning, build vert.

---

## Ordre d'exécution

P0-1 → P0-2 → P0-3 → P0-4 → P1-1 → P1-2 → P1-3 → P2-1 → P2-2. Chaque slice livre `docs/ADR-*.md` + `PHASE_X_REPORT.md` + tests verts.

## Statut (Phase 4)

- [x] P0-1 (ADR-045) · [x] P0-2/P0-3/P0-4 (ADR-046) · [x] P1-1/P1-2/P1-3 (ADR-047) · [x] P2-1/P2-2 (ADR-048, CLEANUP_REPORT.md)
- [x] Consolidation 360 + reçu historique (ADR-049, PHASE_3_REPORT.md)
- [x] Barcode complet par document + packaging portable vérifié (ADR-050, PHASE_4_REPORT.md)
