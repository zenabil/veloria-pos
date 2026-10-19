# ADR-119 — Lot 2 du nettoyage dead-code : 3 canaux IPC morts, 3 fonctions repo orphelines

## Contexte

Suite d'ADR-118 (lot 1, code mort sûr). L'audit dead-code du 2026-10-18
(`docs/reports/DEAD_CODE_AUDIT_2026-10-18.md`) avait identifié **6 canaux IPC**
définis, exposés par le preload, servis par un handler validé Zod… et **appelés
par personne** (aucune des deux voies renderer : ni wrapper `api.*`, ni appel
direct `call((a) => a.<ns>.<méthode>())`).

Le présent ADR arbitre le lot 2. Il évolue **un contrat gelé** (canaux IPC),
donc ADR obligatoire (même fondement que ADR-075).

## Décision (supprimé)

### Canaux retirés (3)

| Canal           | Définition    | Preload         | Handler                     | Schéma                         |
| --------------- | ------------- | --------------- | --------------------------- | ------------------------------ |
| `sync.markSent` | `channels.ts` | `preload.ts:60` | `registry.customers.ts:163` | `idempotentIdSchema` (partagé) |
| `sync.pending`  | `channels.ts` | `preload.ts:61` | `registry.customers.ts:170` | `syncPendingSchema` (dédié)    |
| `stock.ledger`  | `channels.ts` | `preload.ts:94` | `registry.stock.ts:14`      | `idSchema` (partagé)           |

### Fonctions repo devenues orphelines (3, retirées dans la foulée)

| Fonction               | Fichier                              | Seul appelant avant retrait |
| ---------------------- | ------------------------------------ | --------------------------- |
| `markOutboxSentAtomic` | `ipc/handlers/client-access.repo.ts` | le handler `sync.markSent`  |
| `listPendingOutbox`    | `ipc/handlers/client-access.repo.ts` | le handler `sync.pending`   |
| `Inventory.getLedger`  | `ipc/handlers/inventory.repo.ts`     | le handler `stock.ledger`   |

### Synchronisation des gardes (obligatoire)

| Garde                                                           | Avant                                  | Après                                                      |
| --------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `tests/unit/__snapshots__/ipc-channels.json`                    | 180 entrées                            | **176**                                                    |
| `IPC_CHANNELS` (`channels.ts`)                                  | 180 clés                               | **177** (176 servis + `window.maximizedChanged` push-only) |
| `tests/unit/validators-inventory.test.ts` `FROZEN_SCHEMA_COUNT` | 114                                    | **113** (`syncPendingSchema` retiré)                       |
| `tests/integration/retention-critical.test.ts`                  | vecteur `"sync.markSent"`              | **retiré** (vecteur fantôme)                               |
| `tests/unit/client-access.test.ts`                              | import + assertion `syncPendingSchema` | **retirés**                                                |

## Justification technique — pourquoi ces canaux sont morts et non « planned »

C'est le point qui distingue ce lot de `announcements.save` (conservé, §Conservé).

**`pushNowAtomic` marque la file `'sent'` lui-même**, dans sa propre
transaction (`electron/sync/sync.service.ts:263-270`) :

```ts
const tx = db.transaction(() => {
  claimIdempotency(args.operationId, "sync.pushNow", args.now);
  for (const r of outboxRows) {
    db.prepare(`UPDATE sync_outbox SET status = 'sent', sent_at = ? WHERE operation_id = ?`).run(...);
  }
```

`markOutboxSentAtomic` **n'est jamais appelé** par ce chemin. De même,
`pushNowAtomic` lit lui-même les lignes `pending` (`sync.service.ts:212-216`),
ce qui rend `listPendingOutbox` redondant. Les deux canaux `sync.*` retirés
sont donc **supersédés techniquement**, et non « une interface manquante ».

**La garde de rétention reste correcte** : `electron/database/retention.ts:51`
protège par **préfixe** `"sync."`, pas par nom exact. `sync.enqueue`,
`sync.pushNow` et `sync.saveConfig` subsistent → la couverture 365 j est
intacte. Seul le commentaire de `retention.ts:42` (qui listait `markSent`) a
été corrigé.

**`stock.ledger`** : `Inventory.getLedger` n'avait aucun autre appelant, et
aucun test ne le référençait (recherche exhaustive : 0 résultat hors
définition + handler).

## Conservé — décisions de non-suppression

- **`announcements.save` — CONSERVÉ.** Le domaine (`assertValidAnnouncement`,
  `CLIENT_ANNOUNCEMENT_MAX`), le repo (`saveAnnouncementAtomic`), le validateur
  Zod et le handler sont **cohérents et complets** ; **seule l'interface
  manque**. Supprimer le canal reviendrait à déclarer la fonctionnalité
  abandonnée — ce n'est pas du code mort, c'est un manque produit. Décision
  reportée à l'opérateur (cf. rapport §2.4 / DT-04).
- **`templates.get` — CONSERVÉ (hors périmètre).** Le schéma
  `templateGetSchema` réside dans `electron/ipc/validators.templates.ts`, fichier
  **du chantier impression non commité** : le retirer mélangerait deux
  chantiers dans un même commit. Idem pour le handler `printer.get`
  (`electron/printing/printing.receipt.ts`).
- **`printer.get` — CONSERVÉ (hors périmètre)**, même raison.
- **`RAW_GUARDED_CHANNELS` — CONSERVÉ.** Ce n'est pas du code mort : c'est un
  **garde-fou de revue** (le commentaire `:30` le dit). Le constat est
  qu'il n'est **pas appliqué** — voir §Dette du lot 2.

