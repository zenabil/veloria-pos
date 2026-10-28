# ADR-153 — Purge dead-code radical : lots A (contrat IPC), B (domaine ombre), C (exports test-only) ; lot D (schéma) refusé

## Contexte

Demande opérateur : « فحص المشروع من كل الاكواد الميتة و اصلاح جذريا » (audit de
tout le code mort, correction radicale), approuvée par lots après présentation
chiffrée (A+B, puis C filtré, D non touché).

L'audit ne repart pas de zéro : `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md`
(ADR-118 lot 1, ADR-119 lot 2, lot 3 `knip.json`) et la vague W6 (ADR-127) ont
déjà été exécutés. **Deux restes de cet audit n'avaient jamais été tranchés** :
le « lot 2 bis » (différé parce que le chantier impression était alors non
commité) et **DT-05** (les modules `src/domain/**` orphelins mais testés).

Méthode (outre `knip` 6.43, **vert** sur son périmètre : 0 fichier, export,
type ou dépendance inutilisé) :

1. **Fermeture transitive** depuis les vrais points d'entrée de production
   (`src/main.tsx`, `electron/main/main.ts`, `electron/preload/preload.ts`,
   `license-manager/main/main.ts`, `mobile/src/App.tsx`, `cloud/supabase/
functions/*/index.ts`, cibles des scripts `package.json`) sur 603 fichiers
   TS/TSX, alias `@`/`@domain`/`@shared`/`@features` résolus.
2. **Canaux IPC à trois niveaux** : déclaration (`channels.ts`) → `handle()` /
   `ipcMain.handle()` → exposition `preload.ts` → wrapper `ipc-client.ts` **ou**
   appel direct `callChecked((a) => …)` → site d'appel renderer. 186 canaux,
   184 exposés, 177 wrappers.
3. **Index de tokens** sur 1 881 exports, en distinguant production,
   `tests/**` et usage interne au fichier (knip compte les tests comme du
   projet : un export consommé uniquement par un test lui apparaît « vivant »).
4. Grep ciblé sur le **niveau chaîne** (noms de tables/colonnes/vues, clés
   i18n, assets) — aveugle à tout outil statique.

État de référence mesuré **avant** toute coupe : `tsc -b` 0 erreur,
`vitest run` **1189/1189** (171 fichiers).

## Décision — lot A (supprimé, aucun changement de comportement)

Le « lot 2 bis » de l'audit de 2026-10-18, enfin exécuté :

- **Canaux servis, validés, exposés… et appelés par personne** :
  `printer.get` et `templates.get`. Retirés de bout en bout :
  `electron/ipc/channels.ts`, `electron/preload/preload.ts`,
  `src/vite-env.d.ts`, `src/shared/types/ipc-client.ts` (`printerGet`,
  `templateGet`), handler `ipcMain.handle` de
  `electron/printing/printing.receipt.ts:105`, handler `handle()` de
  `electron/ipc/registry.system.ts:91`, schéma `templateGetSchema`
  (`electron/ipc/validators.templates.ts`), entrée `staff-gates.ts` pour
  `templates.get`, entrée `RAW_UNGUARDED_CHANNELS` pour `printer.get`.
- **Compteurs gelés resynchronisés** : snapshot
  `tests/unit/__snapshots__/ipc-channels.json` **185 → 183**,
  `FROZEN_SCHEMA_COUNT` **125 → 124**, `FROZEN_SCHEMA_TOTAL`
  (`operation-id-coverage`) **125 → 124**, `FROZEN_EXPORT_COUNT`
  (`bridge-shape`) **134 → 133**, liste de parité `split-parity.test.ts`
  **27 → 26 canaux** (découpage par tranches recalé en conséquence).
- **5 wrappers morts de la façade** : `customerAccessActivate`,
  `customerAccessStatus`, `customerAccessQrSvg`, `syncEnqueue`, `syncPushNow`.
  Les canaux restent **VIVANTS** : l'UI les appelle en direct via
  `callChecked((a) => a.sync.enqueue(…))` (`ClientMobileAccess.tsx:156,182`,
  `SettingsSectionsB.tsx:657,719`) pour valider la réponse par schéma Zod —
  le wrapper non typé de `ipc-client.ts` est donc une double porte sans
  client. `customers.accessRevoke`, lui, a bien un appelant.
