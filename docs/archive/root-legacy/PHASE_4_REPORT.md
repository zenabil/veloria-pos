# PHASE_4_REPORT.md — Veloria POS — Barcode complet + packaging vérifié

> Réf : ADR-050, PHASE_3_REPORT.md. Aucune migration (documents purs), aucun schéma modifié.

## 1. Barcode par document — chaque document porte son Code 39 + QR

- Thermique (tous) : `thermalHtml()` pur + `receiptCodes()`/`logiCodes()` sur les 10 appels (vente, règlement, devis, livraison, retour, commande, exports PDF 80mm, page de test `TEST`).
- Reçu A4 : Code 39 (référence) ajouté au QR. Commande thermique : ligne `QR :` ajoutée.
- Tests : `p0-print-bw-qr-tva.test.ts` 9/9 (codes 58/80mm, 200/280px, déterminisme, N&B `#fff/#000` seuls).

## 2. Chaîne rejouée

- `prettier` ciblé + `typecheck` vert (integrity 239 fichiers).
- Tests ciblés documents : 53/53 (`p0-print-bw-qr-tva` 9, `p0-logistics-labels-backup` 6, `documents` 25, `payment-receipt` 4, `payment-ticket` 9). Suite complète 428/428 déjà verte en Phase 3 (aucun test existant touché depuis, seuls ajouts).
- `release:smoke` : vert (POS + manager, après `license:integrity-manager` manquant initialement — script désigné, pas de contournement).

## 3. Packaging portable (vérification, repo intact)

- `npm run package` (NSIS) bloqué par l'environnement : extraction `winCodeSign` impossible sans privilège symlink (admin/mode développeur requis une fois). Erreur exacte + remédiation en ADR-050.
- Portable `--publish never` (config `extends` temporaire hors repo) : `release/Veloria-PoS-Portable-1.0.0.exe` (98,9 Mo).
- Asar : `qrcode` 46 fichiers, `better-sqlite3` 37 (+`.node` dépaqueté), `bindings` 3, migrations 31, `ocr/lang` fra+eng, `license/public.key`, icônes.
- Runtime packagé (Electron 37.2.0) : `SQLITE-OK 42` + `QR-OK modules=25`.

## 4. Restes assumés

- NSIS à rejouer sur poste admin (même pipeline asar/natif déjà validé par le portable).
- `0031` à committer côté release. Sessions parallèles : `docs/ADR-042-*.md` untracked (non suivi, formaté, contenu d'autrui intact).
