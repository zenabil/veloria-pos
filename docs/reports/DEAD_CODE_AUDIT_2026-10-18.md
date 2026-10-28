# Audit dead-code — Veloria PoS (2026-10-18)

> **Phase A — audit seul. Zéro suppression.** Conformément à AGENTS.md §13/§14 et
> ADR-075 (« audit d'abord, jamais de suppression automatique »), ce document
> est un **rapport d'inventaire**. Aucune suppression ne peut être entreprise sans
> approbation textuelle explicite de l'opérateur, lot par lot (§6).

---

## 1. Résumé exécutif

| Axe                                     | Résultat                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Surface analysée                        | `src` · `electron` · `license-manager` · `mobile` · `cloud` · `private` · `tests` · `scripts` · `public` · `resources` · racine |
| Fichiers TS/TSX du dépôt (hors généré)  | ≈ 213 (référence `tsc -b` handoff §1)                                                                                           |
| Candidats bruts produits par les outils | **219** (knip : 32 fichiers + 192 exports + 77 types + 1 doublon)                                                               |
| Faux positifs réfutés (avec preuve)     | **212**                                                                                                                         |
| **Findings réels**                      | **47** (6 critiques · 31 sûrs · 6 « décision » · 4 hygiène)                                                                     |
| **Suppression proposée immédiatement**  | **31 findings, ≈ 175 LOC, 0 changement de comportement**                                                                        |
| Canaux IPC sans appelant renderer       | **6** (sur 180 canaux définis)                                                                                                  |
| Dépendances supprimables                | **0**                                                                                                                           |
| Dépendances à **ajouter** (manquantes)  | **1** (`@eslint/js`)                                                                                                            |

**Les trois conclusions structurantes :**

1. **Aucune classe de code mort « évidente » ne subsiste.** Sur 219 candidats
   bruts, la quasi-totalité sont des _points d'entrée_ (esbuild/Expo/Deno/electron-builder)
   ou des exports dont le seul consommateur est le fichier qui les définit —
   un motif applicatif légitime (« exporter une règle pure, la consommer
   localement »). Les outils statiques ne modélisent ni les entry points
   multi-paquets, ni ce motif : **le ratio 212/219 est un signal de santé du
   dépôt, pas un signal de désordre**.
2. **Le seul vrai gisement est la couche IPC** : 6 canaux sont définis,
   exposés par le preload, servis par un handler validé Zod… et **appelés par
   personne**. C'est la même signature que les 10 canaux retirés par ADR-075.
3. **Un constat plus grave que du code mort** : deux gardes censées protéger
   le dépôt ne sont pas appliquées (`RAW_GUARDED_CHANNELS` non branché), et un
   validateur Zod mort survit précisément parce que la garde `bridge-shape` ne
   couvre que les noms suffixés `*Schema` (§4.1, §4.2).

### 1.1 État git (référence de l'audit)

```
branche  : chore/root-layout
HEAD     : 4af12657a54050955ae9bb4c390c8f72bfd0ca6d
sujet    : docs(handoff): session 2026-10-18 quater - complement modele
           gratuit recommande (audit dead-code)
```

**Arbre NON propre — 13 fichiers modifiés + 3 nouveaux, tous liés au chantier
impression « modèle gratuit recommandé » :**

- Modifiés (13) : `electron/ipc/validators.templates.ts`,
  `electron/printing/{printing.enrich,printing.logistics,printing.payment,printing.pdf-exports,printing.receipt,printing.reports-labels,printing.samples,printing.studio,printing.templates}.ts`,
  `electron/printing/receipt-documents.ts`,
  `electron/printing/receipt-documents/{common,labels,logistics,payment-ticket,receipt-text,thermal}.ts`,
  `src/domain/print/template-rules.ts`, `src/features/print-templates/PrintTemplatesScreen.tsx`,
  `tests/unit/c6-studio.test.ts`
- Nouveaux (3) : `electron/printing/printing.capabilities.ts`,
  `src/domain/print/template-capabilities.ts`,
  `src/features/print-templates/TemplateSettingsPanel.tsx`

> **⚠ VERROU DE PHASE B.** Ce chantier est **sans rapport** avec l'audit dead-code.
> Conformément à la consigne « si un travail non lié non commité est trouvé —
> s'arrêter et demander », **aucun lot de suppression ne peut démarrer** avant
> que l'opérateur ne commite ou ne range ce chantier. Les fichiers listés
> ci-dessus sont **hors périmètre** de tous les lots proposés.

### 1.2 Outils et méthode

| Outil                | Version                             | Rôle                                           | Statut                   |
| -------------------- | ----------------------------------- | ---------------------------------------------- | ------------------------ |
| `npx --yes knip`     | 6.42.0                              | fichiers/exports/dépendances non utilisés      | 219 candidats bruts      |
| `npx --yes depcheck` | —                                   | dépendances non listées / inutilisées          | 1 vraie trouvaille       |
| `graphify`           | local (`~/.local/bin/graphify.exe`) | graphe `graphify-out/` disponible (8,9 Mo)     | consulté (wiki + graphe) |
| `grep` (ripgrep)     | —                                   | **vérification exhaustive de chaque candidat** | méthode de preuve        |
| `tsc` / `eslint`     | —                                   | état `noUnusedLocals` déjà actif (voir §4.3)   | —                        |

> **Note `rg` :** le binaire `rg` n'est **pas** sur le PATH de cette machine.
> L'audit s'est appuyé sur l'outil `grep` du harness (basé ripgrep) + `glob` +
> `read`, avec repli `Select-String` en PowerShell. Aucun tiers n'a été ajouté à
> `package.json` ni aux lockfiles.

**Répartition du travail :** 4 sous-agents de lecture seule (`explore`) ont
couvert `src/`, `electron/`, `tests/+scripts/+racine+dépendances`, et
`license-manager/+mobile`. La **couche IPC à trois niveaux** (définition →
preload → appel renderer) a été vérifiée **directement et en redondance** par
l'auditeur, car c'est la surface la plus risquée.

### 1.3 Portes de référence mesurées

| Porte                       | Référence HEAD (handoff §1) | Mesuré pendant cet audit           |
| --------------------------- | --------------------------- | ---------------------------------- |
| `tsc -b`                    | 0 erreur (213 fichiers)     | non relancé (arbre sale)           |
| `eslint . --max-warnings 0` | 0                           | non relancé (arbre sale)           |
| `vitest run`                | 794/794 (121 fichiers)      | **804/804 (121 fichiers)** — 305 s |
| `verify:migrations`         | VERIFIED                    | non relancé                        |
| `verify:domain`             | VERIFIED                    | non relancé                        |

> L'écart 794 → **804** provient des 10 tests du chantier impression non
> commité (`tests/unit/c6-studio.test.ts` est modifié). La suite est verte
> **malgré** l'arbre sale : la référence de tout lot Phase B doit être
> re-mesurée sur arbre propre.

---

## 2. Findings — classés par criticité

Légende de confiance :
**PROUVÉ** = zéro référence réelle · **DYNAMIC-RISK** = consommé dynamiquement ·
**TEST-ONLY** = référencé uniquement depuis `tests/` · **DUPLICATE** = deux
définitions de la même chose · **DELIBERATE-KEEP** = déjà tranché par un ADR.

---

### 2.1 CRITIQUE — canaux IPC sans appelant renderer (6)

**Méthode de preuve (3 niveaux, appliquée à la totalité des 180 canaux) :**

1. **Définition** — `electron/ipc/channels.ts` : 180 clés (181 avec
   `window.maximizedChanged`, push-only).
2. **Exposition** — `electron/preload/preload.ts` : 180 entrées.
   → _Aucune couche 1 orpheline._
3. **Appel** — deux voies possibles côté renderer : (a) le wrapper
   `api.<nom>()` de `src/shared/types/ipc-client.ts`, (b) un appel direct
   `call((a) => a.<ns>.<méthode>(...))`. **Les deux voies ont été balayées.**

> **Piège écarté — `recovery.retry` / `recovery.exit`.** Un premier passage les a
> classés morts (absents de `ipc-client.ts`). **Réfutés** : ces deux canaux sont
> appelés depuis le **HTML généré côté main**, qui accède au pont par chaîne :
> `electron/main/recovery-view.ts:95,100` et `electron/main/license-view.ts:95`.
> C'est le cas `DYNAMIC-RISK` le plus dangereux du dépôt — invisible à toute
> analyse statique. **Ils sont vivants.**

| ID         | Canal                | `channels.ts` | preload | handler                     | appelant renderer |
| ---------- | -------------------- | ------------- | ------- | --------------------------- | ----------------- |
| **IPC-01** | `announcements.save` | `:58`         | `:67`   | `registry.customers.ts:173` | **AUCUN**         |
| **IPC-02** | `sync.markSent`      | `:53`         | `:60`   | `registry.customers.ts:163` | **AUCUN**         |
| **IPC-03** | `sync.pending`       | `:54`         | `:61`   | `registry.customers.ts:170` | **AUCUN**         |
| **IPC-04** | `stock.ledger`       | `:67`         | `:94`   | `registry.stock.ts:14`      | **AUCUN**         |
| **IPC-05** | `templates.get`      | `:172`        | `:150`  | `registry.system.ts:91`     | **AUCUN**         |
| **IPC-06** | `printer.get`        | `:168`        | `:144`  | `printing.receipt.ts:102`   | **AUCUN**         |

**Preuve — recherche exhaustive (toutes extensions, tout le dépôt) :**

```
grep "announcementSave|printerGet|stockLedger|syncMarkSent|syncPending|templateGet"
  → 18 résultats, dont 6 définitions dans src/shared/types/ipc-client.ts
    (lignes 46, 47, 51, 53, 135, 146) et 0 appel.
```

**Preuve complémentaire — aucun appel direct du pont :**

```
grep "a\.(announcements|printer|stock|templates|sync|customers)\." path=src, include=*.tsx
  → 11 résultats, tous sur des canaux VIVANTS
    (customers.recordPayment, customers.search, customers.access*,
     sync.enqueue, sync.getConfig, sync.pushNow)
```

**Empreinte complète du contrat** (ce qu'un lot de suppression devrait toucher) :

| Fichier                                        | Occurrences                                  |
| ---------------------------------------------- | -------------------------------------------- |
| `electron/ipc/channels.ts`                     | 6                                            |
| `electron/preload/preload.ts`                  | 6                                            |
| `src/vite-env.d.ts`                            | 6 (types uniquement)                         |
| `src/shared/types/ipc-client.ts`               | 6 (wrappers)                                 |
| `electron/ipc/license-gates.ts`                | 6 (`:30,31,115,116,120,125`)                 |
| `electron/ipc/staff-gates.ts`                  | 4 (`:31,62,118,120`)                         |
| `electron/ipc/registry.customers.ts`           | 3 handlers                                   |
| `electron/ipc/registry.stock.ts`               | 1 handler                                    |
| `electron/ipc/registry.system.ts`              | 1 handler                                    |
| `electron/printing/printing.receipt.ts`        | 1 handler                                    |
| `tests/unit/__snapshots__/ipc-channels.json`   | 6 (180 → **174**)                            |
| `tests/unit/staff-domain.test.ts`              | 1 (`:175`, fixture texte)                    |
| `tests/integration/retention-critical.test.ts` | 3 (`:67,68,73`, listes de canaux)            |
| `tests/unit/printing/split-parity.test.ts`     | 1 (`:254`, `"printer.get"`)                  |
| `tests/unit/client-access.test.ts`             | 3 schémas testés directement                 |
| `tests/database/pin-algo-guard.test.ts`        | 2 (`customers.accessActivate`, non concerné) |

**Validateurs Zod qui deviennent morts** (la garde `bridge-shape`
« uses every Zod validator » les tuerait à la suppression du handler) :

| Schéma                   | Fichier:ligne                | Compteur gelé |
| ------------------------ | ---------------------------- | ------------- |
| `syncPendingSchema`      | `validators.customers.ts:92` | 114 → 113     |
| `announcementSaveSchema` | `validators.customers.ts:96` | 113 → 112     |
| `templateGetSchema`      | `validators.templates.ts:58` | 112 → **111** |

> `sync.markSent` (→ `idempotentIdSchema`), `stock.ledger` (→ `idSchema`) et
> `printer.get` (→ `emptyPayloadSchema`) réutilisent des schémas **partagés**
> (respectivement 1, 1 et 15+ autres handlers) : leur retrait ne touche pas le
> compteur gelé.

**Recommandation : `delete` — lot 2, sous réserve d'un ADR dédié (§6).**

#### 2.1.1 Rectificatif critique — la cascade de second ordre (2026-10-19)

**Découvert à l'exécution du lot 1, en traçant le flux `sync` :** le tableau
ci-dessus sous-estime la surface du lot 2. Chaque handler retiré **orpheline une
fonction repo**, et l'une d'elles change la lecture du problème.

| Canal retiré    | Fonction repo orphelinée                             | Preuve                                                 |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `sync.markSent` | `markOutboxSentAtomic` (`client-access.repo.ts:562`) | Seul appelant : le handler `registry.customers.ts:164` |
| `sync.pending`  | `listPendingOutbox` (`client-access.repo.ts:595`)    | Seul appelant : le handler `registry.customers.ts:171` |
| `stock.ledger`  | `Inventory.getLedger` (`inventory.repo.ts:58`)       | Seul appelant : le handler `registry.stock.ts:15`      |

**Le fait qui change la conclusion sur `sync.markSent` / `sync.pending` :**
`pushNowAtomic` marque **lui-même** la file comme `'sent'`, dans **sa propre
transaction** (`electron/sync/sync.service.ts:263-270`) :

```ts
const tx = db.transaction(() => {
  claimIdempotency(args.operationId, "sync.pushNow", args.now);
  for (const r of outboxRows) {
    db.prepare(`UPDATE sync_outbox SET status = 'sent', sent_at = ? WHERE operation_id = ?`).run(...);
  }
  ...
```

`markOutboxSentAtomic` **n'est jamais appelé** par ce chemin. Ces deux canaux
sont donc **supersédés techniquement**, et non « une UI manquante » — ce qui
**renforce** leur classement en code mort (contrairement à `announcements.save`,
§2.4/DT-04, où le domaine et le repo existent et seule l'UI manque).

**Conséquence sur les gardes :**

- `electron/database/retention.ts:51` protège par **préfixe** `"sync."`, pas par
  nom exact : `sync.enqueue`, `sync.pushNow` et `sync.saveConfig` subsistent →
  **la garde de rétention reste correcte**.
- `tests/integration/retention-critical.test.ts:70` liste `"sync.markSent"` dans
  ses vecteurs de test. L'entrée devient **fantôme** (le préfixe la couvre
  toujours) : à retirer pour ne pas documenter un `op_type` inexistant, **sans
  effet sur la passe/fail**.
- Le commentaire `retention.ts:42` (« `sync.` enqueue/markSent/pushNow/saveConfig »)
  devient faux et doit être corrigé dans le même lot.

**Portée réelle du lot 2, révisée :** 6 canaux + **3 fonctions repo** + 1 fixture
de test + 1 commentaire de garde. `FROZEN_SCHEMA_COUNT` 114 → **111**.

---

### 2.2 SÛR — code mort PROUVÉ, aucun effet runtime (31)

Chaque ligne est **inerte** : aucun chemin d'exécution ne l'atteint.

#### 2.2.1 `electron/` — exports et réexports morts

| ID    | `path:line`                                             | Symbole                                                                                                                                                                                                                                                                                           | Preuve                                                                                                                                                                                                                                 | Risque                                                                                                      |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| EL-01 | `electron/ipc/handlers/carts.repo.ts:207`               | `clearCartDrafts` (alias de `clearCartDraftsAtomic:180`)                                                                                                                                                                                                                                          | grep repo-wide : 8 hits ; seul `clearCartDraftsAtomic` est importé (`tests/integration/idempotency-config.test.ts:54,158,159`). knip le signale comme « duplicate export ».                                                            | Faible — mais ADR-043-b le documente comme « alias historique conservé » → note d'ADR requise               |
| EL-02 | `electron/ipc/handlers/fifo.ts:47`                      | `sumRemaining`                                                                                                                                                                                                                                                                                    | grep repo-wide : **1 seul hit** = la définition. `listLayersAsc:37` reste vivant (`:156`).                                                                                                                                             | Faible                                                                                                      |
| EL-03 | `electron/ipc/validators.common.ts:61`                  | `expirationDate`                                                                                                                                                                                                                                                                                  | Aucun importeur. Le schéma câblé est `validators.catalog.ts:29`. Le commentaire `:58-60` dit lui-même « non câblé » ; `ADR-102:56` le confirme.                                                                                        | Faible — **piège garde** : le nom ne finit pas par `Schema`, donc `bridge-shape` ne le voit pas (voir §4.2) |
| EL-04 | `electron/licensing/protocol.ts:20`                     | `LICENSE_SIGNATURE_ALG`                                                                                                                                                                                                                                                                           | grep repo-wide : définition seule                                                                                                                                                                                                      | Faible                                                                                                      |
| EL-05 | `electron/licensing/protocol.ts:85`                     | `EXPIRING_CRITICAL_DAYS`                                                                                                                                                                                                                                                                          | Jamais lu. `EXPIRING_SOON_DAYS:84` est vivant (`:342`). Son seul soutien, l'import `protocol.ts:11` de `LICENSE_CRITICAL_DAYS`, devient mort avec lui.                                                                                 | Moyen — **désymétrie produit** : un état « bientôt » existe, pas d'état « critique »                        |
| EL-06 | `electron/licensing/protocol.ts:103`                    | `sha256Hex`                                                                                                                                                                                                                                                                                       | Doublon exact de `client-access.repo.ts:48`. Les tests (`tests/database/client-access-sync.test.ts:9`) importent **celui du repo**, pas celui du protocole.                                                                            | Faible                                                                                                      |
| EL-07 | `electron/licensing/integrity.ts:61`                    | `clearIntegrityCache`                                                                                                                                                                                                                                                                             | Définition seule ; aucun test ne vide le cache 60 s                                                                                                                                                                                    | Faible                                                                                                      |
| EL-08 | `electron/licensing/fingerprint.ts:133`                 | `clearFingerprintCache`                                                                                                                                                                                                                                                                           | Définition seule. Le commentaire `:120` promet « pour tests » — **le test n'existe pas**.                                                                                                                                              | Faible                                                                                                      |
| EL-09 | `electron/sync/sync.service.ts:41`                      | `setSecretBackendForTests`                                                                                                                                                                                                                                                                        | Définition seule ; `tests/unit/sync-secrets.test.ts:4-8` importe `memorySecretBackend` **directement**, en contournant l'injecteur.                                                                                                    | Faible                                                                                                      |
| EL-10 | `electron/printing/receipt-documents/common.ts:109-111` | 9 réexports (`escapeHtml`, `escapePreText`, `CODE39_PATTERNS`, `code39Svg`, `sanitizeCode39`, `CODE128_WIDTHS`, `code128Svg`, `code128Symbols`, `sanitizeCode128`)                                                                                                                                | Les 5 importateurs de `./common` (`thermal.ts:5`, `receipt-text.ts:3-8`, `proforma.ts:4`, `payment-ticket.ts:3`, `logistics.ts:3`) ne prennent **que** des types. Le code importe directement `./html`, `./barcode39`, `./barcode128`. | Faible — couche d'alias morte                                                                               |
| EL-11 | `electron/printing/receipt-documents.ts` (barrel)       | 15 réexports : `escapePreText:11`, `ReceiptLine:17`, `thermalCenter:25`, `thermalFooterBlock:28`, `thermalSep:32`, `thermalSigns:33`, `thermalWatermark:34`, `ThermalFooterInput:38`, `PageOpts:47`, `PaymentTicketKind:56`, `ReportChart/ReportData/ReportKpi/ReportTable:58`, `LabelOptions:60` | Les 13 importateurs du barrel (`printing.*.ts`, `validators.print.ts:7`, `history.repo.ts:8`) + 8 fichiers de test n'en importent **aucun**. Chaque symbole est consommé via un import relatif direct dans `receipt-documents/*`.      | Faible                                                                                                      |
| EL-12 | `electron/printing/printing.service.ts:24`              | `export type { TemplateRender }`                                                                                                                                                                                                                                                                  | 3 hits repo-wide : définition (`printing.templates.ts:34`), usage interne (`:86`), ce réexport                                                                                                                                         | Faible                                                                                                      |

#### 2.2.2 `src/` — exports morts

| ID    | `path:line`                                | Symbole                                                                                    | Preuve                                                                                                                                                                                                                                             | Risque                                                                          |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| SR-01 | `src/app/shell/shell-types.ts:36-43`       | réexports `DENSITY_KEY`, `THEME_KEY`, `initialDensity`, `initialTheme`, `Density`, `Theme` | grep repo-wide : 14 hits, **tous dans les 2 fichiers eux-mêmes**. Consommateurs réels : `App.tsx:27` et `SettingsSectionsB.tsx:23` importent **directement** de `@shared/ui/theme-density.ts`.                                                     | Faible (barrel seul)                                                            |
| SR-02 | `src/app/shell/App.tsx:39`                 | `export type { ModuleId }`                                                                 | grep des imports de `App.tsx` : 4 hits (`src/main.tsx:3`, `mobile/src/App.tsx`, `license-manager/renderer/{main,App}.tsx`) — **aucun n'importe `ModuleId`**. Le commentaire `:38` (« SellScreen importe ModuleId depuis App.tsx ») est **périmé**. | Faible                                                                          |
| SR-03 | `src/domain/backup/backup-rules.ts:35`     | `clampRetentionCount`                                                                      | 1 hit = la définition. La logique est en inline dans 6 endroits (4 corps **verbatim identiques**, voir §4.4). ADR-047 l'avait extrait « pour l'UI et les tests » — ni l'une ni l'autre ne l'ont appelé.                                            | Moyen — voir §4.4                                                               |
| SR-04 | `src/domain/customer/client-access.ts:8`   | `CLIENT_PIN_LENGTH`                                                                        | 1 hit = la définition. La règle vit en dur dans `validators.customers.ts:51,64` (`/^[0-9]{6}$/`) et `mobile/src/qr.ts`.                                                                                                                            | Faible                                                                          |
| SR-05 | `src/domain/customer/credit-policy.ts:9`   | `interface DebtAgingInput`                                                                 | 2 hits, tous dans le fichier (déf. + champ `daysOverdue`). Aucun importeur, et pas même utilisé en interne.                                                                                                                                        | Faible                                                                          |
| SR-06 | `src/domain/customer/credit-policy.ts:24`  | `agingBucketLabelFr`                                                                       | 2 hits dans le fichier. Seules occurrences des libellés FR : `credit-policy.ts:26,27,28`.                                                                                                                                                          | Moyen — **table de libellés FR morte** ; le module entier est test-only (ST-08) |
| SR-07 | `src/domain/ocr/types.ts:6`                | `type OcrDocumentKind`                                                                     | 1 hit = la définition. L'union est **inlinée deux fois** dans `src/features/stock/OcrImportDialog.tsx:46` et `:210`.                                                                                                                               | Faible                                                                          |
| SR-08 | `src/domain/staff/staff.ts:8`              | `STAFF_CODE_LENGTH`                                                                        | 1 hit. Règle réelle dans `electron/ipc/handlers/staff.repo.ts` (`/^[0-9]{6}$/`) + migration `0041`.                                                                                                                                                | Faible                                                                          |
| SR-09 | `src/domain/staff/staff.ts:14-15`          | `STAFF_RECOVERY_MAX_FAILED`, `STAFF_RECOVERY_LOCK_MINUTES`                                 | 2 hits, tous dans le fichier. Copies vivantes : `staff.repo.ts:23` (`= 5`), `:24` (`= 15`), utilisées en `:688,689,695`.                                                                                                                           | Faible                                                                          |
| SR-10 | `src/domain/staff/staff.ts:35-46`          | `STAFF_PERMISSION_LABELS`                                                                  | 1 hit. Les **mêmes 10 paires clé/libellé, dans le même ordre** existent dans `src/features/staff/UsersAdmin.tsx:11-22` (`PERMISSION_LABELS`) — c'est celle-ci qui rend l'UI.                                                                       | Faible                                                                          |
| SR-11 | `src/domain/staff/staff.ts:61`             | `assertValidDisplayName`                                                                   | 1 hit. Même règle + **même chaîne FR** (`"Nom affiché invalide (1 à 64 caractères)."`) dans `staff.repo.ts:436-438`.                                                                                                                               | Faible                                                                          |
| SR-12 | `src/domain/suppliers/po-rules.ts:65`      | `assertReceivableQuantity`                                                                 | 1 hit. Aucun test, aucun script, aucun import feature. Le reste de `po-rules.ts` est vivant (`SupplierPOsDialog.tsx:13`).                                                                                                                          | Faible                                                                          |
| SR-13 | `src/domain/returns/return-rules.ts:24`    | `type ItemCondition`                                                                       | 17 hits sur `ItemCondition`, **aucun** ne pointe `return-rules.ts:24`. La version vivante est `src/features/returns/types.ts:9` (union identique).                                                                                                 | Faible                                                                          |
| SR-14 | `src/features/license/catalog.ts:26,45`    | `LicensePageId`, `LicenseFeatureId`                                                        | Dans `src/`, hits uniquement aux lignes de définition. Jumeau vivant : `electron/licensing/catalog.ts:29,49`.                                                                                                                                      | Faible                                                                          |
| SR-15 | `src/features/sales/sell/sell-types.ts:59` | `interface CustomerDrawerState`                                                            | 1 hit. L'état réel est construit par `useClientDrawerData.ts` + `dialogs/types.ts`.                                                                                                                                                                | Faible                                                                          |

#### 2.2.3 Dossiers vides

| ID    | Chemin                          | Preuve                                                                                                                                                                                                      |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DR-01 | `src/shared/validation/`        | `read` → 0 entrée ; `git ls-files` → rien (git ne suit pas les dossiers vides). Résidu du nettoyage « 11+ dossiers vides » (`docs/archive/root-legacy/AUDIT_REPORT-2026-09-29.md:101`) qui a raté celui-ci. |
| DR-02 | `electron/database/migrations/` | Dossier vide, non suivi par git. **Attention** : les migrations réelles sont dans `database/migrations/` à la racine. Ne rien confondre.                                                                    |

#### 2.2.4 `tests/` et `scripts/`

| ID    | `path:line`                                   | Symbole                                                                                                   | Preuve                                                                                                                                                    | Risque           |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| TS-01 | `tests/e2e/helpers.ts:460-464`                | `acceptNextConfirm`                                                                                       | grep repo-wide (toutes extensions, `docs/` inclus) : **exactement 1 hit** = la définition. **Seul candidat à suppression strictement neutre du rapport.** | Nul              |
| TS-02 | `tests/unit/ipc-channel-inventory.test.ts:18` | entrée dupliquée `"electron/ipc/registry.core.ts"` (déjà en `:15`)                                        | Lecture directe. Sans effet : `handledChannels()` collecte dans un `Set` (`:39-45`).                                                                      | Nul — cosmétique |
| TS-03 | `tests/e2e/helpers.ts:62,224,331,342`         | `export` redondant sur `vendorPrivateKey`, `bootApp`, `acknowledgeInitialOnce`, `acknowledgeRecoveryOnce` | 0 usage externe ; les 4 fonctions sont **vivantes** (usage interne `:75,107` / `:214,248` / `:293` / `:304`). Seul le mot-clé `export` est superflu.      | Nul — facultatif |

---

### 2.3 TEST-ONLY — vivant, mais référencé uniquement par `tests/` (5)

**Décision : `keep`.** Aucun de ces éléments n'est supprimé : les tests
correspondants constitute une couverture métier réelle. ADR-075 a déjà tranché
des cas voisins (« fonctions sœurs conservées car testées »).

| ID    | Élément                                                                                                                                                                     | Preuve                                                                                                                                                                                                               | Décision                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ST-01 | `electron/ipc/handlers/carts.repo.ts:180` `clearCartDraftsAtomic`                                                                                                           | Le canal `carts.clear` a été **retiré par ADR-075:19** ; plus aucun handler de production. Seul `tests/integration/idempotency-config.test.ts:54,158,159` l'importe. ADR-075:32 l'a explicitement conservé.          | **KEEP** (décision antérieure)                                                                                        |
| ST-02 | `electron/printing/receipt-documents.ts:4,6-9,11` — `CODE39_*`, `code39Svg`, `sanitizeCode39`, `CODE128_*`, `code128Svg`, `code128Symbols`, `sanitizeCode128`, `escapeHtml` | Importés **par le barrel** depuis `tests/unit/documents.test.ts:8,12,13,18` et `tests/unit/p0-logistics-labels-backup.test.ts:8,9,11,13`. La production importe `./barcode39` / `./barcode128` / `./html` en direct. | **KEEP** — supprimer casse 2 fichiers de test                                                                         |
| ST-03 | `electron/ipc/handlers/staff.repo.ts:15-18` (`STAFF_KDF_*`) et `client-access.repo.ts:59-62` (`PIN_KDF_*`)                                                                  | `tests/unit/staff-domain.test.ts:134-137` et `tests/unit/pin-kdf-parity.test.ts:33-36` lisent le **fichier source comme texte** et vérifient les littéraux.                                                          | **KEEP** — constantes de sécuritéliving                                                                               |
| ST-04 | `src/domain/closings/closing-rules.ts`, `src/domain/proforma/proforma-rules.ts`                                                                                             | Utilisés par **`scripts/quality/verify-domain.ts:19-20`** (la porte `npm run verify:domain`) **et** par des tests.                                                                                                   | **KEEP** — le sous-agent avait d'abord classé « test-only » : corrigé, ces modules sont **protégés par une porte CI** |
| ST-05 | `src/features/license/catalog.ts` (entier)                                                                                                                                  | Seul importeur : `tests/unit/license-capabilities.test.ts:38` (`import * as RendererCatalog`) pour l'assertion de parité `:127-132`.                                                                                 | **KEEP** — c'est un **miroir de parité**, sa raison d'être                                                            |
| ST-06 | `mobile/src/store.ts:31` `staleLabel`, `mobile/src/i18n.ts:164` `allKeys`                                                                                                   | Référencés uniquement par `tests/unit/mobile-foundation.test.ts:14,100,101` et `:4,33`.                                                                                                                              | **KEEP** — le handoff §3:68 les documente comme conservés pour les tests                                              |

---

### 2.4 DÉCISION — code non mort, mais problème réel (6)

> Ces éléments **ne sont pas des suppressions** : ce sont des décisions produit
> ou des dettes à arbitrer. Ils sortent du périmètre « code mort » et sont
> listés pour complétude.

| ID    | Élément                                                                                                      | Constat                                                                                                                                                                                                                                                                     | Décision demandée                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DT-01 | `electron/ipc/raw-guards.ts:31` `RAW_GUARDED_CHANNELS`                                                       | La liste des canaux à garde brute n'est **énumérée par aucun code ni test**. La fonction voisine `enforceRawChannelGates:17` est bien câblée. Un nouveau handler brut peut donc être ajouté **sans qu'aucune porte ne tombe**.                                              | **Câbler un test**, ou supprimer la constante (elle est trompeuse). Corriger §4.1                                                                                                                                   |
| DT-02 | `electron/licensing/secure-state.ts:184` `clearSecureState`                                                  | Définition seule. Il n'existe **aucun chemin de réinitialisation** de l'état de licence (ni factory-reset, ni réactivation).                                                                                                                                                | Manque-t-il une fonctionnalité ? Décision produit                                                                                                                                                                   |
| DT-03 | `electron/ipc/validators.common.ts:61` vs `validators.catalog.ts:29`                                         | Deux `expirationDate`. **Celui qui est câblé est le plus laxiste** (`z.string().nullable().optional()`), la version `common` ajoute `isRealCalendarDate` + max(10) mais n'est pas appliquée.                                                                                | **Faille de validation latente** : `productCreate` accepte `2026-13-45`. À corriger, pas à supprimer                                                                                                                |
| DT-04 | `electron/ipc/handlers/client-access.repo.ts:94,89` `buildActivationQrPayload` (V1) + `ACTIVATION_QR_PREFIX` | Le miroir V2 est seul appelé en production (`registry.customers.ts:144`). V1 n'est_plus atteint que par `tests/unit/client-access.test.ts:73-82`. Décision produit : format V1-t-il encore ?                                                                                | Le format QR est un contrat POS↔APK ; ne pas trancher sans ADR                                                                                                                                                      |
| DT-05 | 10 modules `src/domain/**` atteignables **uniquement** depuis `tests/`                                       | `audit-rules.ts`, `cash-count.ts`, `payment-receipt.ts`, `credit-policy.ts`, `stock-alerts.ts`, `return-policy.ts`, `staff.ts`, plus `license/catalog.ts`. Le chemin de production utilise le **miroir main** (`electron/ipc/handlers/*`, documenté « miroir du domaine »). | Ce sont des **règles métier orphelines mais testées**. Supprimer = perdre le contrat ; garder = deux sources de vérité. Arbitrage : soit on supprime + tests, soit on **promouvoir** le domaine comme source unique |
| DT-06 | 11 families de doublons main↔domaine / intra-`src`                                                           | Détail en §4.4. Aucun n'est du code mort : tous ont **au moins un consommateur**.                                                                                                                                                                                           | **Hors périmètre** (règle 4 : pas de refactor). Documenté pour arbitrage ultérieur                                                                                                                                  |

---

### 2.5 HYGIÈNE — dépendances et ignore (2)

| ID        | Élément                      | Preuve                                                                                                                                                                                                                                                                   | Recommandation                                                                                                                                                     |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **HG-01** | `@eslint/js` **non déclaré** | Importé et **utilisé fonctionnellement** : `eslint.config.mjs:1` (`import js`) et `:25` (`js.configs.recommended`). Absent de `devDependencies`. Ne se résout que par transitivité : `node_modules/eslint/package.json` → `"@eslint/js": "9.17.0"` (installée : 9.17.0). | **AJOUTER** `"@eslint/js": "9.17.0"` aux devDependencies. today OK, **casse à la prochaine montée de version d'eslint** si le pin bouge. _Ajout, pas suppression._ |
| HG-02     | `.ruff_cache/`               | **Pas** dans `.gitignore` racine (lu intégralement, 76 lignes). Mais le dossier contient **son propre** `.gitignore` auto-généré par ruff (`*`), et `git ls-files .ruff_cache` → **0 fichier**. `git status` ne le voit pas.                                             | **KEEP — aucune action.** Le sous-agent l'avait classé « gap d'hygiène » : **corrigé**, l'auto-ignore de ruff suffit.                                              |

---

## 3. KEEP — décisions antérieures, confirmées sans réouverture

Ces éléments **ressortent des outils comme morts**. Ce sont des **faux positifs
délibérés**, déjà arbitrés. Ils ne sont pas reproposés.

| #    | Élément                                                                                                               | Décision d'origine                                                                          | Vérification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K-01 | `electron/preload/preload.ts` (« fichier inutilisé »)                                                                 | **DYNAMIC-RISK** — point d'entrée esbuild                                                   | **5 consommateurs indépendants**, aucun `import` statique : (1) `package.json` `build:electron` → `npx esbuild electron/preload/preload.ts --bundle …` ; (2) `electron/main/window-manager.ts:131,197,242` → `path.join(__dirname,"..","preload","preload.js")` ; (3) `electron/licensing/integrity.ts:29` `POS_MANIFEST_CRITICAL` exige ce fichier dans le manifeste packagé ; (4) `scripts/licensing/sign-integrity.mjs:124` ; (5) 4 tests lisent la source (`bridge-shape.test.ts:18,25`). Empaquetage : `electron-builder.yml:9` |
| K-02 | `bindings` (« dépendance inutilisée »)                                                                                | **KEEP** — arête runtime transitive                                                         | `node_modules/better-sqlite3/package.json` → `dependencies: { bindings: "^1.5.0" }` ; `better-sqlite3/lib/database.js:48` → `require('bindings')('better_sqlite3.node')`. Whitelisté au packaging (`electron-builder.yml:24`). **ADR-005:38** l'a décisionnellement placed en `dependencies`. Zéro import first-party = **faux positif**                                                                                                                                                                                             |
| K-03 | 22 fichiers `mobile/**` + 16 fichiers `license-manager/**` (« fichiers inutilisés »)                                  | **DYNAMIC-RISK** — points d'entrée multi-paquets                                            | `mobile/package.json:6` `"main": "index.js"` → `App.tsx:32-37` (6 écrans) + `App.tsx:29-31` (kit UI) ; `Login.tsx:21` + `Payments.tsx:14` tirent `QrScanner.tsx` / `ReceiptSheet.tsx`. Manager : `electron-builder.license-manager.yml:8` `main:` + `vite.license-manager.config.ts:8` root renderer. **Aucune config knip, aucun `workspaces`** dans `package.json` → cause racine de la_myriade de faux positifs                                                                                                                   |
| K-04 | `cloud/supabase/functions/client-sync/index.ts`                                                                       | **DYNAMIC-RISK** — edge function Deno                                                       | `cloud/supabase/config.toml:13` `entrypoint = "functions/client-sync/index.ts"`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| K-05 | 10 scripts `scripts/{database,licensing,quality}/*` + 3 harnesses E2E                                                 | **Outils opérateur/vendor manuels**                                                         | **Tous listés explicitement** dans `eslint.config.mjs:35-57` (`allowDefaultProject`) — donc **délibérés**. Deux sont **activement requis** : `tests/e2e/helpers.ts:163` exécute `import-local-license.cjs`, qui `:49`Require `test-only-allow-expired.cjs` ; `handoff.md` + `ADR-077:56` documentent `e2e-mirror-relay.mjs` comme prérequis de `full-loop-client`                                                                                                                                                                    |
| K-06 | `net` (« binaire inutilisé »)                                                                                         | **PROUVÉ VIVANT**                                                                           | `tests/e2e/helpers.ts:87` `execFile("net", ["session"], …)` — spawn **dynamique**, invisible à knip. Atteint via `isElevated():85`, appelé par `tests/e2e/installer.spec.ts:14,117`                                                                                                                                                                                                                                                                                                                                                  |
| K-07 | `expo-secure-store`, `expo-sqlite` (« non déclarés »)                                                                 | **KEEP**                                                                                    | Déclarés dans **`mobile/package.json:27,28`** (paquet indépendant). knip ne lit que le `package.json` racine                                                                                                                                                                                                                                                                                                                                                                                                                         |
| K-08 | ADR-075 **D1** `registry.core.ts:79-95` (peek manuel)                                                                 | DELIBERATE-KEEP                                                                             | Sémantique distincte sur relocate/récupération                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| K-09 | ADR-075 **D2** (compagnons WAL ×3), **D4** (catch UNIQUE ×55 sites), **D5** (`printing/enrich.ts`)                    | DELIBERATE-KEEP                                                                             | « risque > gain ». Le tier 2 (`returns.repo.ts` retour client vs fournisseur) relève de la même logique                                                                                                                                                                                                                                                                                                                                                                                                                              |
| K-10 | ADR-075 — `paymentTicketFormatSchema`                                                                                 | Membre officiel du set `nested` de `bridge-shape` (`tests/unit/bridge-shape.test.ts:90-99`) | Conservé                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| K-11 | ADR-075 — `handoff.md` racine                                                                                         | Fichier de travail actif suivi par git                                                      | ADR-103 : ne pas déplacer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| K-12 | ADR-109 — tables `bread_orders`, pages licence `pain`, colonne `is_bread_client`                                      | DELIBERATE-KEEP (compat, zéro migration destructive)                                        | Migrations immuables (règle 12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| K-13 | `public/icons/*`                                                                                                      | DELIBERATE-KEEP                                                                             | `electron-builder.yml:64,88,89,90,91` ; **et** les 3 PNG sont dans le manifeste signé (`sign-integrity.mjs:110`) — suppression isolée = rupture d'intégrité                                                                                                                                                                                                                                                                                                                                                                          |
| K-14 | `resources/license/public.key`, `resources/ocr/lang/*.traineddata`                                                    | DELIBERATE-KEEP **fail-closed**                                                             | `electron-builder.yml:45-49` ; `secret-scan.mjs:174` fait échouer le packaging si absent                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| K-15 | `private/**` (clés vendor + `.vlic`)                                                                                  | **Secrets** — jamais committés (`.gitignore:34,35`)                                         | `tests/e2e/helpers.ts:63` consomme `private.key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| K-16 | `scripts/maintenance/*.ps1` + `.jpg`                                                                                  | ADR-075:56 « conservés »                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| K-17 | `full-inventory.txt`, `check_like.py`                                                                                 | **Raye explicitly** `.gitignore:67,68` ; non suivis                                         | Signalés uniquement, jamais supprimés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| K-18 | `tsconfig*.tsbuildinfo` (×3)                                                                                          | Artefacts de build, `.gitignore:63`                                                         | Nettoyés par `npm run clean`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| K-19 | Tout le chantier impression non commité (13 M + 3 nouveaux)                                                           | **WIP d'une session dédiée** (`handoff.md:357-362`)                                         | **Hors périmètre.** `printing.capabilities.ts` et `template-capabilities.ts` sont **vivants et câblés** — knip les signale à tort                                                                                                                                                                                                                                                                                                                                                                                                    |
| K-20 | Les 34 exports « domain-only » (`MINOR_PER_MAJOR`, `assertMinorInteger`, `RADIUS`, `GRADIENTS`, `SCAN_BURST_GAP_MS`…) | Faux positifs systématiques                                                                 | Motif dominant du dépôt : _exporter une règle pure, la consommer dans son propre fichier_. knip n'a pas d'entrée « usage interne »                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 4. Contradictions avec les ADRs et dette technique détectée

### 4.1 `RAW_GUARDED_CHANNELS` n'est appliqué par personne — DT-01

`electron/ipc/raw-guards.ts:31` énumère les canaux à garde brute. **Aucun code,
aucun test ne lit cette constante.** Elle donne l'illusion d'un garde-fou de
revue alors qu'un nouveau `ipcMain.handle` brut passe inaperçu. C'est une
**contradicition entre l'intention documentée et le comportement**.

### 4.2 La garde `bridge-shape` ne couvre que les noms `*Schema` — EL-03

`tests/unit/bridge-shape.test.ts:72` extrait les schémas via
`/export const (\w+Schema)/g`. Un validateur Zod nommé autrement
— c'est le cas de `expirationDate` (`validators.common.ts:61`) —
**échappe à la garde**. C'est exactement pourquoi il survit depuis
`ADR-102` sans que personne ne le remarque. **Recommandation** : élargir la
regex à `export const \w+` filtré sur `z.object(`/`z.` — hors périmètre ici,
mais à consigner.

### 4.3 `noUnusedLocals` est déjà actif — l'angle mort est au niveau _export_

`tsconfig.json` et `tsconfig.electron.json` activent tous deux
`noUnusedLocals` + `noUnusedParameters`. Conséquence : **le compilateur garantit
déjà l'absence de variable locale inutilisée.** Tout le code mort résiduel est
donc, par construction, au niveau de la **surface exportée** — ce que `tsc` ne
voit pas et qui exige `knip`/`eslint-plugin-import` pour être traité.

### 4.4 Dette de duplication — DT-06 (hors périmètre, documentée)

| Famille                                             | Copies                                                                                                                                                  | Garde de parité ?                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MINOR_PER_MAJOR = 100`                             | `src/domain/money/money.ts:14` (exporté, vivant) **et** `src/domain/invoice/timbre-rules.ts:19` (non exporté, vivant)                                   | **Aucune** — les deux sont dans `src/domain`, l'argument de frontière main/domaine ne s'applique pas                          |
| `FifoConsumption`                                   | `src/domain/inventory/fifo-rules.ts:16` **et** `electron/ipc/handlers/fifo.ts:29`                                                                       | **Aucune** — `main-domain-parity.test.ts` ne couvre que `isRealCalendarDate` et `assertValidQuantity`                         |
| `STAFF_PERMISSION_LABELS` (10 paires)               | `src/domain/staff/staff.ts:35` (morte) **et** `src/features/staff/UsersAdmin.tsx:11` (vivante)                                                          | **Aucune**                                                                                                                    |
| `clampRetentionCount`                               | `backup-rules.ts:35` (**extraite mais morte**) + **4 corps verbatim identiques** dans `SettingsSectionsB.tsx:344,372,400,426` + `backup.service.ts:310` | **Aucune**                                                                                                                    |
| `MANAGER_MANIFEST_CRITICAL` (5 chaînes)             | `license-manager/main/integrity-check.ts:59` **et** `scripts/licensing/sign-manager-integrity.mjs:81`                                                   | **Aucune** — mais **les deux sides font échouer** (`process.exit(1)` vs `tampered`), donc la divergence se voit               |
| `editionFromPlan` vs `EDITION_FROM_PLAN`            | `license-manager/signing.ts:235` (`switch → "custom"`) **et** `license-manager/renderer/App.tsx:131` (`?? "pro"`)                                       | **Aucune** — divergence silencieuse : le renderer prévisualise X, le main signe Y                                             |
| `PLANS` vs `LICENSE_PLANS` (5 plans)                | `license-manager/renderer/App.tsx:53` **et** `electron/licensing/catalog.ts:52`                                                                         | **Aucune**                                                                                                                    |
| `PAGES`/`FEATURES` (17 pages, 14 features)          | **3 copies** : `renderer/App.tsx:139,159`, `electron/licensing/catalog.ts:9`, `license-manager/ipc/validators.ts:12`                                    | **Partielle** — renderer↔catalog gardée (`license-manager-presets.test.ts:22-23`), **la copie validators n'est pas gardée**   |
| `ACTIVATION_QR_PREFIX(_V2)` (`VELORIA1`/`VELORIA2`) | 3 copies : `src/application/customers/client-access.ts:25,28`, `electron/ipc/handlers/client-access.repo.ts:89,92`, `mobile/src/qr.ts:9,10`             | **Convention seulement** (commentaire `client-access.repo.ts:83-88`) — contrat POS↔APK                                        |
| `MAX_QTY` (1 000 000)                               | `mobile/src/views.ts:90` **et** `src/domain/common/quantity.ts:6` (`MAX_QUANTITY`)                                                                      | **Aucune**                                                                                                                    |
| `numQty` vs `roundQuantity`                         | `mobile/src/views.ts:96` **et** `src/domain/common/quantity.ts:27`                                                                                      | Commentaire `views.ts:217-219` revendique la parité, mais **mobile perd les garde-fous de débordement** de `money.ts:185-187` |

> **Toutes ces familles ont au moins un consommateur** : ce ne sont **pas** du
> code mort. Conformément à la règle 4 (« aucun refactor, aucune amélioration
> latérale — le code mort uniquement »), **elles ne sont pas proposées à la
> suppression**. Elles sont consignées pour un arbitrage produit ultérieur.

### 4.5 `mobile/` n'est couvert par **aucune porte de type**

`tsconfig.json` n'inclut que `src`, `tests`, `scripts` et 4 fichiers de config.
`tsconfig.manager.json` couvre `license-manager`. **Aucun tsconfig ne couvre
`mobile/`**, et `eslint.config.mjs:146-148` y désactive toutes les règles
type-aware. Le seul garde sur l'APK est `vitest`. **Dette de couverture, pas
code mort.**

### 4.6 Contre-exemple conservé de justesse : `mobile/src/cache.ts:39`

`const SecureStore = require("expo-secure-store")` — le `require` littéral est
**obligatoire** pour Metro. L'aliaser casserait le démarrage de l'APK
(`ADR-066:13`). **À ne jamais « nettoyer ».**

---

## 5. Estimation d'impact

### 5.1 Lot 1 — code mort sûr (aucun contrat touché)

| Catégorie                                         | Nombre          | LOC estimés   |
| ------------------------------------------------- | --------------- | ------------- |
| Exports morts `electron/` (EL-01→EL-09)           | 9               | ≈ 30          |
| Réexports morts `printing/` (EL-10, EL-11, EL-12) | 3               | ≈ 24          |
| Exports morts `src/` (SR-01→SR-15)                | 15              | ≈ 65          |
| Dossiers vides (DR-01, DR-02)                     | 2               | 0             |
| `tests/` (TS-01, TS-02)                           | 2               | ≈ 7           |
| **Total Lot 1**                                   | **31 findings** | **≈ 126 LOC** |

> Les 4 `export` redondants de TS-03 sont **facultatifs** (≈ 4 mots-clés) et
> ne sont pas comptés.

### 5.2 Lot 2 — canaux IPC morts

| Catégorie                           | Nombre                |
| ----------------------------------- | --------------------- |
| Canaux retirés                      | **6** (180 → **174**) |
| Fichiers de production touchés      | 10                    |
| Fichiers de test touchés            | 5                     |
| Compteur gelé `FROZEN_SCHEMA_COUNT` | 114 → **111**         |
| LOC estimés                         | ≈ 75                  |

### 5.3 Dépendances

| Mesure                   | Valeur                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dépendances supprimables | **0**                                                                                                                                                              |
| Dépendances à ajouter    | **1** (`@eslint/js`)                                                                                                                                               |
| Raison du 0              | `bindings` est une arête runtime transitive **exigée** par `better-sqlite3` (ADR-005) ; `expo-secure-store`/`expo-sqlite` sont déclarés dans `mobile/package.json` |

---

## 6. Plan de lots proposé — **en attente d'approbation**

> **Aucune suppression n'a été effectuée.** Chaque lot ci-dessous exige une
> approbation textuelle explicite (« _j'approuve le lot N_ »).

### 🔒 Verrou préalable — bloquant tous les lots

L'arbre porte **13 fichiers modifiés + 3 nouveaux** d'un chantier impression
**sans rapport**. Conformément à la consigne :

1. L'opérateur **commit** ce chantier (après portes vertes de sa session), **ou**
2. l'opérateur le **range** (stash), **ou**
3. l'opérateur m'autorise explicitement à travailler par-dessus.

→ **Je n'insiste pas pour committer à sa place** (AGENTS.md §10 : toujours
inspecter `git status`, ne jamais embarquer du travail pré-stagé).

### Lot 1 — code mort sûr, **aucun contrat de bridge touché** (recommandé en premier)

|                              |                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Statut**                   | ✅ **EXÉCUTÉ** — commit `20a705b`, ADR-118. 21 fichiers, 148 lignes supprimées / 3 ajoutées. Toutes portes vertes (`804 → 804`).            |
| **Findings**                 | EL-01→EL-12, SR-01→SR-15, DR-01, DR-02, TS-01, TS-02                                                                                        |
| **Ce qui est retiré**        | 31 findings, ≈ 126 LOC                                                                                                                      |
| **Ce qui n'est PAS touché**  | `channels.ts`, `preload.ts`, `vite-env.d.ts`, `validators.*`, `license-gates.ts`, `staff-gates.ts`, `ipc-channels.json`, tout compteur gelé |
| **Portes**                   | `format` → `typecheck` → `lint` → `test` → `build` → `build:electron`                                                                       |
| **Preuve de non-régression** | `npm run test` doit rester **804/804** (121 fichiers) — aucun test ne référence ces symboles (prouvé finding par finding)                   |
| **Point de retour arrière**  | `git revert <sha>` du commit du lot — aucune donnée, aucun schéma, aucun migration                                                          |
| **ADR**                      | **ADR-118** — liste nominative des suppressions (règle AGENTS.md §11)                                                                       |
| **Note**                     | EL-01 (alias `clearCartDrafts`) est référencé par ADR-043-b : noter l'extinction de l'alias dans l'ADR, ne pas rouvrir l'alias              |

### Lot 2 — les 6 canaux IPC morts ⚠️ _contrat de bridge_

|                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Statut**                         | ⚠️ **EXÉCUTÉ PARTIELLEMENT** — commit lot 2, ADR-119. **3 canaux retirés** (`sync.markSent`, `sync.pending`, `stock.ledger`) + **3 fonctions repo orphelines** (`markOutboxSentAtomic`, `listPendingOutbox`, `Inventory.getLedger`). Snapshot **180 → 176**, `FROZEN_SCHEMA_COUNT` **114 → 113**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Findings**                       | IPC-02 (`sync.markSent`), IPC-03 (`sync.pending`), IPC-04 (`stock.ledger`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Ce qui est retiré**              | 6 canaux : `channels.ts`, `preload.ts`, `vite-env.d.ts`, 6 wrappers `ipc-client.ts`, 4 handlers, 10 entrées de gates, snapshot, 3 schémas Zod                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Synchronisation obligatoire**    | `tests/unit/__snapshots__/ipc-channels.json` **180 → 174** · `tests/unit/validators-inventory.test.ts:27` `FROZEN_SCHEMA_COUNT` **114 → 111** (+ commentaire d'historique) · `tests/unit/staff-domain.test.ts:175` · `tests/integration/retention-critical.test.ts:67,68,73` · `tests/unit/printing/split-parity.test.ts:254` · `tests/unit/client-access.test.ts` (retirer `syncPendingSchema`, `announcementSaveSchema`)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Portes**                         | `format` → `typecheck` → `lint` → `test` → `build` → `build:electron` → **`verify:migrations`** + **`verify:domain`** (contrats touchés)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Point de retour arrière**        | `git revert <sha>` — réversible intégralement, aucune migration, aucun schéma                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **ADR**                            | **ADR-119** — obligatoire (évolution d'un contrat IPC gelé, comme ADR-075)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **⚠ Point d'attention**            | `announcements.save` est le **seul** chemin d'écriture des annonces magasin. Le domaine (`assertValidAnnouncement`, `CLIENT_ANNOUNCEMENT_MAX`) et le repo existent ; **seule l'UI manque**. Supprimer le canal revient à declarer la fonctionnalité abandonnée. **Recommandation : `defer`, pas `delete`** — à trancher explicitement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **⚠ Preuve décisive (2026-10-19)** | `announcements.save` **n'est PAS du code mort** : c'est une **fonctionnalité à moitié livrée dont le client est déjà en production**. `saveAnnouncementAtomic` (`client-access.repo.ts:562`) est le **seul** écrivain de la table `announcements` (`:578`) ; `buildSnapshotPayload` (`:412-413`) la lit et embarque `announcement` (`:441`) dans le cliché `customer_snapshot` ; `pushNowAtomic` le pousse vers Supabase ; **l'APK l'affiche déjà** — bandeau mégaphone `mobile/src/screens/Home.tsx:339` + `Account.tsx:223`, parsing `mobile/src/views.ts:61,154`, libellé FR/AR `mobile/src/i18n.ts:93`, couleur `mobile/src/tokens.ts:30`. Supprimer le canal rendrait le repli « Aucune annonce du magasin » **définitif**. **Recommandation : CONSTRUIRE l'UI, pas supprimer** (tranche verticale AGENTS.md §7). _Hors périmètre code mort — signalé pour arbitrage produit._ |
| **Alternative**                    | Si l'opérateur veut préserver la fonctionnalité : ne retirer que les 5 autres (`sync.markSent`, `sync.pending`, `stock.ledger`, `templates.get`, `printer.get`) et garder `announcements.save`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Conservé — `templates.get`**     | Son schéma `templateGetSchema` est dans `electron/ipc/validators.templates.ts` et son handler dans `registry.system.ts` — **le schéma est dans un fichier du chantier impression non commité**. Le retirer mélangerait deux chantiers dans un même commit (interdit, AGENTS.md §10). **Différé au lot 2 bis.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Conservé — `printer.get`**       | Son handler est dans `electron/printing/printing.receipt.ts` — **fichier du chantier impression non commité**. **Différé au lot 2 bis.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Lot 3 — hygiène des dépendances (trivial)

|                             |                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Findings**                | HG-01                                                                                                                                                                                                            |
| **Action**                  | **Ajouter** `"@eslint/js": "9.17.0"` aux `devDependencies`                                                                                                                                                       |
| **Portes**                  | `lint` (vérifie que la résolution explicite est équivalente) + `test`                                                                                                                                            |
| **Point de retour arrière** | `git revert <sha>`                                                                                                                                                                                               |
| **⚠ Contrainte**            | Le lot modifie `package.json` → **je n'ajouterai ni ne modifierai aucun lockfile** (`package-lock.json`). L'opérateur devra lancer `npm install` lui-même, ou autoriser explicitement la mise à jour du lockfile |
| **ADR**                     | Non requis (ajout, pas suppression ; mais traçable dans `handoff.md`)                                                                                                                                            |

### Lot 4 — **NON PROPOSÉ** (dette, à arbitrer séparément)

- **DT-01** (`RAW_GUARDED_CHANNELS` non appliqué), **DT-02** (`clearSecureState`), **DT-03** (validateur `expirationDate` laxiste câblé), **DT-04** (format QR V1), **DT-05** (10 modules domain test-only), **DT-06** (11 familles de doublons)
- Raison : ce ne sont **pas** du code mort. Les traiter serait un refactor, ce
  que la règle 4 interdit dans cette mission.

---

## 7. Méthodologie de re-vérification

Chaque finding doit être reproductible par **une seule commande** :

```powershell
# Exemple — IPC-04 (canal mort)
Select-String -Path src\shared\types\ipc-client.ts -Pattern "stockLedger"
Get-ChildItem src,tests -Recurse -Include *.ts,*.tsx |
  Select-String -Pattern "\bstockLedger\b"   # → 0 résultat

# Exemple — EL-02 (export mort)
Select-String -Path electron\ipc\handlers\fifo.ts -Pattern "sumRemaining"
# → 1 résultat = la définition (ligne 47)

# Reproductibilité de l'outillage
npx --yes knip --no-progress        # 219 candidats bruts (base de comparaison)
npx --yes depcheck --json           # 1 trouvaille : @eslint/js
npm run test                        # 804/804 attendu (121 fichiers)
```

---

## 8. Limites de cet audit

1. **L'arbre était sale** : les mesures `tsc`/`eslint`/`verify:*` n'ont pas été
   relancées (elles porteraient le sceau du chantier impression). Seul
   `npm run test` a été mesuré : **804/804**.
2. **`knip` sans configuration** : le dépôt n'a ni `knip.json` ni `workspaces`.
   D'où **212 faux positifs** qu'il a fallu réfuter un par un. Un `knip.json`
   déclarant les vrais entry points (`electron/preload/preload.ts`,
   `license-manager/main/main.ts`, `mobile/index.js`,
   `cloud/supabase/functions/client-sync/index.ts`, `scripts/**`, workspace
   `mobile`) réduirait le bruit d'environ 95 % — recommandé comme tâche
   distincte à faible risque (1 fichier de config, aucun changement de code).
3. **`rg` absent du PATH** : l'audit s'est appuyé sur l'outil `grep` du harness
   - PowerShell. Aucun écart de couverture par rapport à la méthodologie prévue.
4. **Le graphe Graphify n'a pas été réactualisé** : cet audit n'ayant modifié
   aucun fichier, `graphify update .` n'a pas été lancé (prevu en fin de chaque
   lot de Phase B).
5. **Analyse statique uniquement** : aucun canal IPC n'a été vérifié **à
   l'exécution** (pas de tracing Electron). Le cas `recovery.*` (§2.1) montre
   qu'une vérification statique peut se tromper — un **test d'instrumentation
   du pont** (`window.veloria` Proxy qui journalise les appels) serait la
   seule preuve absolue. Recommandé comme dette de couverture, non traitable
   ici.

---

## 9. Verdict pour l'opérateur

| Question                                   | Réponse                                                                                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le dépôt a-t-il un problème de code mort ? | **Non, pas structurellement.** 212 faux positifs sur 219 candidats ; les 31 findings sûrs ne représentent qu'≈ 126 LOC sur un base de ≈ 213 fichiers TS.                                                                                 |
| Le seul vrai gisement ?                    | **La couche IPC** : 6 canaux servis, validés, exposés — et jamais appelés (≈ 75 LOC, mais un contrat gelé à faire évoluer).                                                                                                              |
| Le vrai risque détecté ?                   | **Les gardes qui ne gardent pas** : `RAW_GUARDED_CHANNELS` (§4.1) et la faille de couverture de `bridge-shape` sur les validateurs non `*Schema` (§4.2) — plus DT-03, où le validateur effectivement câblé est le plus laxiste des deux. |
| Prochane étape                             | **Trancher sur le verrou d'arbre sale**, puis approuver un lot. Le lot 1 est sans risque ; le lot 2 est le seul qui mérite un arbitrage soigné (notamment `announcements.save`).                                                         |

---

## 10. Bilan d'exécution (2026-10-19)

| Lot                                         | Statut                       | Commit                    | Effet                                                                                 |
| ------------------------------------------- | ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| **Phase A** (rapport)                       | ✅ livré                     | `20a705b` (avec le lot 1) | `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md`                                          |
| **Lot 1** — code mort sûr                   | ✅ exécuté                   | `20a705b` (ADR-118)       | 21 fichiers, **148 lignes supprimées**, 0 contrat touché                              |
| **Lot 2** — canaux IPC                      | ✅ exécuté **partiellement** | `5213162` (ADR-119)       | **3 canaux** + **3 fonctions repo** ; snapshot 180→176, `FROZEN_SCHEMA_COUNT` 114→113 |
| **Lot 2 bis** — zone du chantier impression | ⏸ **différé**                | —                         | 24 réexports + `templates.get` + `printer.get` — **exige le commit du chantier**      |
| **Lot 3** — `knip.json`                     | ✅ exécuté                   | `5213162`                 | candidats bruts **219 → 30**, `Unused files` **32 → 0**                               |
| **Hors périmètre** — `announcements.save`   | 🔒 **conservé**              | —                         | fonctionnalité client **déjà livrée** ; il manque l'UI, pas le code                   |

**Portes vertes à chaque lot** : `tsc -b` 0 · `typecheck:electron` ✓ ·
`typecheck:manager` ✓ · `eslint --max-warnings 0` exit 0 ·
`vitest` **804 → 804** (121 fichiers) · `build` ✓ · `build:electron` ✓ ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `graphify update` ✓.

**Hygiène docs** : `docs/INDEX.md` (point d'entrée unique selon ADR-103) était
arrêté à ADR-103 — **33 ADR (085→119) étaient invisibles**. Corrigé : 119 ADR
indexés, **119 liens valides, 0 orphelin**.

**Trouvailles hors dead-code, à arbitrer séparément** (aucune action de
suppression engagée) :

1. `RAW_GUARDED_CHANNELS` n'est appliqué par **aucun** code ni test
   (`electron/ipc/raw-guards.ts:31`) — un handler brut nouveau passe inaperçu.
2. La garde `bridge-shape` ne couvre que les noms `*Schema`
   (`tests/unit/bridge-shape.test.ts:72`) — d'où la survie de
   `expirationDate`.
3. Le validateur `expirationDate` **effectivement câblé** est le **plus laxiste**
   des deux (`validators.catalog.ts:29`) : `productCreate` accepte `2026-13-45`.
4. `expo-constants` est **déclaré mais jamais importé** dans `mobile/src` —
   retrait possible, mais exige la mise à jour de `mobile/package-lock.json`
   (lockfiles hors périmètre).
5. `mobile/` n'est couvert par **aucun tsconfig** : le seul garde est `vitest`.

---

_Audit réalisé le 2026-10-18. Référence : `4af1265` (branche `chore/root-layout`).
Aucun fichier du dépôt n'a été modifié, créé ni supprimé durant cette phase._