- **Trois branches inatteignables dans les formatteurs d'argent** :
  `formatDzd` calculait `sign = minor < 0 ? "-" : ""` puis `Math.abs(minor)`
  **après** avoir déjà renvoyé « — » sur `minor < 0` (ligne 193) — même motif
  dans `formatDzdStrict`, où `assertMinorInteger` → `assertSafeMinor` borne
  `min = 0` et lève sur le négatif. `formatDzdSigned` enveloppait
  `formatDzd` dans un `try/catch` mort depuis A-01 (`formatDzd` ne lève plus
  jamais) ; le retirer corrige au passage l'affichage `« -— »` d'un négatif
  hors bornes, qui devient `« — »`.
- **Outillage** : `scripts/database/probe-sqlite-version.cjs` (sonde
  ponctuelle de version SQLite, zéro référence dans `package.json`, les docs
  ou le code ; entrée `allowDefaultProject` de `eslint.config.mjs` retirée
  avec elle). Les 8 autres scripts sans appelant npm **sont conservés** :
  chacun est documenté comme outil manuel (`docs/licensing/ACTIVATION.md`,
  `KEY_MANAGEMENT.md`, `mobile/README.md`, ADR-034/060/077/150).
- **`.gitignore`** : ajout de `/release-manager-tmp/` (scratch
  electron-builder du License Manager, déjà décrit trois fois dans
  `handoff.md` comme polluant `git status`). Le `win-unpacked/resources/app.asar`
  de 36 Mo reste en place : **verrouillé par le scanneur** (« Device or
  resource busy »), jamais forcé — doctrine `handoff.md` §55, il part au
  redémarrage.

## Décision — lot B (supprimé) : le domaine ombre, jamais exécuté

8 modules `src/domain/**` ne sont importés par **aucun** fichier de production
(fermeture transitive) et ne sont référencés que par leurs tests — 595 lignes,
plus 343 lignes de tests qui ne testent **rien d'autre** :

| Module                        | Règle                                            | Exécution réelle (miroir main)                          |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `inventory/fifo-rules.ts`     | allocation FIFO, coût de survente, marge         | `electron/ipc/handlers/fifo.ts` (couches SQL)           |
| `customer/payment-receipt.ts` | reconstitution des soldes du grand-livre         | `computeReceiptBalancesInline`, `customers.repo.ts:533` |
| `staff/staff.ts`              | code 6 chiffres, verrou 5 échecs, 10 permissions | `electron/ipc/handlers/staff.repo.ts`                   |
| `returns/return-policy.ts`    | fenêtre de retour + frais de réassort            | `returns.repo.ts` / `return-settlement.ts`              |
| `inventory/stock-alerts.ts`   | seuil bas, péremption FEFO, réassort             | requêtes `inventory.repo.ts` + UI                       |
| `closings/cash-count.ts`      | écart compté/attendu par moyen                   | formule de clôture Z (`finance.repo.ts`)                |
| `customer/credit-policy.ts`   | retard calendaire, jour de règlement             | `debt-status.ts` + règle E-30                           |
| `audit/audit-rules.ts`        | construction d'une ligne `audit_log`             | écritures inline `audit_log` des repos                  |

Suppression plutôt que promotion du domaine : ces copies ne sont pas la règle
en vigueur, ce sont des **simulacres testés**. Leur persistance entretient
précisément le risque que l'audit de 2026-10-18 visait (DT-06, 11 familles de
doublons) — `main-domain-parity` ne compare que 2 symboles, donc une divergence
entre le miroir exécuté et le domaine décoratif passe inaperçue. Un exemple
concret de dérive déjà là : le commentaire `handoff`/ADR-049 présente le
domaine comme source de la règle alors que `customers.repo.ts` dit « miroir
local » et que c'est lui qui rend le montant au caissier.

