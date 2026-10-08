# ADR-NEW — Slices verticaux : audit sales/customers/stock + use-case stock manquant

## Contexte

AGENTS.md #7 impose le slice vertical complet :
`features/<x>/<X>Screen.tsx` → `application/<x>/<action>.ts` → `domain/<x>/*-rules.ts`
→ `electron/*/repo.ts` (prepared statements) → `database/migrations/NNNN_*.sql`
(nouveau uniquement) → `tests/unit+integration`.

Affirmation d'entree (« 10 dossiers vides + 2 fichiers dans `src/application/` ») :
**infirmee par inspection** — `src/application/` contient exactement 2 dossiers
non vides (`customers/client-access.ts`, `sales/create-sale.ts`), 0 dossier vide,
0 placeholder (`grep -ri placeholder|todo|stub src/application` = vide).
Preuve `find` (equivalent node, Windows sans `find` POSIX) : `[]` sous
`src/application/`, `src/domain/`, `src/features/`. **Rien a supprimer.**

## Decision (audit par slice, le 2026-10-07)

| Slice     | UI → use-case → domain → repo → migration → test                                                                                                                                                                                                                               | Statut                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| sales     | `SellScreen` → `application/sales/create-sale.ts` (`buildSalePayload`, operationId fourni) → `domain/sales/sale-rules.ts` → `sales.repo.ts` (tx + operationId + prepare) → 0020/0021/0022/0027/0031 → `create-sale-idempotency`, `atomic-slices`                               | Complet, rien a creer                |
| customers | `ClientsScreen`/`ClientDialogs` → `application/customers/client-access.ts` (operationId fourni) → `domain/customer/*` → `customers.repo.ts` + `client-access.repo.ts` (tx + operationId + prepare) → 0006/0007/0032/0033/0034/0039 → `clients`, `client-access`, `client-loop` | Complet, rien a creer                |
| stock     | `StockScreen`/`dialogs/*` → **MANQUANT** → `domain/inventory/*` → `inventory.repo.ts` (`adjustStockAtomic`, `receiveStockAtomic`, 1 tx + operationId + prepare) → 0009/0017/0018/0037 → `stock`, `fifo-layers`, `atomic-slices`                                                | **Bouche ce jour** (voir ci-dessous) |

Pas de nouvelle migration : le schema stock existe deja (0009 plafonds,
0017 `intake.operation_id`, 0018 couches FIFO, 0037 garde non-negative).
Creer une migration sans besoin schema violerait le principe (migration sans
test / sans objet). Pas de nouvel IPC : `stock.adjust` existe deja
(`domain.action` + `stockAdjustSchema` Zod + contrat `api.stockAdjust` +
preload `stock.adjust`, pas de `run-sql` — grep `run-sql` dans `electron/` ne
trouve que les commentaires d'interdiction).

## Changement (slice stock — seul delta)

- `src/application/stock/adjust-stock.ts` (nouveau, PUR, 0 IO) :
  `buildAdjustStockPayload(draft)` — valide operationId fourni (refus explicite),
  produit, calcule `newQuantity` via `computeAdjustmentNewStock` (domaine),
  construit `reason` (`préfixe FR : motif — notes`, miroir des bornes Zod
  2..300 / notes 500 / reference 100), retourne la charge `stock.adjust`.
  Le français reste cote UI (`reasonPrefix` fourni par le dialogue).
- `src/features/stock/dialogs/AdjustmentDialog.tsx` : `save()` appelle le
  use-case (mêmes regles, mêmes messages FR — deplacement verbatim).
- `tests/unit/stock/adjust-stock.test.ts` (5 tests) : charge + operationId
  rejoue, in/out/set + jamais negatif, notes/reference, refus (operationId,
  produit, motif, notes), **parite Zod** (`stockAdjustSchema.safeParse` vert).

## Reparation drive-by (bloquante, zero semantique)

Le decoupage `validators.*.ts` (autre chantier) avait perdu des imports :
`quantityNonNegative`/`quantity`/`optionalOperationId` non importes dans
`validators.{catalog,stock,customers,documents,finance,print,sales,settings}.ts`
(`ReferenceError` au chargement du barrel → suites `clients`,
`client-access`, `invoice-flows`, `stock` en echec de collecte),
`expirationDate` nu dans `catalog` (restaure a l'identique HEAD
`z.string().nullable().optional()`), `optionalOperationId` redeclare dans
`catalog` (doublon supprime), `expirationDate` inutilise dans `common`
(exporte pour TS6133). Imports uniquement — aucun schema, channel, message
ou borne modifie.

## Preuves (2026-10-07)

- `find` vide : `[]` (rien supprime, correctement).
- `npm run verify:migrations` : 40/40 OK + invariants OK, `MIGRATIONS VERIFIED`.
- `npm run verify:domain` : `DOMAIN VERIFIED` (30 checks).
- `vitest tests/database tests/integration` : **21 fichiers / 94 tests verts**.
- `vitest` scope slice : `adjust-stock` 5/5 + `stock` 10/10 + `clients`,
  `client-access`, `invoice-flows`, `validators-inventory` verts (52/52).
- `typecheck:electron` : vert. `typecheck` renderer : 1 erreur restante dans
  `tests/unit/ipc-channel-inventory.test.ts` (fichier `??` d'un chantier
  voisin, non touche).
- `eslint --max-warnings 0` sur les 11 fichiers touches : vert.