## Conséquences

- **Surface bridge : 180 → 177 canaux** (176 servis + 1 push-only).
- `FROZEN_SCHEMA_COUNT` : 114 → 113, sous le présent ADR (évolution autorisée,
  comme ADR-075 §3 et ADR-109).
- **Aucun comportement change** : les 3 canaux n'avaient aucun appelant, et les
  3 fonctions repo retirées n'étaient atteintes que par ces handlers.
- `announcements.save`, `sync.enqueue`, `sync.pushNow`, `sync.getConfig`,
  `sync.saveConfig`, `stock.overview`, `stock.products`, `stock.movements`,
  `stock.inventory`, `stock.adjust`, `stock.intake`, `stock.intakes` :
  **intacts**.
- **Op_types d'idempotence** : `sync.markSent` disparaît comme `op_type`
  (il n'était produit que par la fonction retirée). `sync.enqueue`,
  `sync.pushNow`, `sync.saveConfig` sont **inchangés** et restent protégés par
  le préfixe `"sync."`.

## Dette ouverte (constatée, non traitée — hors périmètre code mort)

1. **`RAW_GUARDED_CHANNELS` n'est appliqué par rien.**
   `electron/ipc/raw-guards.ts:31` liste les canaux bruts, mais
   `enforceRawChannelGates` (`:17`) **ne consulte jamais cette liste** : il
   délègue à `enforceStaffGates(channel, input)`. Un nouveau handler brut
   peut donc être ajouté **sans qu'aucune porte ne tombe**. Le commentaire
   `:30` (« garde-fou de revue : tout nouveau handler brut doit s'y ajouter »)
   est un checklist humain, pas un invariant appliqué. _Un test
   d'énumération le rendrait effectif — c'est un ajout de code, donc hors du
   périmètre « code mort »._
2. **La garde `bridge-shape` ne couvre que les noms `*Schema`**
   (`tests/unit/bridge-shape.test.ts:72` : `/export const (\w+Schema)/g`). Un
   validateur Zod portant un autre nom **échappe à la garde** — c'est
   exactement ce qui a permis à `expirationDate` (ADR-118) de survivre.
3. **Validateur `expirationDate` effectivement câblé = le plus laxiste des
   deux** (`validators.catalog.ts:29` : `z.string().nullable().optional()`,
   sans `isRealCalendarDate`), alors que la version stricte a été retirée en
   ADR-118 comme « non câblée ». `productCreate` accepte donc `2026-13-45`.
   _À corriger, pas à supprimer — hors périmètre code mort._

## Vérification

Toutes les portes vertes, dans l'ordre AGENTS.md §8 :

| Porte                               | Avant                  | Après                                        |
| ----------------------------------- | ---------------------- | -------------------------------------------- |
| `npm run format`                    | —                      | ✓                                            |
| `npm run typecheck` (`tsc -b`)      | 0 erreur               | **0 erreur** (manifeste signé, 214 fichiers) |
| `npm run typecheck:electron`        | ✓                      | ✓                                            |
| `npm run typecheck:manager`         | ✓                      | ✓                                            |
| `npm run lint` (`--max-warnings 0`) | 0                      | **0** (exit 0)                               |
| `npm run test`                      | 804/804 (121 fichiers) | **804/804 (121 fichiers)**                   |
| `npm run build`                     | ✓                      | ✓                                            |
| `npm run build:electron`            | ✓                      | ✓                                            |
| `npm run verify:migrations`         | VERIFIED               | **MIGRATIONS VERIFIED**                      |
| `npm run verify:domain`             | VERIFIED               | **DOMAIN VERIFIED**                          |
| `graphify update .`                 | —                      | ✓                                            |

**Gardes de contrat rejouées en isolation** (37 assertions) :
`bridge-shape` 3/3 · `ipc-channel-inventory` 2/2 · `validators-inventory` 2/2 ·
`operation-id-coverage` 2/2 · `channel-alias` 4/4 · `client-access` 24/24.

**Preuve de non-régression** : `804 → 804`. Le compteur de tests est par
`it()`, pas par assertion : la suppression de l'assertion
`syncPendingSchema.safeParse(...)` **à l'intérieur** d'un `it()` existant ne
change pas le total — cohérent.

## Lot 2 bis — `knip.json` (bruit d'outillage)

Fichier de configuration ajouté dans le même lot, **zéro changement de code** :

| Métrique                                        | Avant   | Après  |
| ----------------------------------------------- | ------- | ------ |
| Candidats bruts `knip`                          | **219** | **30** |
| Faux positifs (fichiers d'entrée multi-paquets) | 32      | **0**  |
| `Unused files`                                  | 32      | **0**  |

Clé : `ignoreExportsUsedInFile: true` — le dépôt exporte massivement des
règles pures consommées **dans leur propre fichier** ; knip ne comptait pas
cette usage et signalait 219 candidats là où il y en a 30.

Les 27 `unused exports` restants sont **exactement** les findings vérifiés
manuellement de l'audit (les 24 réexports `receipt-documents*`, hors chantier
impression, + `buildActivationQrPayload` + `clearSecureState`). **Aucun
faux positif résiduel.**

## Fichiers affectés

16 fichiers de code/test + 2 fichiers de documentation + `knip.json`.
Point de retour arrière : `git revert` du commit (aucune donnée, aucun schéma,
aucune migration).