Tests : `tests/unit/{p3-policy,fifo-rules,payment-receipt}.test.ts` supprimés
(ils n'importaient que ces modules) ; `p3b-commerce.test.ts` et
`staff-domain.test.ts` **conservés mais élagués** — ils mélangent des règles
vivantes (unités, EAN, marges, validateurs Zod staff, carte des gardes staff,
parité KDF lue dans `staff.repo.ts`) et le domaine mort. L'intégration
`tests/integration/payment-receipt.test.ts` est **conservée** : elle exerce le
miroir main sur une vraie base `node:sqlite`.

Les commentaires qui pointaient vers les fichiers supprimés ont été corrigés
(`customers.repo.ts:466,533`, `fifo.ts:3`, `staff.repo.ts:3,12`,
`domain/common/dates.ts:27-28`) pour ne pas laisser de référence morte.

## Décision — lot C (filtré) : les exports que seuls les tests consommaient

Répartition mesurée sur 1 881 exports (index de tokens, `tests/**` traité à
part) :

- **270** « export de trop » (symbole consommé uniquement par son propre
  fichier) → **conservés** : motif applicatif légitime de la règle 5 d'AGENTS.md
  (exporter une règle pure, la consommer localement). Retirer le mot-clé
  `export` serait du churn sans effet.
- **88** référencés par les tests **et** utilisés localement → **conservés**.
- **47** (dont les 8 modules du lot B) référencés par les tests et par rien
  d'autre → **triés** après vérification contradictoire, symbole par symbole,
  de l'existence d'un chemin exécuté équivalent.

**Supprimés (23 symboles, avec leur test ou sa portion morte)** :

| Symbole                                                                                                        | Preuve que la règle est exécutée ailleurs                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `carts.repo.clearCartDraftsAtomic`                                                                             | aucun canal `carts.clear` ; le vidage réel est le `DELETE FROM cart_drafts` de `saveCartDraftsAtomic` (`carts.repo.ts:102`)             |
| `client-access.buildActivationQrPayload` (V1) + `ACTIVATION_QR_PREFIX`                                         | V1 retirée du POS (repo `:95-98`), l'APK ne fait que la **lire** (`mobile/src/qr.ts:110`)                                               |
| `client-access.validateActivation`                                                                             | `clientAccessActivateSchema` (`validators.customers.ts:68-73`) à la frontière                                                           |
| `client-access.buildClientSnapshot` + types `Snapshot*Row` + `LOYALTY_MINOR_PER_POINT`                         | `buildSnapshotPayload` du main (`client-access.repo.ts:397`, `MINOR_PER_POINT :45`) — **et le test de boucle client est rebasé dessus** |
| `client-access.validateAnnouncement`                                                                           | `assertValidAnnouncement` (domaine) appelé en direct par l'UI + `announcementSaveSchema`                                                |
| `closing-rules.validateBusinessDate`                                                                           | `businessDate` Zod (`validators.common.ts:22-25`) sur les schémas de clôture                                                            |
| `intake-rules.resolveIntakeSellingPrice` / `validateAdjustment`                                                | `inventory.repo.ts:440-442` / `adjustStockAtomic :88-95`                                                                                |
| `stock-rules.applyStockDelta` / `assertReturnQuantity`                                                         | `computeAdjustmentNewStock` (vivant) / `returns.repo.ts:326-350` + déclencheur 0037                                                     |
| `money.addSafeMinor`                                                                                           | additions bornées du main (`sales.repo`, `returns.repo`, `amount-allocation`, `cost-allocation`)                                        |
| `ocr/matcher.extractBarcodeCandidates`                                                                         | extracteur par ligne `ocr/parser.ts:85` (seul chemin OCR réel)                                                                          |
| `packaging-rules.toBaseQuantity`                                                                               | `round3(qty × factor)` dans `sales.repo` (`:487,644,888`) et `inventory.repo`                                                           |
| `template-rules.nextTemplateVersion`                                                                           | `version = version + 1` SQL (`templates.repo.ts:111`)                                                                                   |
| `proforma-rules.assertProformaTransition` + type `ProformaStatus` (doublon de `features/proformas/types.ts:4`) | carte exécutée + TOCTOU `proformas.repo.ts:278-302`                                                                                     |
| `return-rules.assertAdditionalRefund`                                                                          | `returns.repo.ts:1471-1478`                                                                                                             |
| `po-rules.assertPoTransition`, `computePoTotals` + type `PurchaseOrderStatus`                                  | `PO_TRANSITIONS` + `purchases.repo.ts:71-82,217-227` ; bornes de lignes déjà imposées par `purchaseCreateSchema` (`min(1).max(200)`)    |
| `supplier-rules.applySupplierIntakeBalance`                                                                    | SQL `outstanding_balance_minor + ?` (`inventory.repo.ts:482`)                                                                           |
| `features/customers/types.sortCustomers`                                                                       | tri faisant autorité = SQL (`customers.repo.ts:151-170`), la copie locale était l'anti-pattern documenté                                |
| `mobile/src/store.staleLabel`                                                                                  | libellé de fraîcheur rendu par `screens/Home.tsx:99` (`formatDateFr(syncedAt)`) + pastille `App.tsx:506`                                |

**Conservés, avec la raison** : `RAW_GUARDED_CHANNELS` (garde exécutable de
`raw-guarded-channels.test.ts`), `memorySecretBackend` (injection DPAPI pour
les tests), le bloc `PIN_KDF_*` (contrat de parité `pin-kdf-parity.test.ts`),
`signDetached` / `verifyPayloadSignature` / `planPreset` / `hasFeatureAccess`
(primitives du **vendeur** de licence, face de `keygen.mjs`),
`allocateGlobalDiscount` (cross-check de `proforma-discount-parity.test.ts`),
`mobile` `allKeys` (test de fondation du client).

**Refusés parce que NON-PROUVÉS — et ce sont des trous réels, pas du code
mort** : `isQrExpired` (7 j), `isSessionExpired` (90 j) et `nextFailedState`
(5 échecs → verrou 5 min) du domaine `customer/client-access.ts`. Aucune
exécution ne les applique : le payload QR ne porte ni émission ni expiration,
aucune colonne `issued/expires/last_login` n'existe, `client_access.failed_attempts`
ne reçoit jamais que `0` à l'INSERT (`client-access.repo.ts:284`) et la
fonction Edge ne lit `locked_until` sans jamais l'incrémenter. Ces trois
constantes restent donc **la seule formulation de trois politiques de sécurité**
— les supprimer effacerait l'attente ; il faut les **brancher** (tranche
verticale propre, hors périmètre de ce lot). Même sort pour
`units.convertQuantity` + sa table `TO_BASE` (KG/G/L/ML) : aucune conversion
d'unité n'est exécutée aujourd'hui, la table est la seule expression du besoin.

