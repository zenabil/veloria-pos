# ADR-069 — Réparation facture TVA/vendeur (clés invoice désalignées)

Date : 2026-10-05. Audit Zero-Problème 17 modules.

## Contexte

`InvoiceSection` (renderer, `src/features/settings/SettingsSectionsB.tsx`)
écrivait `app_settings.invoice = { vatRate, defaultSeller, … }` tandis que
le main lisait `{ tvaRatePercent, sellerDefault }`
(`electron/printing/printing.service.ts#applyInvoiceSettings`) et que le
schéma Zod (`electron/ipc/validators.ts#invoiceSettingsSchema`) ne connaissait
que les clés canoniques. Zod `strip` supprimait silencieusement `vatRate` /
`defaultSeller` : le taux TVA et le vendeur par défaut réglés en Paramètres
n'étaient **jamais appliqués** aux impressions réelles (tickets, factures,
reçus). Load-bearing : perte silencieuse de réglage fiscal.

## Décision

Normalisation bi-directionnelle, sans migration (aucun changement de schéma
SQL, `verify-migrations` untouched) :

1. `validators.ts#invoiceSettingsSchema` : accepte les aliases historiques
   `vatRate` / `defaultSeller` (optionnels) + `.transform()` vers les clés
   canoniques `tvaRatePercent` / `sellerDefault`.
2. `printing.service.ts#applyInvoiceSettings` : double lecture
   (`tvaRatePercent ?? vatRate`, `sellerDefault ?? defaultSeller`) pour les
   bases déjà écrites avec les anciennes clés.
3. `SettingsSectionsB.tsx#InvoiceSection` : lit les deux formes, édite
   `vatRate`/`defaultSeller`, écrit les **quatre** clés à chaque save.
4. `use-app-settings.ts#DEFAULTS.printing.thermalWidth` : `"80"` → `"80mm"`
   (cohérence avec le schéma `printingSettingsSchema`).

## Conséquences

- La TVA Paramètres → Facturation s'applique réellement aux documents
  imprimés (vérifié : `printing.service.ts:229-247`, tests `settings`,
  `ipc-contracts`, `p0-print-bw-qr-tva` verts).
- Anciennes bases (clés legacy) continuent de fonctionner (double lecture).
- Correctifs UI joints (même vague) : `operationId` suppression dépense
  tiroir, Zakat export/loading, Dettes KPI fournisseurs, Bread grille ×5,
  Stock `formatDzd` direct + déduplication OCR, glyphes `✕` → lucide `X`,
  `notify` relevé client, `Exercice <année>`, refs clavier stables,
  `Archive` catalogue, i18n mobile `staleData`.

## Vérification

`format` + `typecheck` + `test` (565/565) + `build` + `verify:migrations`
verts le 2026-10-05.
