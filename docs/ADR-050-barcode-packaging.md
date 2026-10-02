# ADR-050 — Complétude barcode par document + vérification packaging

> Statut : accepté (Phase 4). Fichiers : `electron/printing/receipt-documents.ts` (`thermalHtml`, `ThermalWidth`), `electron/printing/printing.service.ts` (10 appels thermiques), `tests/unit/p0-print-bw-qr-tva.test.ts`.

## 1. Barcode par document (question : tous les documents ont-ils leur barcode ?)

Réponse honnête : non avant correctif — oui après.

| Document      | A4                              | Thermique 58/80mm                    |
| ------------- | ------------------------------- | ------------------------------------ |
| Facture       | Code 39 (N°) + QR (déjà)        | Code 39 + QR ajoutés                 |
| Ticket        | —                               | QR texte seul → Code 39 + QR ajoutés |
| Bon commande  | Code 39 (N° CMD) + QR (déjà)    | QR manquant → ajouté + Code 39 + QR  |
| Bon livraison | Code 39 + QR (déjà)             | QR texte (déjà) + Code 39 + QR       |
| Bon retour    | Code 39 + QR (déjà)             | QR texte (déjà) + Code 39 + QR       |
| Reçu paiement | QR seul → Code 39 (réf.) ajouté | QR texte (déjà) + Code 39 + QR       |

Décision : `thermalHtml()` promu en pur dans `receipt-documents.ts` (était local au service, non testable) — `(texte, largeur, {barcode, qrSvg, qrPayload})`, SVG Code 39 (N° du document) + QR sous le `<pre>`, N&B, échelle 58 (200px) / 80mm. Les 10 appels thermiques (`printReceipt`, `printPayment`, `printProforma80mm`, `printDelivery/ReturnSlip/PO`, exports PDF 80mm) transmettent les codes ; exports PDF thermiques alignés 58000/80000µm. Tests : codes thermiques 58/80 + déterminisme + QR commande + N&B (`p0-print-bw-qr-tva` 9/9).

## 2. Packaging (AGENTS §9)

- Blocage environnement (pas code) : `npm run package` (NSIS) échoue au téléchargement `winCodeSign` — `7za` ne peut créer de symlinks (`SeCreateSymbolicLinkPrivilege` manquant, poste non-admin/sans mode développeur). Remédiation : une exécution admin/mode développeur met le cache en place ; builds suivants OK.
- Build de vérification (sans toucher au repo) : config temporaire hors repo avec `extends: electron-builder.yml` + `win.signAndEditExecutable: false`, cible portable seule, `--publish never`. Nota : `-c fichier` seul REMPLACE la config (buie 643 Mo par défaut constaté puis supprimé) — l'`extends` est obligatoire pour fusionner.
- Preuves (portable `Veloria-PoS-Portable-1.0.0.exe`, 98,9 Mo) : asar contient `qrcode` (46 fichiers, MIT 1.5.4, graphe prod auto) + `better-sqlite3` (37 fichiers, `.node` dépaqueté) + `bindings` + migrations (31) + `ocr/lang` + `license/public.key` + icônes. Sous le runtime Electron 37.2.0 packagé (`ELECTRON_RUN_AS_NODE=1`) : `SQLITE-OK 42` (base `:memory:`) et `QR-OK modules=25`. `@electron/rebuild` : `better-sqlite3` reconstruit pour Electron 37 x64 pendant le packaging.
- NSIS complet non rejoué ici (même blocage `winCodeSign`) — le portable valide le même pipeline asar/natif.