## Constat de lot C : un test de boucle exerçait la copie morte

`tests/integration/client-loop.test.ts` fabriquait le cliché client avec
`buildClientSnapshot` (use-case **jamais branché**) puis le passait à
`syncNow`/`toHome`. La chaîne « vraie de vrai » annoncée par l'en-tête du test
ne l'était donc pas pour l'étape centrale : le contenu réel poussé vers Supabase
(`buildSnapshotPayload`) n'était testé **par personne**. Le test appelle
désormais le producteur exécuté pour les trois kinds
(`customer_snapshot`, `invoice_list`, `payment_list`) et le miroir n'est plus
un objet reconstitué à la main mais le JSON de production ; mêmes valeurs
affichées (dette 3 750,00 DZD, achats 12 500,00 DZD, 12 points, Sucre 1kg ×50),
deux assertions mensuelles ajoutées. Une garde `P5` de
`main-domain-parity.test.ts` fige en outre les deux cartes de transitions
(devis, commande) lues dans les repos main, puisque les copies domaine n'existent plus.

## Refusé — lot D : le schéma SQLite (destructif, non rentable)

Trouvés morts au niveau chaîne : table `app_meta`, colonnes
`company_profile.{postal_code,country,nis_number,ai_number,legal_form}`
(supplantées par la migration 0035), `customers.bread_profile_json`,
`daily_closings.z_report_path`, vues `v_daily_sales` et
`v_customer_balance_check`, plus 8 index de `bread_orders`.

