# METRICS — indicateurs du projet (source unique)

<!-- Fichier GÉNÉRÉ : la section entre marqueurs est réécrite par
     `node scripts/quality/verify-docs.mjs --write`. Ne pas éditer à la main. -->

> **Règle (ADR-178)** : ce fichier est la **seule** porte des indicateurs du
> projet. Les documents (README, STRUCTURE, INDEX) y **renvoient** — ils ne
> recopient plus aucun nombre. La porte `npm run verify:docs` recalcule les
> compteurs depuis le code et **échoue** si cette section est périmée ou si
> un littéral obsolète réapparaît dans un document vivant.
>
> **Ce qui n'est PAS figé ici, volontairement** : le nombre de _cas de test_
> exécutés (il dépend de la collecte de Vitest et bouge à chaque cas
> ajouté) ni les durées. Mesure-les à la demande : `npm test`.
> Seuls des compteurs **structurels et déterministes** sont figés ici.

<!-- GENERATED:verify-docs:START -->

<!-- Mesuré par `node scripts/quality/verify-docs.mjs --write` le 2026-11-10. -->

| Indicateur | Valeur |
| --- | --- |
| Migrations SQL (numérotées, immuables) | 62 (0001..0062) |
| Tables réelles (hors `*_new` temporaires) | 48 |
| ADRs (décisions) | 178 (jusqu'à ADR-178) |
| Canaux IPC déclarés | 192 |
| Canaux IPC servis (snapshot gelé) | 191 |
| Fichiers de test (unit + integration + database) | 194 |
| Specs E2E (Playwright) | 26 |
| Modules de la coquille POS | 16 |
| Pages de licence | 17 |
| Features de licence | 14 |
| Dossiers du domaine (`src/domain`) | 22 |

<details><summary>Listes (référence, non volatiles)</summary>

**Pages de licence (17)** : dashboard, sales, products, stock, customers, suppliers, debts, expenses, returns, history, reports, pain, breadOrders, proformas, invoices, zakat, settings.

**Features de licence (14)** : receipt-80mm, invoice-a4, automatic-backup, restore-backup, barcode-scanner, ocr, excel-export, pdf-export, debt-management, partial-payments, returns, proformas, advanced-reports, multi-printer.

**Dossiers du domaine (22)** : backup, barcode, cash, closings, common, customer, expenses, import, inventory, invoice, money, ocr, packaging, pricing, print, product, proforma, returns, sales, suppliers, units, zakat.

</details>
<!-- GENERATED:verify-docs:END -->
