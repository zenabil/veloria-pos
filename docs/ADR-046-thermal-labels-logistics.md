# ADR-046 — Thermique 58/80mm + étiquettes multi-formats + docs logistiques

> Statut : accepté (Phase 2, P0-2/3/4). Fichiers : `electron/printing/*`, `electron/ipc/*`, `electron/preload/preload.ts`, `src/vite-env.d.ts`, `src/shared/types/ipc-client.ts`, UI impression/étiquettes/fournisseurs/retours/historique.

## Contexte

Audit P0 : 80mm seul (`thermalHtml 280px`), 0 hit 58mm, pas d'ESC/POS natif, étiquettes planche A4 3×8 fixe, pas de BL émis, BC/retour via aperçu générique, pas de canaux dédiés.

## Décision

- Thermique : `printingSettingsSchema.thermalWidth: 58mm|80mm` (SQLite `app_settings.printing`, défaut 80mm). `thermalHtml(text, width)` : 58mm = 200px/11px, 80mm = 280px/12px, fond `#fff`. USB/Réseau/Bluetooth via pilote système (imprimantes `getPrintersAsync`, fail-closed si configurée introuvable — pas de module natif ESC/POS, documenté dans l'UI). Export PDF 58mm = 58000µm.
- Étiquettes : `labelsPayloadSchema.format: 30x20|50x30|58x40|A4-24|custom` + `customWidthMm/HeightMm`, `buildLabelsHtml(items, opts)` (`@page` mm, N&B, Code39 `#000`, grayscale). 200 ex. max conservé. Aperçu vivant = même HTML.
- Docs : builders purs `buildDelivery(Html/Text)`, `buildReturnSlip(Html/Text)`, `buildPurchaseOrder(Html/Text)` (hiérarchie INVOICES_DESIGN, N&B, QR+Code39) + schémas Zod (`deliveryPayloadSchema`, `returnSlipPayloadSchema`, `purchaseOrderDocPayloadSchema` via `printPayloadSchema.innerType().extend` — `ZodEffects` non-extensible directement) + 6 canaux `printing.previewDelivery/printDelivery/previewReturnSlip/printReturnSlip/previewPO/printPO` (guards licence, prévisualisation + impression A4/thermique). Préload + `ipc-client` + `vite-env.d.ts` exposés. Test `bridge-shape` : `labelFormatSchema` ajoutée aux schémas imbriqués exemptés.
- UI : sélecteur 58/80 + matrice docs étendue (BL/BR/BC), formats étiquettes + custom, boutons PO/retour/livraison dans leurs écrans (payloads retotalisés `round(prix×qté)`).

## Conséquences

- Tous documents : aperçu vivant, impression A4+thermique, N&B, QR. Tests `p0-logistics-labels-backup.test.ts`.
