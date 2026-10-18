# ADR-097 — Découpage receipt-documents/common.ts (gabarit ≤300 lignes)

Date : 2026-10-14
Statut : Accepté
Contexte : `tests/unit/printing/split-parity.test.ts:294-311` impose chaque fichier
`electron/printing/**` ≤300 lignes et `printing.service.ts` ≤150. `npm test`
échouait (`receipt-documents/common.ts: expected 408 to be less than or equal
to 300`, `tests/unit/printing/split-parity.test.ts:306`) et `npm run typecheck`
échouait (`tests/unit/p0-logistics-labels-backup.test.ts:187-188`, indexation
`possibly undefined`).

Décision :

- `common.ts` (407 lignes) découpé sans changement fonctionnel :
  - `receipt-documents/html.ts` : `escapeHtml`, `escapePreText` (source P28).
  - `receipt-documents/barcode39.ts` : `CODE39_PATTERNS`, `sanitizeCode39`,
    `code39Svg` (import `escapeHtml` depuis `./html`).
  - `receipt-documents/barcode128.ts` : `CODE128_WIDTHS`, `sanitizeCode128`,
    `code128Symbols`, `code128Svg` (import `escapeHtml` depuis `./html`).
  - `common.ts` : types (`ReceiptData`, `ReceiptLine`, `ThermalWidth`) +
    helpers (`formatCustomerCode`, `formatProductRef`, `paymentMethodLabel`)
    - ré-exports de compat.
- `electron/printing/receipt-documents.ts` (barrel) importe depuis les nouveaux
  modules directs (surface publique identique, vérifiée par
  `receipt-documents : barrel vs direct` + `surface publique inchangee`).
- Importeurs internes mis à jour : `chrome.ts`, `thermal.ts` → `./barcode39` +
  `./html` ; `labels.ts` → `./barcode128` ; `logistics.ts`, `proforma.ts`,
  `receipt-a4.ts`, `report.ts`, `payment-ticket.ts` → `escapeHtml` depuis
  `./html` (types toujours depuis `./common`).
- `tests/unit/p0-logistics-labels-backup.test.ts:187-188` : indexation
  sécurisée (`?? 0`), sémantique de test inchangée (longueur 6 garantie par
  regex `^[1-4]{6}$`).

Alternatives rejetées :

- Relever la borne 300 → 450 dans le test : cosmétique, interdit (masque la
  cause : module fourre-tout).
- Dupliquer `escapeHtml` dans chaque module barcode : divergence future (P28).

Conséquences :

- Tous les fichiers `electron/printing/receipt-documents/*` ≤300 lignes ;
  `split-parity` vert ; `typecheck` vert ; aucune migration (pur main,
  zéro schéma).
- Preuve : `npx vitest run tests/unit/printing/split-parity.test.ts
tests/unit/p0-logistics-labels-backup.test.ts tests/unit/documents.test.ts`
  = 59/59 verts ; `npm run typecheck` vert.