Aucune suppression n'est engagée :

1. `bread_orders` et les pages licence `pain` sont **DELIBERATE-KEEP**
   (ADR-109) — l'audit de 2026-10-18 l'avait déjà acté, ce point n'est pas
   rouvert.
2. Une colonne ne coûte rien au repos ; la droppe exige une migration 0057
   **destructive**, donc irréversible sur les postes clients déjà livrés
   (règle 12 : les migrations appliquées sont immuables, et une suppression
   de colonne n'est pas rattrapable par un `git revert`).
3. `v_customer_balance_check` est lue par
   `tests/integration/returns-auto-settlement.test.ts:340` : il faudrait
   réécrire l'assertion avant d'y toucher.

Bilan gardé pour un arbitrage ultérieur, chiffré : 1 table, 12 colonnes,
2 vues, 8 index — pour zéro octet utile récupéré.

## Hors périmètre (constaté, non corrigé ici)

Le nettoyage de duplication n'est **pas** du code mort et engage des règles
d'argent ; il est reporté, documenté :

- `useOperationId` (`src/shared/ui/use-operation-id.ts`) n'a été adopté que
  par 5 dialogues ; 11 autres ré-implémentent
  `useState(() => newOperationId())` + régénération manuelle, et ~40 appels
  sont inline dans des handlers.
- Deux familles de formatteurs DZD coexistent : `formatDzdTotal` /
  `formatDzdTotalSigned` (plafond `MAX_MINOR_TOTAL`, utilisés par le tableau de
  bord) contre `formatDzdSafe` / `formatDzdSigned` (plafond
  `MAX_MINOR_SINGLE`, utilisés par Rapports et les marges produit) — un total
  de période > 10 M DZD s'affiche « — » dans le second chemin.
- `isRealCalendarDate` existe en trois exemplaires
  (`shared/dates/dates.ts:22`, `domain/common/dates.ts:5`,
  `electron/ipc/validators.common.ts:5`, ce dernier se déclarant lui-même
  « Duplique »).
- `fmtMinorDa` (`history.repo.ts:210`)clone `formatMinorDa`
  (`printing/receipt-documents/amounts.ts:142`) ;
  `normalizeBarcodeValue` (`shared/ui/barcode-input.ts:12`) mime
  `normalizeBarcodeText` (`electron/ipc/handlers/barcode-text.ts:6`) ;
  `formatBytes` (`shared/formatters/files.ts:5`) n'a pas été adopté partout.
- `VITE_DEV_SERVER_URL` (`electron/main/window-manager.ts:154`) n'est défini
  dans aucun `.env`, script npm ni config de build : la branche `loadURL` est
  hors service au démarrage `npm run` (documenté dans README, donc conservé).
- `inventory.allowNegativeStock` est un drapeau **only-write** : requis par le
  validateur, semé à `false` (0005), et écrit à `false` en dur par l'UI
  (`SettingsSectionsA.tsx:513`) ; plus aucun lecteur ne branche dessus depuis
  la suppression du curseur.

## Conséquence non prévue et traitée : les planchers de couverture mesuraient du code mort

`vitest` compte les tests comme du code exécuté, et les seuils **par fichier**
(`perFile: true`, 80/75/88/80) comme par configuration (`test:coverage`,
`test:coverage:features` 65 % fonctions) étaient partiellement portés par du
code **jamais exécuté en production**. Purger ce code a donc fait rougir des
portes qui étaient vertes pour de mauvaises raisons. Aucune seuil n'a été
abaissé ; trois réponses, chacune justifiée :

1. **`previewReturnSettlement` n'était couverte par personne** — rouge
   **pré-existant**, mesuré : la fonction a été ajoutée en session 54
   (`50a56cc`) et `git log -S` sur `tests/` ne remonte à aucun test. Fermée par
   deux cas réels dans `tests/unit/domain-rules.test.ts` (parité avec la
   version stricte, puis plafond à 0 sans exception au render).
2. **`src/domain/closings/closing-rules.ts`** — après retrait de
   `validateBusinessDate`, les trois gardes `Number.isSafeInteger(…) / < 0` sur
   les AGRÉGATS (`credits`, `debits`, `out`) restaient inatteignables : chaque
   champ d'entrée passe déjà `assertSafeTotal` (entier, 0..1e9), donc
   `credits ≤ 3e9`, `debits ≤ 2e9`, résultat dans `[-2e9, 3e9]` — tous entiers
   très loin de 2^53−1. Ces gardes sont du **code mort prouvé**, comme le bras
   salé de `formatDzd` du lot A : supprimées, avec la preuve écrite dans le
   fichier et l'indication de ce qui doit bouger si `MAX_MINOR_TOTAL` change
   (l'assertion d'entrée, et la formule réellement exécutée du Z,
   `finance.repo.ts:276`). Pas de changement de comportement : cette fonction
   n'est appelée que par `verify:domain` et les tests.
3. **`src/domain/proforma/proforma-rules.ts`** — le rejet « remise non entière »
   (`!Number.isSafeInteger(discountMinor)`) n'était testé que côté miroir main.
   Deux assertions ajoutées dans `proforma-discount-parity.test.ts` (1,5 et
   `NaN` refusés des deux côtés) : la parité est réellement prouvée maintenant.
4. **`test:coverage:features`** — la suppression de `sortCustomers` retire aussi
   ses 5 fermetures de comparaison comptées comme fonctions couvertes : le
   calcul exact (48/77 = 62,33 % après ; 54/83 = 65,06 % avant) montre que la
   porte ne tenait **que** grâce à ce code mort. Plutôt que d'abaisser le
   plancher, quatre actions vivantes du panier ont été couvertes dans
   `tests/unit/cart-tabs.test.ts` :
   `removeLine`, `clear`, `setSaleOperationId`, `hydrate` — soit exactement ce
   que la caisse fait d'un panier (retirer une ligne, vider en remettant
   client/paiement/opération à zéro, garder l'identité d'encaissement sur SON
   onglet, reprendre un brouillon corrompu sans crash ni duplication).
   52/77 = 67,5 %.

