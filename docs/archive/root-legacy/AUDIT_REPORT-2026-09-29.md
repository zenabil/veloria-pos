# AUDIT_REPORT.md — Veloria POS — Phase 1 (Radical, Zero-Tolerance)

> Date : 2026-09-29 · Périmètre : `src/` (138 fichiers) + `electron/` (55) + `database/migrations/` (31) + `scripts/` (18) + `tests/` (76) + `public/` + `resources/` + `private/` + `stitch_veloria_pos_desktop_system/` (39) + `license-manager/` + `dist*/` + `release/` + racine (`package.json`, configs, `index.html`, `*.yml`, `*.ts`, `*.mjs`).
> Méthode : lecture directe + `glob` + `grep` + 3 inventaires parallèles croisés + re-vérification manuelle des points P0. Rien n'a été modifié (rapport seul, aucune correction avant approbation).
> Convention : `[SEVERITE | TYPE | fichier:ligne | preuve]`. P0 = bloquant commercial/intégrité. P1 = fonctionnel manquant/écart contrat. P2 = impureté/organisation.

---

## 0. Verdict P0-HARDCOR (règles 1-7)

| Règle                                                                                  | Verdict                              | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. SQLite seule source métier                                                          | CONFORME                             | 0 `Dexie/IndexedDB/Firebase/Sheets` dans `src/`+`electron/`+`scripts/`+`tests/` (hits = commentaires d'interdiction + 1 test de bannissement `tests/unit/bridge-shape.test.ts:26`). `localStorage` = prefs UI seules (`src/app/shell/App.tsx:326,336,437,448,467`, `src/shared/ui/confirm.ts:10,18`), jamais de données métier. Paniers = SQLite (`database/migrations/0030_cart_drafts.sql:3`, `electron/ipc/handlers/carts.repo.ts`). |
| 2. Renderer = `window.veloria` seul                                                    | CONFORME                             | 0 `from "electron"`, `better-sqlite3`, `fs/path`, `ipcRenderer`, `process.env` dans `src/`. Pont typé seul : `src/vite-env.d.ts`, `src/shared/types/ipc-client.ts:4-6`, `src/app/shell/App.tsx:516-546`, `src/app/shell/WindowChrome.tsx:14,152`. Preload seul invocateur : `electron/preload/preload.ts:281`.                                                                                                                          |
| 3. Pas de `run-sql` général                                                            | CONFORME                             | 0 `run-sql` / `invoke(` brut dans `src/`. ~200 canaux `domain.action` (`electron/ipc/channels.ts:1-199`). Chaque `handle()` a un schéma Zod (`electron/ipc/registry.ts:444-614`, `electron/ipc/validators.ts:1-1163`). Garde documentée `channels.ts:2`, `validators.ts:941`.                                                                                                                                                           |
| 4. Argent = centimes int + TX + operationId                                            | CONFORME avec 3 nuances P1 (voir §5) | 79 colonnes `*_minor` = 79× `INTEGER`, 0× REAL/FLOAT (`database/migrations/*.sql`). `NUMERIC` = quantités uniquement. Boundary `src/domain/money/money.ts:14-177`, `moneyMinor:41` Zod, `Math.round` entier. Tous mutateurs en `db.transaction()` + `claim/peek/store` (`electron/ipc/handlers/idempotency.ts:10-98`).                                                                                                                  |
| 5. Migrations immutables + verify vert                                                 | CONFORME (1 action P1)               | Guard sha256 + refus drift (`electron/database/sqlite.service.ts:74-86,238-284`), mapping FR (`electron/main/startup-flow.ts:57`). `scripts/database/verify-migrations.mjs` (895 l.) : séquence stricte + rejeu 0001→0031 + `integrity_check`. 31 fichiers contigus, aucun trou. ⚠ `0031_defensive_sale_item_discount.sql` = `??` non committé (à committer, sinon futur drift perçu).                                                 |
| 6. Français UI seul, pas de raw exception                                              | CONFORME                             | Grep EN-UI = 0 (41 faux positifs = mots FR « Stock/Total/Exporter »). Commentaires EN = code seul, pas UI. Tous handlers `notify(frError(e,…))` via `src/shared/errors/fr-map.ts:18-32` (métier tel quel, technique → `console.error` + fallback). 0 `window.confirm/alert`, remplacé par `src/shared/ui/confirm-dialog.tsx`.                                                                                                           |
| 7. Interdits (catch silencieux, test désactivé, mock, code commenté, migration éditée) | CONFORME avec vigilances P1          | 0 `catch{}` vide, 0 `TODO/FIXME/STUB/HACK/mock/fake/lorem` réel, 0 test `.skip/disabled`, 0 migration éditée (`git log database/migrations` = 2 commits d'ajout). Restent des `.catch(()=>undefined)` best-effort documentés (son, vigilance, préchargements) — liste fermée §5.                                                                                                                                                        |

**Aucune violation bloquante des 7 règles hardcor. Les P0 ci-dessous sont des manques commerciaux (factures/thermique/étiquettes), pas des violations d'intégrité.**

---

## 1. [P0 | MOCK] — Données fictives / hardcodées métier

**Verdict : ZÉRO mock métier. Rien à supprimer.**

- `[P0 | MOCK | src/* : — | 0 hit MOCK/FAKE/DEMO/SAMPLE/DUMMY/FIXTURE/hardcod]` — seul commentaire sain `src/features/license/catalog.ts:47` (« jamais hardcodés dans l'UI »). Données en dur = replis UI légitimes (`src/shared/settings/use-app-settings.ts:14-22` DEFAULTS, `src/shared/company/use-company.ts:19-27` EMPTY_COMPANY, `src/shared/sound/sound.ts:98-120` scores audio, `src/shared/formatters/format.ts:34-61` mappings FR).
- `[P0 | MOCK | src/app/shell/App.tsx:763-771 | "Caisse 01", "POSTE 04 · OPÉRATEUR PRINCIPAL" en dur]` — seuls libellés codés en dur de l'app (bandeau opérationnel). Pas de multi-caisse/multi-utilisateur en base. À trancher : P1 si multi-poste contractuel, sinon P2 cosmétique. Signalé ici car seul hardcodé visible.
- Tests : 0 mock de réussite (miroirs `node:sqlite` réels, jamais de persistance alternative). `scripts/licensing/test-only-allow-expired.cjs:1-6` = bypass EXPIRED TEST-ONLY isolé (`VELORIA_E2E=1`), ne jamais utiliser en prod.

---

## 2. [P0 | FACTURE] — Factures & impression (critique commerciale)

Moteur existant réel : canaux `electron/ipc/channels.ts:145-164`, builders purs `electron/printing/receipt-documents.ts:284-988`, service `electron/printing/printing.service.ts:495-957`, UI `src/shared/documents/invoice-preview.tsx`, `payment-preview.tsx`, `src/features/print-templates/PrintTemplatesScreen.tsx:22-59`.

### 2.1 Existant (ne pas régresser)

- Ticket 80mm (`buildReceiptText:284`, `thermalHtml:467`, `printReceipt/preview`), Facture A4 (`buildA4Html:442`), Proforma 80mm+A4 (`buildProformaText:796`, `buildProformaA4Html:820`), Reçu règlement 80mm+A4 (`buildPaymentText:921`, `buildPaymentTicketA4Html:949`), Rapport A4 (`buildReportHtml:679`), Étiquettes planche A4 (`buildLabelsHtml:719` + Code39 SVG `:165-187`), Bon pain + Bon commande (aperçu via `SupplierPOsDialog.tsx:615`, `BreadDialogs.tsx:339`).

### 2.2 Manques P0 (facture incomplète = P0)

- `[P0 | FACTURE | electron/printing/receipt-documents.ts:467-504 | couleurs #111/#555/#999/#eee, pas #FFFFFF/#000000 purs]` — Spec exige fond `#FFFFFF` + texte `#000000` seuls. Écarts : `color:#111` body, `.muted{color:#555}`, bordures `#999`, `th{background:#eee}`, barcode `fill="#111"`. Même écart rapports/proforma/paiement/étiquettes (`:693-700,:729,:840,:954-970`). À normaliser en noir/blanc pur.
- `[P0 | FACTURE | electron/printing/receipt-documents.ts:404-405 | logo couleur non converti grayscale]` — `<img>` logo injecté tel quel, aucun filtre `grayscale(1) contrast(1)`. Spec : logo grayscale automatique.
- `[P0 | FACTURE | electron/printing/receipt-documents.ts:442-504,949-988 | pas de QR]` — 0 hit `QR/qr` dans builders. Spec : QR sur chaque document (N°/total/date/RC/NIF). À ajouter (déterministe, testé).
- `[P0 | FACTURE | electron/printing/receipt-documents.ts:442-504 | pas de HT/TVA]` — Mention explicite `src/features/print-templates/PrintTemplatesScreen.tsx:181` « Pas de TVA (cohérence caisse) ». OCR lit HT/TVA/TTC (`src/domain/ocr/parser.ts:44-47,245-319`) mais émission = `Sous-total/Remise/TOTAL TTC/Payé/RESTE` sans lignes `Total HT / TVA / Total TTC`, sans taux, sans vendeur. `ReceiptData:16-46` n'a ni `seller`, ni `tvaMinor`, ni `htMinor`, ni `qr`. Spec exige hiérarchie + mentions légales complètes (magasin/adresse/tél/RC/NIF/numéro/date/vendeur/client/paiement + tableau + totaux HT/TVA/TTC/remise/payé/reste + QR + footer). Facture actuelle = P0 incomplète.
- `[P0 | FACTURE | electron/printing/receipt-documents.ts:— | pas de buildPOHtml dédié]` — Aucun builder bon de commande (seuls builders : receipt/A4/report/labels/proforma/payment). `DOCUMENTS[7]` (`PrintTemplatesScreen.tsx:54-58`) annonce « Bon de commande → Aperçu A4 » mais passe par aperçu générique. Aucun canal `printing.printPO`. Même constat bon pain (aperçu générique).
- `[P0 | FACTURE | src/* + electron/* : — | 0 builder bon de livraison émis]` — Seul hit `bon de livraison` = regex lecture OCR `src/domain/ocr/parser.ts:143`. Aucun écran d'émission, aucun builder, aucun canal. Manque commercial.
- `[P0 | FACTURE | electron/printing/receipt-documents.ts:— | pas de template retour dédié]` — `src/features/returns/dialogs/DetailsDrawer.tsx:138,154-158,317-329` « Aperçu bon de retour » réutilise `printPreview/printReceipt/printA4` génériques. Pas de `buildReturnHtml/Text` propre (N° retour, cause, lignes rendues, remboursement, signatures).
- `[P0 | FACTURE | electron/printing/* : — | 0 hit 58mm]` — `Select-String 58mm` = 0. Spec exige 58mm + 80mm + A4 sans coupe. Actuel : 80mm seul (`thermalHtml(…,300)` dans `printing.service.ts:502,779,838,855,908`).

---

## 3. [P0 | THERMIQUE+ETIQUETTE]

- `[P0 | THERMIQUE | electron/printing/printing.service.ts:478-502,571-592 | impression HTML système seule]` — Liste via `getPrintersAsync`, sélection nom (`printer.get/save`), `printHtml(thermalHtml(…),300)`, `testPage`. Aucun ESC/POS, aucun USB/Réseau/Bluetooth adressable, aucun choix 58/80mm, aucune largeur paramétrable, aucun pilote thermique. Spec : support 58/80mm + A4, ESC/POS, USB/Réseau/Bluetooth, choix depuis Paramètres + Test réel. `TestPage` existe mais envoie du HTML 300px, pas un ticket ESC/POS de calibration.
- `[P0 | ETIQUETTE | electron/printing/receipt-documents.ts:719-737 | planche A4 3×8 fixe]` — `buildLabelsHtml` = grille fixe `repeat(3,1fr)`, 24/page implicite, pas de formats `30x20/50x30/58x40/custom`, pas de choix individuel/collectif par imprimante, pas de preview liée à l'imprimante sélectionnée (preview = même HTML A4). Barcode Code39 réel (`:165-187`) — point positif — mais `fill="#111"` au lieu de `#000`, pas de tailles/mm, pas de calibration thermique. UI `src/features/products/dialogs/LabelsDialog.tsx:1-154` + `src/features/products/ProductsScreen.tsx` : A4 seul.
- `[P0 | ETIQUETTE | src/features/products/dialogs/LabelsDialog.tsx | pas de preview ثابت — mais preview = A4 générique]` — Conforme « pas de preview ثابت » sur le principe (données SQLite réelles), mais non conforme aux formats thermiques exigés.

---

## 4. [P1 | CLIENT-360 + FOURNISSEUR + BACKUP]

### 4.1 Client 360 — existe sous un autre nom, onglets exigés manquants

- Existant réel : `src/features/customers/ClientsScreen.tsx:1-613` (fiches/dettes/règlements, `stats.credit/dette`), `src/features/customers/ClientDialogs.tsx:71` (aperçu facture 80/A4 depuis fiche + `:527-635` encaissement borné), `src/features/customers/types.ts:85-92` (`customers.statement` = fiche+ventes+paiements), création rapide **client** depuis caisse `src/features/sales/SellScreen.tsx:538-555,1069-1080,1440-1470`.
- `[P1 | CLIENT360 | src/features/customers/* : — | 0 hit Client360/360]` — Aucun module « 360 », aucun système d'onglets `Factures/Paiements/Retours/Dettes-Solde/Historique` avec ouverture/impression par ligne. La fiche actuelle expose relevé + aperçu, mais pas les 5 onglets navigables exigés avec `Solde en centimes sans arrondi` affiché par onglet. À construire en vertical slice (requêtes `customers.statement` déjà atomiques — réutiliser).
- `[P1 | CLIENT360 | src/features/customers/ClientDialogs.tsx:323,329 | .catch(()=>undefined) préchargements]` — Repli liste vide acceptable, log technique à ajouter si diagnostic.

### 4.2 Fournisseur inline — MANQUANT (P1 confirmé)

- `[P1 | FOURNISSEUR | src/features/sales/** : — | 0 hit fournisseur/supplier]` (hors zakat `supplierDebts`). `[P1 | FOURNISSEUR | src/features/stock/** : — | 0 hit SupplierForm/nouveau fournisseur/inline]` (que classes CSS `inline-flex`). `SupplierFormDialog` monté uniquement depuis `SuppliersScreen` (`src/features/suppliers/SuppliersScreen.tsx`, `src/features/suppliers/dialogs/FormDialog.tsx:1-217`).
- Exigé : même composant `SupplierFormDialog` monté depuis (a) fenêtre ajout produit (`src/features/products/dialogs/FormDialog.tsx:86-121` — préchargements catégories/fournisseurs, repli listes vides) et (b) fenêtre entrée stock (`src/features/stock/dialogs/IntakeDialog.tsx:1-522`), sauvegarde atomique + sélection auto + zéro perte de saisie. Actuellement : ajout produit exige un fournisseur préexistant, réception exige navigation hors flux.

### 4.3 Backup — existe (WAL-safe, restaure robuste) mais planificateur exigé manquant

- Existant réel et sain : `electron/backup/backup.service.ts:98-156` (`VACUUM INTO` + sha256 + sidecar + rotation 30), `listBackups:216`, `backupStatus:271`, `isAutoBackupDue:294` (jours), `exportBackupToFolder:309`, `registerBackupIpc:328-549` (snapshot avant restore + vérif `verifyDbFileCopy` + refus downgrade + rollback garanti + réouverture `reopenWithRetry`), déclenchement au démarrage `electron/main/main.ts:30,81-83,168-171`, UI `src/features/settings/SettingsSectionsB.tsx:239-272`.
- `[P1 | BACKUP | electron/backup/backup.service.ts:239-302 | intervalDays 1-30 jours seul, déclenchement au démarrage seul]` — Spec exige `10min/30min/1h/6h/12h/jour/semaine/personnalisé` + copies atomiques + `rétention N` + restauration + log + alerte FR. Actuel : `{enabled, intervalDays 1..30, défaut 1j}`, pas de cron intra-journalier, pas de planificateur minutes/heures, pas de rétention N configurable (dur 30 dans `createBackup:138-153`, 5 snapshots dans `snapshotClosedDbFile:188-203`), pas de journal visible FR ni d'alerte en cas d'échec (logs main seuls). Backup non « fictif » (VACUUM réel + tests `tests/e2e/stock-backup.spec.ts`, `tests/integration/restore-rollback.test.ts:1-73`) — mais planificateur à 8 durées à construire.
- `[P1 | BACKUP | src/features/settings/SettingsSectionsB.tsx:133,270,276,467,479,666,721,811 | .catch best-effort sur chemins backup/diag/printer]` — Replis UI existants, durcir avec `console.error("[Veloria]")` si backup critique.

---

## 5. [P1 | VERTICAL-SLICE] — Écarts contrat (documentés, à assumer par ADR)

- `[P1 | OPID | electron/ipc/validators.ts + registry.ts:491-498,1168-1177 | operationId optionnel sur updates]` — Créations/paiements exigent UUID (`schemaRequiresOperationId:153-159`) ; optionnel sur `productUpdate:86-89`, `supplierUpdate:465-471`, `customerUpdate:770-781`, `proformaStatus:512-516`, `proformaUpdate:712-714`, `saleDueDate:542-546`, `categoryCreate:1078-1081`, `settingsSave:841-882`, `companyUpdate:897-898`, `expenseDelete:1093-1096`, `productSuppliers:1114-1118`. Sans UUID = idempotence-par-valeur + `auditOperationId` déterministe (`idempotency.ts:48-69`) ; avec UUID = `peekOptional/claimOptional/storeOptional` (`:71-98`). Écart à AGENTS §4 à sceller par ADR (ou rendre obligatoire partout).
- `[P1 | OPID | electron/ipc/handlers/carts.repo.ts:160 + validators.ts:632-646 | carts.save sans operationId]` — Écrasement total `DELETE+INSERT` en TX (last-write-wins, rejouement = même état) — sûr mais sans clé inter-retry. À documenter ou clôturer.
- `[P1 | TX | electron/ipc/handlers/fifo.ts:6,86-204 | écrit sans TX propre]` — Contrat « MUST be called inside caller's transaction » respecté par sales/inventory/returns. Ne jamais appeler hors TX (garde statique `verify-domain.ts` à étendre si besoin).
- `[P1 | MIGRATION | database/migrations/0031_defensive_sale_item_discount.sql | fichier untracked]` — `git status ?? 0031`, à committer + tagger avant Phase 2, sinon perçu comme drift par le guard.
- Vigilances non bloquantes (tests round-trip à ajouter en Phase 2) :
  - `[P1 | FLOAT-AFFICHAGE | src/features/proformas/ProformaDialogs.tsx:394-395 | (Number(discount)/100).toString().replace(".",",")]` — champ affichage seul, reconverti via `parseDzdInputStrict` (`:465`), pas d'état float — couvrir par test round-trip.
  - `[P1 | FLOAT-AFFICHAGE | src/features/zakat/ZakatDialogs.tsx:63 | Number(rate)]` — vérifier qu'aucun `NaN` n'atteint le main (garde en amont, test à confirmer).
  - `[P1 | ROBUSTESSE | src/features/sales/cart-store.ts:237 | throw au render sans ErrorBoundary]` — invariant « Aucun panier actif » FR ; état initialisé donc risque faible, mais ErrorBoundary recommandée.
  - `[P1 | LOG | src/features/license/LicenseScreen.tsx:58, src/features/license/use-license.ts:42 | .catch muet]` — repli fail-closed voulu, ajouter log technique.

---

## 6. [P1/P2 | CODE] — Mort / redondant / manquant

- `[P2 | CODE | src/application/{bread,customers,expenses,inventory,payments,products,proformas,reports,returns,settings,suppliers} + src/domain/{payment,supplier} + src/shared/validation | 11+ dossiers vides, 0 fichier]` — Couches réservées non implémentées ; use-cases vivent dans `features/` + `domain/`. Pas de stub/TODO, mais écart architectural avec la cible `domain/application/infrastructure/presentation/shared` (§8). Soit implémenter, soit supprimer les dossiers vides + acter en ADR.
- `[P2 | CODE | package.json:31-49 | scripts triplons]` — `package ≡ package:win ≡ package:pos` à 1 flag près ; `build` vs `build:pos` recouvrants ; `dev:electron/dev:manager`, `build:electron/build:manager`, `typecheck/typecheck:electron/typecheck:manager` = doublons assumés 2 apps (POS+Manager) à documenter. Manquant : aucun script `clean` alors que `dist*/release/*.tsbuildinfo` salissent le workspace.
- `[P2 | CODE | src/features/sales/SellScreen.tsx:1-1478 | 1478 l., plus gros fichier]` — Caisse Nova saine (116 `*Minor` int, idempotence, 23 catch + 14 frError) mais monolithe à découper en Phase P2 (panier/paiement/raccourcis déjà extraits : `sell/CartPanel.tsx`, `PayDialog.tsx`, `useSellShortcuts.ts`).
- `[P2 | CODE | src/features/stock/OcrImportDialog.tsx:1-1143 | 1143 l.]` — Pipeline sain mais volumineux, même remarque de découpe P2.
- 0 import mort détecté aux points contrôlés (`bindings` = dépendance transitive native voulue, `zustand` = mono-usage paniers éphémères `cart-store.ts:5` — candidat `useState` si zéro-dep voulue).

---

## 7. [P2 | FEATURES/PAGES] — Mortes / redondantes / manquantes

- Pages : 17/17 modules du sidebar liés au routeur interne (`src/app/shell/App.tsx:870-886`, `MODULES:147-238`, `MODULE_PAGES:116-134`). **0 page morte, 0 page orpheline.** Lazy-loading sain (`:33-82`, caisse eagerly).
- `[P2 | FEATURE | license-manager/ | 2ᵉ app vendor vivante]` — `db/manager-db.ts`, `ipc/*`, `main/*`, `preload`, `renderer/*`, scripts `build:manager(-client)/dev:manager/package:manager/typecheck:manager` tous vivants. Doublons assumés (`index.html`, `ipc/*`, `window-manager.ts` ×2) — ne pas dédupliquer sans ADR.
- `[P1 | FEATURE-MANQUANTE | — | Bon de livraison (émission)]` — voir §2.2.
- `[P1 | FEATURE-MANQUANTE | — | Fournisseur inline ×2 fenêtres]` — voir §4.2.
- `[P1 | FEATURE-MANQUANTE | — | Planificateur backup 8 durées]` — voir §4.3.
- `[P1 | FEATURE-MANQUANTE | — | Thermique 58mm + ESC/POS + USB/Réseau/Bluetooth]` — voir §3.
- `[P1 | FEATURE-MANQUANTE | — | Étiquettes 30x20/50x30/58x40/custom + mono/collectif]` — voir §3.
- `[P1 | FEATURE-MANQUANTE | — | Client 360 à 5 onglets]` — voir §4.1.
- `[P2 | FEATURE | src/features/sales/cart-store.ts:5 | zustand mono-usage]` — Paniers onglets éphémères seuls consommateurs. Vivant, pas mort. P2 si objectif zéro-dep.

---

## 8. [P2 | CLEAN] — Impuretés (triées, preuves)

1. `[P2 | CLEAN | stitch_veloria_pos_desktop_system/ (19 dossiers × code.html+screen.png + DESIGN.md, ~39 fichiers) | 0 import depuis src/electron/scripts/configs, jamais empaqueté, déjà committé (silence git status = tracké)]` — Plus grosse impureté avec `release/` local. Action Phase 2 : `git rm -r` + archive hors repo (ou `docs/archive/` si traçabilité).
2. `[P2 | CLEAN | ./eng.traineddata (4113088 o) + ./fra.traineddata (1130365 o) | doublons exacts à l'octet de resources/ocr/lang/*, jamais lus (OCR lit resources/extraResources, electron-builder.yml:36-37, ocr-engine.ts)]` — 5,2 Mo morts à supprimer.
3. `[P2 | CLEAN | resources/brand-sources/veloria-pos.jpg (350408) + veloria-license-manager.jpg (395075) | 0 référence builder/src/electron/index.html]` — 745 Ko morts : déplacer vers `docs/` ou supprimer du bundle.
4. `[P2 | CLEAN | dist/ + dist-electron/ (+integrity-manifest.json) + dist-license-manager/ + dist-license-manager-renderer/ + release/ (4 exe + 2 blockmap + SHA256SUMS + win-unpacked/) | git ls-files = 0, git status ignored = conforme (.gitignore:3-7), mais sales en local, aucun clean npm]` — Ajouter script `clean` (`rimraf dist* release *.tsbuildinfo`), jamais committer (déjà OK).
5. `[P2 | CLEAN | tsconfig.tsbuildinfo (8399) + tsconfig.electron.tsbuildinfo (53293) | caches locaux, .gitignore:55, non trackés, régénérables]` — Supprimer.
6. `[P2 | CLEAN | private/vendor-keys/private.key + public.key (113 o) | git ls-files private = 0, .gitignore:26 = conforme non committé, mais clé privée vendor sur disque dev]` — Restreindre à machine vendor, documenter doublon volontaire `private/vendor-keys/public.key ≡ resources/license/public.key` (113 o).
7. `[P2 | CLEAN | src/application/* vides + dossiers domain vides | voir §6]` — Supprimer ou implémenter + ADR organisation cible `domain/application/infrastructure/presentation/shared` (spec P2 demande recherche 2025-2026 + liens — à verser dans `CLEANUP_REPORT.md`).
8. `[P2 | CLEAN | package.json deps | 0 morte]` — `better-sqlite3/zod/clsx/lucide-react/pdfjs-dist/react/tailwind-merge/tesseract/zustand/bindings` toutes vivantes (preuves §0 + `electron-builder.yml:15-23,44`). `console.*` = 1 voulu (`fr-map.ts:22`), `as any` = 0, `parseFloat` = 0, `toFixed` = tailles Ko/Mo seules.

---

## 9. Couverture vérifiée (zéro fichier sauté)

- `src/` : `main.tsx`, `vite-env.d.ts` (246 l. pont), `app/shell/App.tsx` (954 l.), `WindowChrome.tsx` (178 l.), `styles/globals.css`, `application/sales/create-sale.ts` + 11 dossiers vides, `domain/` 32 fichiers (audit, barcode, bread, closings×2, common×3, customer×2, expenses, import, inventory×4, money, ocr×4, pricing, product, proforma, returns×2, sales, suppliers×2, units, zakat), `shared/` 20 fichiers, `features/` 81 fichiers (bread×3, customers×3, dashboard×2, debts×3, expenses×3, history×3, license×5, print-templates×1, products×7, proformas×3, reports×3, returns×7, sales×7, settings×4, stock×8, suppliers×8, zakat×3).
- `electron/` 55 : `database/sqlite.service.ts:420`, `database-path.service.ts`, `retention.ts`, `backup/backup.service.ts:551`, `ipc/channels.ts:200`, `registry.ts:1923`, `validators.ts:1163`, handlers `products:648/customers:461/sales:542/returns:1101/purchases:368/inventory:653/suppliers:564/expenses:324/proformas:561/bread:739/finance:945/carts:160/company:129/settings:248/import:181/history:378/history-query:268/numbers:26/fifo:277/idempotency:99`, licensing×10, main×7, ocr×4, preload, security, printing×2, services×3.
- `database/migrations/` 31 : 0001 (367 l.) → 0031 (72 l.), contigus, vérifiés un par un + `verify-migrations.mjs:19-42,116-894`.
- `scripts/` 18 : database×5, licensing×7, quality×2, release×3 + `verify:*`.
- `tests/` 76 : database×2, intégration×10, e2e×11, unit×53 (dont `bridge-shape`, `money-safety`, `fr-map`, `operation-id`, `main-domain-parity`, `startup-flow`).
- Configs/racine : `package.json:90`, `.editorconfig/.gitignore/.npmrc/.prettierrc`, `AGENTS.md/README.md/index.html`, `package-lock.json`, `vite.config.ts`, `vite.license-manager.config.ts`, `vitest.config.ts` (seuils 80/75/88/80), `playwright.config.ts` (workers 1), `eslint.config.mjs` (`--max-warnings 0`), `tsconfig*.json`, `electron-builder.yml`, `electron-builder.license-manager.yml`, `docs/` (44 ADR-001→044 + licensing/reports/specs-archive).

---

## 10. Ce que la Phase 2 devra livrer (sans rien corriger avant approbation)

1. `FIX_PLAN.md` (P0→P1→P2) + `INVOICES_DESIGN.md` (sources 2025-2026 + maquettes A4/thermique/étiquette N&B + QR + HT/TVA/TTC) + `CLEANUP_REPORT.md` (supprimé/motif) + `docs/ADR-*.md` + `PHASE_X_REPORT.md`.
2. Vertical slices : UI → use-case → domain → repo (prepared) → migration → test SQLite réel, puis `npm run format && npm run typecheck && npm test && npm run build` (échec unique = stop).
3. Acceptance : zéro mock, zéro code mort, zéro warning, tests+build+migrations verts, chaque facture/étiquette N&B, Client 360 complet, Fournisseur depuis les 2 fenêtres, Backup aux 8 durées.

**Statut Phase 1 : RAPPORT SEUL — en attente d'approbation explicite avant toute modification, conformément à l'ordre « Ne répare pas avant adoption ».**
