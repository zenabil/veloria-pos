# ADR-045 — Impression N&B + QR réel + TVA optionnelle + vendeur

> Statut : accepté (Phase 2, P0-1). Fichiers : `electron/printing/receipt-documents.ts`, `electron/ipc/validators.ts`, `electron/printing/printing.service.ts`, `src/shared/documents/sale-ticket.ts`.

## Contexte

Audit P0 : builders en `#111/#555/#999/#eee`, logo couleur, 0 QR, 0 HT/TVA (mention « Pas de TVA »), 0 vendeur. Spec : fond `#FFFFFF` + texte `#000000` seuls, logo grayscale auto, QR par document, totaux HT/TVA/TTC + vendeur.

## Décision

- Normaliser tous les builders en `#fff/#000` seuls (bordures `#000`, header `#fff`, barcode `fill #000`, `body{background:#fff;color:#000}`), logo `<img style="filter:grayscale(1) contrast(1.15)">` partout.
- Champs `ReceiptData` optionnels rétro-compatibles : `seller`, `tvaRatePercent`, `htMinor`, `tvaMinor`, `qrPayload`, `qrSvg`. TVA = 0 → rendu historique inchangé (tests existants verts) ; > 0 → lignes `Total HT / TVA (x%)` (centimes, `tvaBreakdown`, `ht+tva == ttc` validé Zod).
- QR : payload déterministe `VELORIA|N°|TTC|DATE|RC|NIF|VENDEUR` (`buildQrPayload`) + SVG réel généré côté main via lib `qrcode` (`create` synchrone → rects `#000` sur `#fff`), injecté comme le logo (builders restés purs/testables). Échec QR = payload texte seul, jamais bloquant.
- Nouvelle dépendance `qrcode` (pure JS, externe esbuild, empaquetée par electron-builder) — seule option honnête vs fausse matrice « QR-like » (interdite zero-tolerance).
- `sale-ticket.ts` remplit `seller` depuis `sale.seller/cashier/created_by`.

## Conséquences

- Facture complète : RC/NIF + vendeur + QR + HT/TVA/TTC + lettres + signatures + footer.
- Tests : `p0-print-bw-qr-tva.test.ts` (N&B regex, TVA centimes, vendeur, QR déterminisme).