À retenir pour les prochaines sessions : mesurer `test:coverage` **et**
`test:coverage:features`, pas seulement `npm run test`, avant d'annoncer des
portes vertes.

- Surface retirée, mesurée sur l'arbre final contre `45e2c69` : **80 fichiers de
  code, 2 701 lignes supprimées / 1 274 ajoutées** (les ajouts sont les tests
  réécrits sur le chemin exécuté, les preuves et commentaires de parité, et la
  garde `P5`), pour **0 octet de schéma touché** et **0 migration**.
- `announcements.save` reste **vivant** et n'est pas re-signalé : la preuve de
  2026-10-19 tient (le seul écrivain de `announcements`, consommé par
  `buildSnapshotPayload` → Supabase → bandeau de l'APK). Il manque l'UI, pas
  le code.
- Un analyseur statique ne prouve pas l'exécution : le cas
  `recovery.retry` / `recovery.exit` (appelés depuis le HTML généré côté main,
  `recovery-view.ts:95`, `license-view.ts:95`) et
  `window.maximizedChanged` / `ocr.progress` (écoutes `ipcRenderer.on`, jamais
  `invoke`) ont été **réfutés** après vérification manuelle. La seule preuve
  absolue reste un traçage d'appels du pont — dette de couverture non traitée
  ici, déjà notée par l'audit de 2026-10-18 (§8.5).
- Portes exigées par AGENTS.md §8, mesurées sur l'arbre final : `format:check`,
  `typecheck`, `typecheck:electron`, `typecheck:manager`, `lint`, `test`,
  `test:coverage`, `build`, `build:electron`, `verify:migrations`,
  `verify:domain`, `verify:fr`, `verify:encoding`, `graphify update`.
