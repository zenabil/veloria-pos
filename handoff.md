# Handoff — Veloria POS (état au 2026-10-20)

> Document de continuité : tout ce qui a été fait, fichiers modifiés,
> erreurs (fermées/ouvertes), en-attente, commandes. Sessions 2026-10-07
> (§9), 2026-10-11 (§1-8) et 2026-10-12 (§10) archivées ci-dessous.
> §11 = session scan sans Entrée (2026-10-18). §12 = session politique
> opération→format d'impression (2026-10-18 bis). §13 = lancement POS
> opérateur (2026-10-18 ter). §14 = préparation du prompt d'audit
> dead-code (2026-10-18 quater). §15 = audit dead-code Phase A + lot 1
> (2026-10-18 quinquies). §16 = lot 2 (canaux IPC) + `knip.json` (2026-10-19).
> §17 = prompt d'audit intégral (2026-10-19 quinquies) — audit-first, 16 axes.
> §18 = **audit intégral EXÉCUTÉ** (2026-10-19 sexies) — 228 findings, 0
> correction de code, 3 livrables + ADR-120 proposé.
> Répondre à l'utilisateur en arabe.

## 1) État courant

- Branche : `chore/root-layout` — tête = `feat(ui): W10 - etat d'erreur persistant par ecran, coordonnees non codees en dur (audit 2026-10-19)`. **Arbre PROPRE** : le chantier impression (`*.capabilities`) a été **commité** en W5/W8/W9 (décision M5/Q5 résolue de fait) ⇒ plus de fichier non commité à stash.
- **Audit intégral EXÉCUTÉ (§18, 2026-10-19)** : 3 livrables — `docs/reports/FULL_AUDIT_2026-10-19.md` (rapport, 16 axes A→P, **228 findings** : 0 Critical · 23 High · 95 Medium · 110 Low) · `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` (plan en **11 vagues W0→W10**, ~11-13 j, 20 décisions owner) · `docs/ADR-120-*.md` (**proposé**, en attente d'approbation). Preuves brutes : `docs/reports/maintenance/audit-raw/`.
- **Remédiation : vagues W1 → W10 EXÉCUTÉES et commitées** : `0e900f1` **W1** (logique financière) · `cd43aa2` **W2** (sécurité) · `833cea1` **W3** (base) · **W4** (couverture verte + gardes auto-dérivées) · `1e56547` **W5** (rendu/UI caissier + atelier impression) · **W6** (code mort trié — ADR-127) · `4a96938` **W9** (encodage + chiffres à jour) · `7086954` **W8** (chemins chauds indexés, N+1, bundle) · **W7** (règles uniques — ADR-128) · **W10** (état d'erreur persistant — ADR-129). **Plan d'audit : TERMINÉ** (les 11 vagues sont exécutées).
- **Baseline gelé 2026-10-21 (mesuré, arbre propre)** : `tsc -b` **0** · `typecheck:electron` **0** · `eslint . --max-warnings 0` **exit 0** · `vitest` **142 fichiers / 976 tests** **0** · `test:db` **39 fichiers / 183 tests** **0** (isolé) · **`test:coverage` = EXIT 0 (VERT — 95,83 % lignes · 87,19 % branches · 100 % fonctions, seuils 80/75/88/80 par fichier ; aucun seuil abaissé)** · `knip` **0** (0 fichier, 0 export, 0 type, 0 dépendance) · `verify:migrations` **VERIFIED** · `verify:domain` **VERIFIED** · `verify:perf` **VERIFIED** · `verify:fr` **0** (322 fichiers, **plus de liste d'attente**) · `verify:encoding` **0** (868 fichiers) · `license:scan` **0** (1420 fichiers) · `format:check` **0** · `build` ✓ (12,1 s) · `build:electron` ✓ (manifeste signé **216 fichiers**).
- **Nouveaux constats P1 (non corrigés, voir plan)** : jour métier en UTC au lieu de `Africa/Algiers` (E-35) · `verify:licensing` hors CI (bloqué : l'état local du Manager n'existe pas sur un runner) · **E2E non rejoués** depuis le 2026-10-18.
- **Corrigé en W1→W10 (à ne plus re-signaler)** : `customers.accessQrSvg` sans staff-gate · `staffScope()` ⇒ «no session = gérant» · `database.optimize` sans gate · conversion Proforma→vente cassée si remise · clôture Z (chèque/transfert/dépenses/retours) · verrou de période close (W3) · unicité téléphone + `paginationSchema.page` borné (W3) · `test:coverage` rouge (W4) · `FROZEN_SCHEMA_COUNT` (W4) · extraction EAN-13/14 (W4) · `formatDzd` qui throw au rendu + double-submit + focus + lots bornés (W5) · atelier impression (W5) · code mort trié, `knip` à 0, `expo-constants` retirée, garde FR sans liste d'attente (W6) · chemins chauds indexés (migration 0050) + N+1 supprimés + bundle découpé (W8) · encodage réparé (W9) · **règles uniques (quantité/montant/date/normalisation) + état « en retard » produit (W7)** · **état d'erreur persistant dans 12 écrans (W10)**.
- ADRs : 001→**130**. `docs/INDEX.md` **à jour jusqu'à 130**.
- **3 bugs caisse signalés par le propriétaire (2026-10-21) — DIAGNOSTIC PROUVÉ (§23), CORRECTION EN ATTENTE** : (B1) focus qui revient au champ « Nom » de l'article libre — `useDialogFocus` rejoue son effet à chaque rendu (`onClose` inline = identité nouvelle) ⇒ refocus du 1ᵉʳ champ ; (B2) vente au poids en mode « Montant » : 50,00 DZD saisis mais **49,70 facturés** (poids arrondi à 3 déc. × prix ; le montant exact est perdu — ADR-114) ; (B3) panier mixte : `CHECK constraint failed: discount_amount_minor >= 0` (7× dans le journal du 2026-10-21) — une **majoration** (prix de ligne > prix d'origine) produit une remise négative, acceptée par le domaine mais **interdite par la base** ⇒ rollback + message générique ; **lien B1 → B3** (la saisie tronquée du prix force une correction par majoration). Décisions owner en attente (B2 : facturation exacte ou arrondie ; B3 : interdire ou autoriser la majoration).
- Outillage : `knip.json` (§16) — `Unused files` **32 → 0** ; re-mesuré 2026-10-21 : **0 fichier · 0 export · 0 type · 0 dépendance** (la couverture `knip` s'étend désormais à `license-manager/**` et `cloud/**` — J-11).
- **Contrats gelés (état après ADR-130)** : snapshot `ipc-channels.json` **178** (+`customers.import`) · `FROZEN_SCHEMA_COUNT` **122** · `FROZEN_EXPORT_COUNT = 128` · `FROZEN_SCHEMA_TOTAL` (op-id) **122** · `operation-id-coverage` : **44** REQUIRED + classification complète (122 schémas) · migrations **50** (migration 0050 = index de performance, non destructive).
- E2E (non relancés depuis le 2026-10-18) : suite 2026-10-18 — **12/13 specs vertes**, **37** blocs `test()` (pas 24) ; `full-loop-client` exige le relais `:8100` (hard-fail, pas skip) ; `installer` non exécutable hors paquet Win + UAC. **W2 touche `staffScope()` (K-04) et W3 ajoute un canal ⇒ les specs `staff-session` et `full-loop-client` sont à rejouer avant le tag.**
- **Packaging REFAIT 2026-10-21** (§21) : `release/` reconstruit **de zéro** (ADR-023 : jamais de réutilisation) — `Veloria-PoS-Setup-1.0.0.exe` (NSIS, machine, FR) + `.blockmap` · `Veloria-PoS-Portable-1.0.0.exe` · `Veloria-License-Manager-Setup-1.0.0.exe` + `.blockmap` · `Veloria-License-Manager-Portable-1.0.0.exe` · `SHA256SUMS.txt` · `release/win-unpacked/` (= POS). `release:smoke` **0** · `better-sqlite3` **chargé dans le runtime packagé** (Electron 37.2.0, ABI 136, SQLite 3.50.2 — règle AGENTS.md §9).
- Non relancés : E2E, `verify:licensing`, `npm audit` réseau (offline ⇒ non probant). **APK mobile impossible ici** : ni EAS CLI/jeton, ni JDK/Android SDK, ni `EXPO_PUBLIC_*` réel (placeholders dans `mobile/eas.json`).
- **Pièges découverts pendant l'audit** : (1) `npm run lint` passe sur `docs/**` ⇒ **tout `.mjs` déposé sous `docs/` casse la porte** (allowlist `allowDefaultProject` = 24 chemins, `eslint.config.mjs:31-58`) ; (2) `test:db` échoue (12 `Hook timed out`) si lancé **en parallèle** d'autres outils lourds ⇒ **`hookTimeout` passé à 60 s (W4)** ; (3) `format:check` échoue sur tout `.md` écrit à la main ⇒ **toujours** passer Prettier sur les livrables ; (4) `npm run build` seul invalide le manifeste licence ⇒ toujours enchaîner `build:electron` ; (5) `better-sqlite3` est compilé pour l'ABI Electron (136) : pour interroger la base hors GUI, passer par `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` ; (6) toute arête inter-features nouvelle fait **échouer** le test A3 ⇒ liste blanche `tests/unit/a3-organisation.test.ts` à mettre à jour dans le même commit ; (7) **`test:coverage` instrumentant tout le code, les tests d'intégration lourds dépassaient `testTimeout` (15 s) ⇒ passé à 60 s (W4)** ; (8) **écrire un fichier via `Set-Content` (PowerShell) corrompt l'UTF-8** (double encodage) ⇒ toujours écrire via l'outil d'édition ou un script Node.

## 2) Objectifs réalisés (11 → 12 oct 2026)

| #   | Objectif                  | Résultat                                                                                                                                                                 |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Nettoyage TEMP/cache      | TEMP user 1654→9 fichiers, +598 MB libres (opencode + verrous préservés) ; `npm cache verify` (39 MB GC)                                                                 |
| 2   | Packaging débloqué        | Developer Mode (`AllowDevelopmentWithoutDevLicense=1`) lève le blocage winCodeSign SANS admin — `package:win` + `package:manager` verts (ADR-070 respecté, `true` gardé) |
| 3   | Audit profond 3 UI        | 3 sous-agents + vérification manuelle : 0× P0, 7× P1, ~25× P2, plusieurs « dettes » réfutées (GRADIENTS utilisé, `share.ts` inexistant, `•••` voulu, haptics déjà câblé) |
| 4   | Correctifs radicaux       | 18 Manager + 9 Mobile + 13 POS (dont preload payload, JSON.parse gardé, startup fail-closed, restore, `useLicense(notify)`, SearchField/Select, clés stables) — ADR-080  |
| 5   | Design Phase 1 fondations | `::selection`/caret or, moment mouvement unique (modal+toast 160/180 ms), « Monnaie » héros 30 px — ADR-081 (D1/D10/D13 reformulés après refus craft-floor)              |
| 6   | Design Phase 2 surfaces   | Pastille+J-X Manager, bande « Aujourd'hui », salut horaire + impayés Mobile, barre crédit segmentée, glyphes SVG EmptyState — ADR-082 (D14 vérifié existant)             |
| 7   | Design Phase 3 profondeur | Densité (miroir useTheme), épinglés ★, total+Encaisser sticky, `useCountUp`, durcissement clair (10/10 hex couverts) — ADR-083                                           |
| 8   | Re-verdict complet        | 661/661 + E2E 24/24 (chrome 6, sale 4, reste 14) + re-packaging + checksums                                                                                              |

## 3) Fichiers modifiés (12 oct, par chantier, non commités)

- **Correctifs Manager** : `preload.ts`, `App.tsx`, `ipc-client.ts`,
  `manager-env.d.ts`, `registry.ts`, `validators.ts`, `licenses.ts`(inchangé —
  lecture seule), `manager-db.ts`, `integrity-check.ts`, `main.ts`,
  `window-manager.ts`, `styles.css`, `sign-manager-integrity.mjs`,
  `tests/unit/license-manager-presets.test.ts` (nouveau),
  `tests/unit/license-tamper.test.ts` (fixture P0-4 +preload).
- **Correctifs POS** : `use-license.ts`, `LicenseScreen.tsx`, `App.tsx`,
  `Sidebar.tsx`, `OcrImportDialog.tsx`, `IntakeDialog.tsx`,
  `ProductsBlock.tsx`, `ReportsScreen.tsx`, `widgets.tsx`,
  `DashboardScreen.tsx`, `ProformaDialogs.tsx`, `DetailsDrawer.tsx`
  (returns), `MovementsDialog.tsx`.
- **Correctifs Mobile** : `App.tsx`, `i18n.ts`, `Home.tsx`,
  `Invoices.tsx`, `QrScanner.tsx`, `tokens.ts`, `validate-env.mjs`
  (`staleLabel`/`allKeys` conservés — utilisés par les tests).
- **Design** : `globals.css`, `primitives.tsx` (Modal, EmptyState+glyphes),
  `ShellOverlays.tsx` (toasts), `PayDialog.tsx`, `SellTotalsPanel.tsx`
  (sticky), `CartPanel.tsx`, `TopBar.tsx` (densité), `use-density.ts`
  (nouveau), `use-count-up.ts` (nouveau), `shell-types.ts`,
  `SupplierPOsDialog.tsx`, + `license-manager/renderer/App.tsx`,
  `mobile/src/{App,Home,i18n}.tsx/ts` (Phase 2).
- **Docs** : `ADR-080`, `ADR-081`, `ADR-082`, `ADR-083`, `INDEX.md`.
- **Rebuildés (git-ignorés ou release/)** : `dist*/`, `release/` (4 exe +
  blockmaps + SHA256SUMS).

## 4) Erreurs découvertes (12 oct)

### Fermées (40+)

P1 : preload payload (recherche+rotation clé mortes), JSON.parse JSX,
startup sans catch, restore `selected` périmé, `standing_*` bruts,
`professional` brut, `use-license` silencieux · P2 : SearchField/Select
bruts, aria-label loupe, 8× catch silencieux, 10× `key={i}`,
MiniTable non-sticky, `createdAt` backups, `onConfirm` non-attendu,
double IPC recherche, preload hors حراسة, `licenseStatus` CREATE
contradictoire, labels sans `htmlFor`, `appInfo` mort, PRESETS sans
parity, endpoint mobile non-câblé, clés i18n/`STITCH` mortes, `:8100`
refusé par validate-env, stale-closure langue, `grant()` sans catch,
`key={p.name}`, `onEndReached` sans seuil · Design : `◌` Unicode,
toasts/modals sans mouvement, sélection/caret par défaut, total
PayDialog timide, liste Manager illisible, impayés invisibles (Mobile),
barre crédit continue, `bg-[#171207]`/`[#1c1113]` illisibles en clair.

### Ouvertes / assumées

1. **`installer.spec` jamais exécuté** : per-machine exige UAC élevé
   (skip documenté dans le spec lui-même, `:117-118`).
2. **`full-loop-client` exige relais `:8100`** (`e2e-mirror-relay.mjs`)
   - `PHONE`/`PIN` — non relancé cette session.
3. **Pas de remote/CI** : tags locaux uniquement (inchangé).
4. **Hex littéraux conservés** (`accent="#4edea3"`, `text-emerald-300`,
   `bg-[#1c1113]`, ~84 sites) : valeurs vérifiées = tokens ; migration
   partielle refusée (ADR-080, même rationale qu'ADR-075).
5. **E2E lent** : ~35-40 s/test (boot app) ; suite complète ≈ 25-30 min ;
   timeout 20 min insuffisant (pas un hang — prouvé par specs unitaires).
6. **`handoff.md` racine** : conservé (fichier de travail actif).
7. **Dette restante** : APK EAS (placeholders), specs E2E manquantes
   (11 specs), dû mobile soldé sauf Kit/annonces, harness hors périmètre.
8. **50 fichiers non commités** : en attente de revue + tag opérateur.

## 4bis) Session §15 — audit dead-code Phase A + lot 1 (2026-10-18)

**Livrable** : `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md` (Phase A, rapport
seul, zéro suppression) puis **lot 1 exécuté** sur autorisation opérateur
(« fais un plan et corrige radicalement »).

**Méthode** : `npx --yes knip` (219 candidats) + `npx --yes depcheck` +
`graphify` (6011 nœuds) ; chaque candidat revérifié par recherche exhaustive
avant toute suppression. 4 sous-agents `explore` en lecture seule ont couvert
`src/`, `electron/`, `tests/+scripts/+racine+dépendances`,
`license-manager/+mobile` ; la couche IPC à 3 niveaux (définition → preload →
appel renderer) a été vérifiée directement (les deux voies : wrapper
`api.*` **et** appel direct `call((a) => a.<ns>.<méthode>())`).

**Bilan** : 219 bruts → **212 faux positifs réfutés**, **47 findings réels**
(6 critiques · 31 sûrs · 6 « décision » · 2 hygiène).

**Supprimé (lot 1 — ADR-118)** : 21 fichiers, **148 lignes supprimées /
3 ajoutées** (commentaires devenus faux). `electron/` : alias
`clearCartDrafts`, `sumRemaining`, `expirationDate`, `LICENSE_SIGNATURE_ALG`,
`EXPIRING_CRITICAL_DAYS`, `sha256Hex`, `clearIntegrityCache`,
`clearFingerprintCache`, `setSecretBackendForTests`, réexport `TemplateRender`.
`src/` : 15 exports morts (thème/densité, `ModuleId`, `clampRetentionCount`,
`CLIENT_PIN_LENGTH`, `DebtAgingInput`, `agingBucketLabelFr`, `OcrDocumentKind`,
5× staff, `assertReceivableQuantity`, `ItemCondition`, 2× licence,
`CustomerDrawerState`). Tests : `acceptNextConfirm`, entrée dupliquée du
guard IPC. Dossiers : `src/shared/validation/`, `electron/database/migrations/`.

**Import orphelins retirés** (sinon `tsc -b` échoue, `noUnusedLocals`) :
`createHash` + `LICENSE_CRITICAL_DAYS` (`licensing/protocol.ts`).

**Portes avant → après** : `tsc -b` 0 → **0** · `eslint --max-warnings 0` 0 →
**0** · `vitest` **804 → 804** (121 fichiers, aucune perte) · `build` ✓ → ✓ ·
`build:electron` ✓ → ✓ (manifeste signé 214 fichiers) · `verify:migrations`
VERIFIED → **VERIFIED** · `verify:domain` VERIFIED → **VERIFIED** ·
`graphify update` OK (6011 nœuds / 16430 arêtes).

**Contrats gelés INTACTS** : `IPC_CHANNELS` (180), snapshot `ipc-channels.json`
(180), `FROZEN_SCHEMA_COUNT` (114), `operation-id-coverage` (R1). Les gardes
`bridge-shape` / `ipc-channel-inventory` / `validators-inventory` n'ont pas
été modifiées.

**Pièges écartés (ne pas « nettoyer »)** :

- `recovery.retry`/`recovery.exit` : appelés depuis le HTML **main**
  (`recovery-view.ts:95,100`, `license-view.ts:95`) — faussement morts.
- `bindings` : arête runtime transitive exigée par `better-sqlite3` (ADR-005).
- `mobile/**` + `license-manager/**` : points d'entrée Expo/electron-builder.
- `clearCartDraftsAtomic`, `CODE39/128*`, `STAFF_KDF_*`, `PIN_KDF_*`,
  `license/catalog.ts` : **test-only mais gardés** (couverture métier réelle,
  ADR-075 déjà tranché).

**Différé / à arbitrer** :

- **Lot 2 (ADR-119) — EXÉCUTÉ (§16)** : 3 canaux retirés (`sync.markSent`,
  `sync.pending`, `stock.ledger`) + 3 fonctions repo orphelines
  (`markOutboxSentAtomic`, `listPendingOutbox`, `Inventory.getLedger`).
  Snapshot 180 → **176** ; `FROZEN_SCHEMA_COUNT` 114 → **113**.
  `pushNowAtomic` marque la file `'sent'` lui-même (`sync.service.ts:263-270`)
  → les 2 canaux `sync.*` sont **supersédés techniquement**, pas « UI
  manquante ». La garde `retention` protège par **préfixe** `"sync."` → elle
  reste correcte ; le vecteur fantôme `"sync.markSent"` de
  `retention-critical.test.ts` a été retiré.
  **Conservés** : `announcements.save` (domaine+repo+validateur complets,
  seule l'UI manque → décision **produit**, pas du code mort) ;
  `templates.get` + `printer.get` (**hors périmètre** : schéma dans
  `validators.templates.ts`, handler dans `printing.receipt.ts` → fichiers du
  chantier impression non commité).
- `printer.get` + 24 réexports morts de `receipt-documents*` : **dans la zone
  du chantier impression non commité**, donc différés.
- `knip.json` + workspace `mobile` : ~95 % de faux positifs en moins pour un
  fichier de config, zéro changement de code.
- `RAW_GUARDED_CHANNELS` non appliqué (`ipc/raw-guards.ts:31`) ; garde
  `bridge-shape` ne couvrant que les noms `*Schema` (d'où la survie de
  `expirationDate`) ; `DT-03` : le validateur `expirationDate` **câblé** est
  le plus laxiste des deux.

**⚠ Dette de couverture** : `mobile/` n'est couvert par **aucun tsconfig**
(`typecheck` racine et `typecheck:manager` l'ignorent) ; seul `vitest` garde.

## 4ter) Session §16 — lot 2 : canaux IPC morts + `knip.json` (2026-10-19)

Autorisation opérateur : « fais un plan et corrige radicalement » puis
« tu as les permissions ». **Lot 1 déjà commité** (`20a705b`, ADR-118).

**Lot 2 (ADR-119)** — 3 canaux IPC retirés, sur les 6 candidats du rapport :

| Canal           | Handler                     | Fonction repo orpheline retirée                  |
| --------------- | --------------------------- | ------------------------------------------------ |
| `sync.markSent` | `registry.customers.ts:163` | `markOutboxSentAtomic` (`client-access.repo.ts`) |
| `sync.pending`  | `registry.customers.ts:170` | `listPendingOutbox` (`client-access.repo.ts`)    |
| `stock.ledger`  | `registry.stock.ts:14`      | `Inventory.getLedger` (`inventory.repo.ts`)      |

**Le fait qui tranche** : `pushNowAtomic` marque la file `'sent'` **lui-même**
dans sa transaction (`electron/sync/sync.service.ts:263-270`) et lit
lui-même les lignes `pending` (`:212-216`) → les 2 canaux `sync.*` sont
**supersédés techniquement**, pas des fonctionnalités à interface manquante.
`listPendingOutbox` était d'ailleurs explicitement étiqueté « pour le **futur**
agent de synchro » — un futur agent qui existe déjà (`pushNow`).

**Gardes synchronisées** : snapshot `ipc-channels.json` **180 → 176** ·
`IPC_CHANNELS` 180 → **177** clés (176 servis + `window.maximizedChanged`
push-only) · `FROZEN_SCHEMA_COUNT` **114 → 113** (`syncPendingSchema`) ·
vecteur fantôme `"sync.markSent"` retiré de `retention-critical.test.ts` ·
import + assertion `syncPendingSchema` retirés de `client-access.test.ts` ·
commentaire `retention.ts:42` corrigé (la garde protège par **préfixe**
`"sync."` → elle reste correcte : `sync.enqueue`/`pushNow`/`saveConfig`
subsistent).

**Conservés, et pourquoi** : `announcements.save` (domaine + repo + validateur

- handler **complets**, seule l'UI manque → décision **produit**) ·
  `templates.get` et `printer.get` (leurs fichiers sont dans le **chantier
  impression non commité** → mélanger deux chantiers dans un commit est
  interdit, AGENTS.md §10).

**Portes avant → après** : `tsc -b` 0 → **0** · `typecheck:electron` ✓ → ✓ ·
`typecheck:manager` ✓ → ✓ · `eslint --max-warnings 0` → **exit 0** ·
`vitest` **804 → 804** (121 fichiers) · `build` ✓ → ✓ · `build:electron` ✓ → ✓
· `verify:migrations` VERIFIED → **VERIFIED** · `verify:domain` VERIFIED →
**VERIFIED** · `graphify update` ✓.
**Gardes de contrat rejouées en isolation** : 37 assertions — `bridge-shape`
3/3 · `ipc-channel-inventory` 2/2 · `validators-inventory` 2/2 ·
`operation-id-coverage` 2/2 · `channel-alias` 4/4 · `client-access` 24/24.

**`knip.json` ajouté** (zéro changement de code) : candidats bruts
**219 → 30**, `Unused files` **32 → 0**. La clé décisive est
`ignoreExportsUsedInFile: true` : le dépôt exporte massivement des règles
pures consommées **dans leur propre fichier**, usage que knip ne comptait pas.
Les 27 `unused exports` restants sont **exactement** les findings vérifiés
manuellement (24 réexports `receipt-documents*` + `buildActivationQrPayload` +
`clearSecureState`) → **plus aucun faux positif résiduel**.

**Nouvelle trouvaille mobile** : `expo-constants` est déclaré dans
`mobile/package.json:23` mais **n'est importé nulle part** dans `mobile/src`.
Non supprimé : la correction exige `mobile/package-lock.json`
(**lockfiles intouchables**, consigne 3).

## 5) En attente (next actions)

> **Priorité 2026-10-19 (§18)** : le plan de remédiation
> `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` (11 vagues W0→W10) prime sur
> les items ci-dessous, qui y sont repris (Q1→Q20). **Prochaine action
> attendue : approbation du propriétaire sur (a) ADR-120, (b) Q5 (chantier
> impression : commit ou stash), (c) la vague W1 (logique financière).**

- [ ] **Lot 2 bis** : `templates.get` + `printer.get` + les 24 réexports morts
      de `receipt-documents*` — **nécessite le commit du chantier impression**
      d'abord (zone de chevauchement stricte). _(→ vague W6 du plan)_
- [ ] **`announcements.save`** : décision produit — construire l'UI des
      annonces magasin, ou retirer le canal + domaine + repo. _(→ Q1)_
- [ ] **`expo-constants`** : dépendance `mobile` inutilisée (retrait soumis à
      mise à jour du lockfile mobile). _(→ Q3)_
- [x] ~~**`docs/INDEX.md`** : étendre au-delà de ADR-103 (118 + 119 à ajouter)~~
      — **fait le 2026-10-19** : l'index était déjà complet jusqu'à ADR-119
      (l'affirmation « jusqu'à 103 » de l'ancien §1 était fausse) ; ADR-120
      et les 2 rapports d'audit y ont été ajoutés.
- [ ] **Revue + tag** de l'arbre checkpointé (HEAD `fec3acf`, §11) —
      proposition : tag local `v1.0.0-session-1018` après revue.
- [ ] **Session admin** : `installer.spec` (UAC) — seul gate jamais vert.
- [ ] **Relais + full-loop-client** : `node scripts/e2e-mirror-relay.mjs`
      puis spec client (PHONE/PIN).
- [ ] **Remote** : dépôt distant + push + CI (`.github/workflows/ci.yml`
      prête) ; alternative `git bundle` USB.
- [ ] **APK** : compte EAS + `eas.json` réel (placeholders refusés).
- [ ] **Phase design restante** : D2 sticky Mobile ? non — reste D5
      Mobile ? non. Reste : D15 soleil (contraste), D16 Mobile (compte),
      D3 presets ? — revoir liste §D (propositions 25-36, D15/D16 mobiles
      non faits).
- [ ] **Propositions fonctionnelles 1-36** : vagues à prioriser
      (irrigation directe : 15, 27, 14, 23).

## 6) Commandes

```powershell
npm run dev:electron          # dev (build electron + electron .)
npm test                      # vitest (661)
npm run test:e2e               # Playwright (electron.launch, workers:1, ~30 min total)
npx playwright test tests/e2e/sale-flow.spec.ts   # fumée rapide ciblée (~3 min)
node scripts/e2e-mirror-relay.mjs            # relais :8100 (prérequis full-loop)
npm run verify:migrations && npm run verify:domain && npm run verify:perf
npm run build && npm run build:electron      # TOUJOURS couplés (manifest, sinon e2e "tampered")
npm run package:win && npm run package:manager  # OK sans admin SI Developer Mode (reg AllowDevelopmentWithoutDevLicense=1)
npm run release:smoke && npm run release:checksums
npm run license:scan          # secrets (prepackage)
git tag -a vX -m "..."        # tags locaux (pas de remote)
```

Données test réutilisables (isolation par run) : client `0555123456` / PIN
au choix (6 chiffres) · service-key e2e `e2e-service-key-0123456789` ·
anon JWT `role:anon` (voir full-loop-client.spec.ts).

## 7) Règles à garder (AGENTS.md, résumé)

1. SQLite seule source métier · 2. Renderer = `window.veloria` uniquement ·
2. Pas de `run-sql`, canaux `domain.action` + Zod · 4. Centimes DZD + 1 tx +
   `operationId` · 5. Domaine sans framework, prepared statements ·
3. UI 100 % FR (mobile AR/FR), erreurs FR + log · 7. Tranches verticales ·
4. format → typecheck → tests → build · 9. better-sqlite3 vs Electron 37 ·
5. ADR-\*.md + INDEX · 11. Migrations IMMUABLES + verify vert ·
   12-13. Skill-first + routage (db/slice/ui-fr, impeccable+craft-floor
   avant tout edit UI, audit-avant-suppression, dragon si aucun match).
   Nouveaux : craft-floor refuse `border-left` coloré / anneaux décoratifs /
   `◌`-Unicode / cartes fantômes — reformuler, pas adoucir.

## 8) Pièges rencontrés (ne pas répéter — ajouts 12 oct)

- `build` renderer seul invalide le manifest → e2e licence `tampered` ;
  toujours enchaîner `build:electron` (re-confirmé 2026-10-18 : manifest
  re-signé 213 fichiers, E2E reparti).
- Toasts empilés (4,5 s) : drainer avant lecture du toast suivant.
- `getByLabel` matche aussi les `aria-label` des boutons (ex. nav) → préférer
  `title=` ou `data-path` si collision.
- thead sticky + `min-w-[1240px]` : clic ligne → bouton `Voir …` + scroll
  explicite ; `scroll-margin` global dans `globals.css`.
- `exactOptionalPropertyTypes` : `ref` par spread conditionnel.
- PowerShell 5.1 : pas de `sed/grep/tail` → outils `read/grep` natifs ;
  `Select-String` sans `-Recurse` ; chemins avec espaces entre `"..."`.
- `test-only-allow-expired.cjs` DOIT suivre `buildSecureStateV2` (H-3).
- QR V2 exige URL+anon configurés AVANT l'activation (ADR-068).
- e2e fenêtrage : écran < 1600×900 → démarrage maximisé (skips dédiés).
- **NOUVEAU** : `Select-String ... | Select-Object -Last N` bufferise tout
  jusqu'à la fin — en cas de timeout, zéro sortie (ce n'est pas un hang) ;
  rediriger vers fichier (`> $env:TEMP\x.log`) + lire le fichier.
- **NOUVEAU** : E2E ≈ 35-40 s/test (boot) → prévoir ~30 min ; valider par
  spec ciblée (`sale-flow`, `window-chrome`) avant la suite complète.
- **NOUVEAU** : `Set-Content` peut ré-encoder (mojibake) — vérifier
  `git diff` après toute réécriture hors `edit`.
- **NOUVEAU** : `edit` exige l'indentation exacte — en cas d'échec,
  afficher les espaces (`-replace ' ', '.'`) avant de réessayer.
- **NOUVEAU** : winCodeSign passe SANS admin si Developer Mode = 1
  (`mklink` cmd OK même si `New-Item` PS exige l'élévation) ;
  `signAndEditExecutable=false` reste INTERDIT (ADR-070).
- **NOUVEAU** : `noUncheckedIndexedAccess` — `split().map(Number)`
  donne `number|undefined` (garde explicite exigée).
- **NOUVEAU** : utilitaires Tailwind vs classes CSS perso en conflit de
  taille → une seule source (ex. `font-mono-currency-*` SANS `text-*`).
- **NOUVEAU (18 oct)** : `graphify update .` peut sortir code 1 APRÈS un
  update réussi (tip watch) — vérifier la sortie, pas le code retour.
- **NOUVEAU (18 oct)** : douchette E2E = rafale ≤ 60 ms → idle 90 ms
  (ADR-116) ; ne pas remonter `TEXT_IDLE_MS` (220 ms, frappe humaine),
  les specs « scan sans Entrée » en dépendent.
- **NOUVEAU (18 oct)** : `git commit` embarque TOUT l'index — un arbre
  multi-sessions peut avoir des fichiers PRÉ-STAGÉS (`D `/`RM ` dans
  `git status --short`) ; vérifier/stager par chemins avant commit.
- **NOUVEAU (18 oct ter)** : ne JAMAIS lancer un script GUI
  `npx electron script.cjs` pendant que le POS tourne (crash renderer de
  l'instance POS) — requêtes DB dev : `ELECTRON_RUN_AS_NODE=1 npx electron
script.cjs` (better-sqlite3 = ABI Electron ; `node` système échoue).

## 9) Archive session 2026-10-07 (topnav + Manager icon, ADR-072/073)

TopBar fusionné + Sidebar compacte horizontale + horloge fr-DZ 24h + mode
clair CSS-only + icône Manager (`resolveManagerIcon`). Vérifié + rebuildé ;
screenshots `docs/shots/pos-*.png`. Restes : sign-off visuel demandeur,
`test:e2e` packagé, Manager UI + APK refonts en attente, `graphify update .`
impossible (CLI absent).

## 10) Session 2026-10-12 (correctifs radicaux + design Phases 1-3)

- **Déblocage packaging** : Dev Mode → 4 exe signés + SHA256SUMS (×2
  rebuilds : après correctifs, après design).
- **Audit → 0 P0 / 7 P1 / ~25 P2** (3 sous-agents, findings vérifiés
  manuellement, dettes réfutées documentées en §4.7).
- **Correctifs** : 18 Manager + 13 POS + 9 Mobile + 2 tests
  (parity + fixture P0-4) — auteur mixte (sous-agents Manager/Mobile
  relus via `git diff`, POS en direct).
- **Design** (direction « دفع جريء محسوب », impeccable+craft-floor) :
  Phase 1 fondations, Phase 2 surfaces, Phase 3 profondeur
  (D5 densité, D6 épinglés ★, D2 sticky, D16 `useCountUp`, D8 clair).
- **État final** : 661/661, E2E 24/24, eslint 0, manifests signés,
  release/ frais, 50 fichiers en attente de revue/commit/tag.
- **Correctif jour (même date)** : écriture invisible en thème clair —
  pastels (`amber/emerald/red/sky-200/300`), variantes `/60-/80`,
  placeholder beige, `bg-black/40`, `hover:text-white` : tous mappés
  (contrastes AAA) ; preuve par captures E2E (`test-results/light-*`,
  git-ignorées, spec temporaire supprimé).

## 11) Session 2026-10-18 (scan douchette sans Entrée — ADR-116)

- **Demande opérateur** : le scan doit ajouter au panier SANS presser
  Entrée (et, pour les unités continues KG/G/L/ML/CL/M, ouvrir le dialogue
  quantité-ou-montant — déjà livré en ADR-114).
- **Constat** (3 reproductions E2E réelles) : l'ajout sans Entrée existait
  (debounce 220 ms ; Entrée en fin de rafale = no-op) mais deux failles —
  latence fixe 220 ms, et deux scans < 220 ms d'écart se CONCATÈNENT
  (`CODE1CODE2`) → « Code-barres inconnu », zéro ajout.
- **Fix ADR-116** : cadence machine = frappes ≤ 60 ms
  (`SCAN_BURST_GAP_MS`, aucun humain) → idle 90 ms (`SCAN_IDLE_MS`) si
  texte code-barres ; frappe humaine inchangée 220 ms (`TEXT_IDLE_MS`).
  Refs `lastKeyAtRef`/`scanBurstRef` (`useSellState`), décision pure
  `searchIdleMs` (sell-search).
- **Tests** : unit sales 69/69 (4 nouveaux : searchIdleMs, rafale/humain/
  texte) ; E2E `scan-flow` **6/6** — 3 nouveaux (sans Entrée focus champ ;
  sans Entrée focus perdu ; 2 scans à 180 ms → 2 lignes), ×2 passes
  stables ; vitest complet **795/795** ; eslint 0 ; `verify:*` VERIFIED.
- **Piège re-vécu** : `npm run build` seul → manifest licence « tampered »
  à l'import E2E ; `build:electron` re-signe (213 fichiers) — séquence
  obligatoire.
- **Git** : `734a69c` (purge harness) + `fec3acf` (checkpoint 295 fichiers
  = backlog ADR-080→115 + cette session ; scratch `check_like.py` /
  `full-inventory.txt` git-ignorés) + commit `docs(handoff)` de ce §11.
- **Restes** : revue + tag opérateur ; suite E2E complète, packaging,
  typecheck manager/mobile non relancés cette session.

## 12) Session 2026-10-18 bis (politique opération → format d'impression — ADR-117)

- **Demande opérateur** : cantonner le format d'impression par opération —
  vente / règlement / retour / bon de livraison / bon de commande fournisseur
  → **ticket 58/80 uniquement** ; devis → **A4 uniquement** ; étiquettes →
  tous gabarits adhésifs SAUF A4. Le 58 vs 80 reste le réglage
  imprimante/modèle existant (aucun sélecteur au moment d'imprimer).
- **Décisions (ADR-117)** : A4 banni de TOUT document de vente (historique,
  fiche client, dettes, aperçus + exports) ; devis ticket 80 mm supprimé ;
  canaux IPC `printing.printA4`, `printing.exportA4Pdf`,
  `printing.printProforma80mm` supprimés (30→27) ; constructeurs A4 de vente
  purgés (`receipt-a4.ts` supprimé, `buildA4Html`, `buildProformaText`,
  `buildPaymentTicketA4Html`, …) ; type doc `facture` retiré du Studio/Zod
  (6 types : ticket, proforma « Devis A4 », bon_livraison, recu, avoir,
  etiquette) ; papier A5 + gabarit `A4-24` retirés ; `pageAtRule` (chrome)
  toujours A4 ; Zod 116→114 ; étiquettes : microns non nuls
  (`labelFormatSchema` défaut `45x20`, limite 200 conservée),
  `exportLabelsPdf` → « etiquettes.pdf » ; capacités de licence historiques
  (ex. `invoice-a4`) conservées (concepts de licence) ; `autoPrintInvoice`
  inchangé (auto-impression = ticket). **Aucune migration** : 0036 immutable
  (ligne `facture` orpheline inoffensive ; `TEMPLATE_DOC_TYPES` ne la
  réinitialise plus) ; papier legacy invalide → miroir Zod = défauts
  complets (accepté).
- **E2E réparés au passage** (casse PRÉEXISTANTE — refonte recherche
  liste ADR-114 + porte session 0041 arrivées dans `fec3acf` sans mise à
  jour des specs) :
  - 7 specs : sélecteur résultat produit `getByRole("button")` →
    `getByRole("option")` (`SellSearchPanel`) — customer-invoice ×2,
    credit-return ×2, sale-flow ×2, pdf-export, restart, full-loop-client.
  - `restart` : placeholder historique périmé → `getByLabel` (libellé
    courant « Rechercher dans l'historique … »).
  - `license-activation` : franchit la porte session (`staffLoginIfNeeded`)
    après l'import externe + redémarrage — 4/4 vertes.
  - `factory-reset` : l'instance `app.relaunch()` (non pilotable par
    Playwright) bootstrappait la porte et consommait le code initial
    (affiché UNE fois, jamais en clair) → perdu pour la relance du harnais.
    Fix : boucle de frappe qui la tue AVANT son bootstrap (~5 s), puis
    relance pilotée — 2/2 stables.
  - `helpers.ts` : capacité `proformas` ajoutée (exigée par
    `exportProformaPdf`) ; commentaire `autoStaffLogin` à jour.
- **Preuves** : vitest **794/794** (121 fichiers ; snapshot IPC 27 canaux) ;
  `tsc -b` 0 (213 fichiers) ; eslint 0 ; prettier OK ; `build` +
  `build:electron` + manifest signé (213 fichiers) ;
  `verify:migrations`/`verify:domain` VERIFIED ; **13 specs E2E : 12/13
  vertes** (seul `installer` non exécutable — paquet Win requis), dont
  `pdf-export` réécrit (ticket 80 via `exportReceiptPdf` + devis A4 via
  `exportProformaPdf` + assertions négatives de purge des canaux) et
  `full-loop-client` avec relais `:8100`.
- **Pièges pour la suite** : ne jamais éditer une migration appliquée
  (0036 garde sa ligne `facture` — CHECK) ; tout nouveau test E2E caisse :
  résultats produit = `role="option"`, porte session = `staffLoginIfNeeded`
  (défaut du harnais), restart = relance pilotée après kill des instances
  auto-relancées ; `dist`/`dist-electron` doivent être rebuildés APRÈS tout
  changement src (build + `build:electron` re-signe le manifest).
- **Git** : `860c11a` (72 fichiers, ADR-117 + purge A4 + E2E) +
  commit `docs(handoff)` de ce §12. Tag opérateur à proposer :
  `v1.0.0-format-ops` après revue.

## 13) Session 2026-10-18 ter (lancement POS opérateur)

- **Demande opérateur** : « شغل pos و فعله » — lancer le POS et
  (licence) l'activer. Aucun changement de code.
- **Actions** : sources plus récentes que `dist-electron` (17 oct) →
  `npm run build` + `npm run build:electron` (manifest re-signé, 213
  fichiers, 18 oct 21:0x) ; `npm run verify:licensing` → **ACTIVE**
  (licence locale déjà importée, clé embarquée vérifiée) ; lancement
  `npx electron .` : `startup.ready` mode main ≈ 6,6 s, DB
  `C:\ProgramData\Veloria PoS\Data\Veloria POS DB.sqlite` schema 47,
  backup auto créé, porte session staff affichée (1 utilisateur :
  `admin` / « Gérant », role manager, actif).
- **Piège vécu (nouveau)** : lancer un script GUI `npx electron
script.cjs` PENDANT que le POS tourne → `renderer.gone reason
crashed` + crash GPU/service réseau de l'instance POS (2ᵉ lancement
  propre OK). Pour requêter la DB en dev sans GUI :
  `$env:ELECTRON_RUN_AS_NODE="1"; npx electron script.cjs` (better-sqlite3
  est compilé ABI Electron — `node` système échoue en
  NODE_MODULE_VERSION 136≠127).
- **Git** : arbre propre avant/après (builds git-ignorés) ; seul ce
  §13 + §8 commités (`docs(handoff)`).

## 14) Session 2026-10-18 quater (préparation du prompt d'audit dead-code)

- **Demande opérateur** : « برومبت احترافي » pour un audit complet des
  codes morts — aucun changement de code ; livrable = prompt prêt à
  coller, remis dans le chat (seul ce §14 est committé).
- **Prompt préparé** : audit-first (AGENTS §13/§14 + ADR-075) ;
  périmètre repo entier (src, electron, license-manager, mobile, cloud,
  private, tests, scripts, racine) ; knip/ts-prune/depcheck + repli rg ;
  vérification IPC 3 couches (channels ↔ preload ↔ renderer) + gardes
  `bridge-shape`, `ipc-channel-inventory`, `validators-inventory` ;
  rapport `docs/reports/DEAD_CODE_AUDIT_<date>.md` ; suppressions par
  lots APRÈS approbation explicite, portes format→typecheck→lint→tests→
  build + `graphify update` + handoff + commit par lot.
- **État arbre** : chantier impression en cours non commité (11 M :
  `validators.templates.ts`, `printing.receipt.ts`,
  `printing.templates.ts`, `receipt-documents*.ts`, `thermal.ts`,
  `template-rules.ts` ; 2 nouveaux : `printing.capabilities.ts`,
  `template-capabilities.ts`) — laissé intact, NON touché ici ; à
  committer par sa session dédiée après portes vertes.
- **Complément (même session)** : recommandation du modèle gratuit pour
  l'audit — `opencode/space-bunny-free#max` (1M ctx, zero-retention) ;
  alternatives `longcat-2.5-preview-free`, `beam-free#max`,
  `deepseek-v4.1-flash-free#high` ; à éviter pour du code confidentiel :
  Nemotron free (trial NVIDIA loggé), MiMo / Big Pickle. Sources :
  catalogue `tools.opencode.models` + models.dev + docs Console.
- **Git** : commits `docs(handoff)` explicites sur `handoff.md` uniquement
  (les fichiers du chantier impression restent dans l'arbre, non
  touchés).

## 17) Session 2026-10-19 quinquies (prompt d'audit intégral — 16 axes)

- **Demande opérateur** : « درس المشروع واكتبلي برومبت احترافي وصارم يقوم
  بفحص المشروع من كل أنواع المشاكل والأخطاء والأكواد الميتتة وغير المكتملة
  والزائدة وكل شيء، يعطيني تقرير شامل ومفصل وخطة إصلاحية جذرية » →
  livrable = **un prompt** à coller dans une session neuve. **Aucun changement
  de code métier** dans cette session.
- **Étude préalable du dépôt** (avant rédaction) : `AGENTS.md`, `handoff.md`
  (§1→§16), `package.json` (24 scripts), `eslint.config.mjs`,
  `knip.json`, `docs/STRUCTURE.md`, `docs/INDEX.md`, `docs/ADR-001..119`,
  `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md` (ADRs 075/118/119), arborescence
  `src/` `electron/` `tests/` `scripts/` `docs/` `license-manager/` `mobile/`
  `cloud/` `database/`, `tests/unit/` (85 fichiers de garde), `electron/ipc/`
  (24 canaux + 47 validateurs + 20 repos).
- **Livrable** : `docs/prompts/AUDIT_PROMPT_2026-10-19.md` (1080 lignes / 83 Ko).
  Structure : §1 contexte obligatoire (identite projet + 14 regles + gates +
  etat courant + pieges) · §2 livrables (3 fichiers) · §3 **10 regles de
  comportement strict** (audit-first, preuve obligatoire, classification de
  confiance, interdiction lockfiles/migrations, interdiction `--fix` pendant
  l'audit) · §4 **8 phases** (baseline → carte graphify → statique →
  dynamique → parite → securite → produit → synthese) · §5 **16 axes**
  (A→P) + **19 playbooks de domaine** (P1→P19 : caisse, paiements,
  stock/FIFO, clients/dettes, fournisseurs, retours, depenses, zakat/
  clotures, rapports, impression/PDF, OCR, licences, sync/cloud, backup/
  migrations, staff/PIN/RBAC, mobile, manager, scripts, packaging) +
  **matrice de couverture des artefacts** (type de fichier → controle →
  outil → preuve) + **politique de preuve et d'echantillonnage** ·
  §6 outils (knip, depcheck, ts-prune, madge, dpdm, jscpd, semgrep,
  gitleaks, osv-scanner, ast-grep, betterer, lizard, scc, npm audit) +
  cheatsheet de commandes + regles anti-false-positives · §7 **gabarit de
  rapport** (13 sections) · §8 **gabarit de plan** (vagues W0→W9) ·
  §9 livrables finaux · §10 **DoD** (14 points) · §11 style d'execution
  (explore/db-guardian/ui-fr/general) · §12 **echelle de severite +
  calcul de risque** (Impact × Likelihood → P0..P3) + definition P0
  Veloria · §13 **scenario d'execution** (5 phases + ordre des vagues +
  regle d'arret) · §14 **10 questions proprietaire** (Q1→Q10 avec defaut
  propose) · §15 **gabarits pret-a-l'emploi** (ADR en francais + messages
  de commit + entree handoff + checklist PR) · §16 **liste de deverrouillage
  des contrats figes** (snapshot IPC, FROZEN_SCHEMA_COUNT, operation-id
  coverage, manifeste, migrations) · §17 **profondeurs S/M/L**.
- **Chiffres re-vérifiés avant écriture** (écarts vs skills/docs signalés
  dans le prompt lui-même) : migrations = **47** (`0047_customer_search_norm.sql`)
  et non 0036 comme l'affirme le skill `veloria-db` ; `knip` 219→30 avec
  `Unused files`=0 ; 20 M + 3 nouveaux non commités (chantier impression) ;
  `RAW_GUARDED_CHANNELS` non appliqué (`electron/ipc/raw-guards.ts:31`) ;
  `bridge-shape` ne couvre que `*Schema` ; `docs/INDEX.md` s'arrête à ADR-103
  alors que 118/119 existent.
- **Pièges consignés dans le prompt** : `rg` absent du PATH · PowerShell 5.1 ·
  `Set-Content` mojibake · `git commit` balaie l'index (staging par chemins) ·
  `build` seul invalide le manifeste licence · ABI `better-sqlite3` =
  `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` · `graphify update` peut
  sortir code 1 après succès · `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`.
- **État arbre** : chantier impression (20 M + 3 N) **laissé intact** ; seul
  `docs/prompts/AUDIT_PROMPT_2026-10-19.md` + `handoff.md` + `docs/INDEX.md`
  sont commités (staging par chemins explicites, AGENTS.md §10).
- **Prochaine étape proposée** : coller le prompt dans une session neuve →
  Phase 0 (baseline + mesure des gates) → Phase 1 (carte graphify) →
  rapport `docs/reports/FULL_AUDIT_2026-10-19.md` + plan
  `..._PLAN.md` → puis exécution des vagues **avec approbation par vague**
  (ADR-075 : jamais de suppression automatique).
- **Git** : commit `docs(audit): prompt d'audit integral 16 axes (audit-first)`
  sur `docs/prompts/AUDIT_PROMPT_2026-10-19.md` + `docs/INDEX.md`, puis
  commit `docs(handoff)` séparé sur `handoff.md` (arbre sale → pas de
  commit handoff « arbre propre », commit explicite par chemins).

## 18) Session 2026-10-19 sexies — audit intégral EXÉCUTÉ (0 correction de code)

- **Demande opérateur** : « أنت مهندس جودة وأرشيف (code archaeologist) بمستوى
  staff+، ومكلَّف بإجراء تدقيق forensic شامل ونهائي لمشروع Veloria PoS، ثم إنتاج
  تقرير مفصّل و خطة إصلاح جذرية مرتّبة على موجات (waves) قابلة للتنفيذ. لا تُصلح
  شيئًا في هذه المرحلة. مخرجك الأساسي هو معرفة مُثبَتة + خطة. » ⇒ **3 livrables
  obligatoires** : rapport (M1) + plan en vagues (M2) + ADR optionnel (M3).
- **Livrable** :
  - `docs/reports/FULL_AUDIT_2026-10-19.md` — rapport intégral, 16 axes A→P,
    **228 findings** classifiés, chaque finding avec `file:line` + extrait +
    commande de reproduction + étiquette de confiance (PROUVÉ / DYNAMIC-RISK /
    TEST-ONLY / DUPLICATE / DELIBERATE-KEEP / REFUTED) + §12 «مُستبعد»
    (21 réfutations prouvées).
  - `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` — **11 vagues W0→W10** avec
    chemins explicites, pas, gates, rollback, dépendances, timeline, DoD,
    registre de déverrouillage des contrats gelés, et **20 décisions owner**
    en attente (§4, Q1→Q20).
  - `docs/ADR-120-guardes-de-contrat-auto-derivees.md` — **proposé** (en attente
    d'approbation) : « les gardes qui ne peuvent pas échouer ne sont pas des
    gardes ».
  - Preuves brutes : `docs/reports/maintenance/audit-raw/` (12 fichiers, 340 Ko).
- **Chiffres (avant → après)** : findings **0 → 228** (0 Critical · 23 High ·
  95 Medium · 110 Low) · canaux IPC **177** (mesure exacte) · schémas Zod réels
  **120** vs `FROZEN_SCHEMA_COUNT` **113** · `formatDzd` en render **268** sites
  vs `formatDzdSafe` **16** · `mobile/src` non typechecké **13/22** ·
  `test:coverage` **EXIT=1** (18 dépassements) · U+FFFD **113** caractères dans
  **20** fichiers `electron/ipc/*` · canaux IPC morts **6 → 3**.
- **Portes** (baseline mesuré, arbre sale) : `tsc -b` 0 · `typecheck:electron` 0
  · `typecheck:manager` 0 · `lint` exit 0 · `vitest` 121 fichiers / 804 tests
  0 · `test:db` 0 (isolé) · `verify:migrations` VERIFIED · `verify:domain`
  VERIFIED · `verify:perf` VERIFIED · `license:scan` 0 · `format:check` 0 ·
  `build` ✓ · `build:electron` ✓ (manifeste 214 fichiers) ·
  **`test:coverage` EXIT=1 — porte rouge, NON corrigée (audit-first)**.
- **Contrats gelés** : **inchangés** (aucun canal, aucun compteur, aucun
  snapshot modifié). Le passage `FROZEN_SCHEMA_COUNT` 113→120 est **proposé**
  en W4 (pas exécuté).
- **État arbre** : chantier impression (20 M + 3 N) **laissé intact** ; seuls
  `docs/reports/FULL_AUDIT_2026-10-19*.md`, `docs/ADR-120-*.md`,
  `docs/reports/maintenance/audit-raw/`, `docs/INDEX.md` et `handoff.md` sont
  commités (staging par chemins explicites, AGENTS.md §10).
- **En attente** : 20 décisions owner (Q1→Q20 du plan) — notamment **Q5**
  (commit/stash du chantier impression), **Q7** (source de vérité de la
  dette), **Q9** (`RAW_GUARDED_CHANNELS` : test ou suppression), **Q11**
  (seuil de couverture de `src/features`), **Q12** (majeur Electron) —
  plus l'approbation d'**ADR-120**.
- **Pièges** : (1) `npm run lint` scanne `docs/**` ⇒ un `.mjs` déposé sous
  `docs/` casse la porte (`allowDefaultProject` = liste de 24 chemins) ; (2)
  `test:db` échoue si lancé en parallèle d'outils lourds (`hookTimeout` 10 s
  par défaut vs 47 migrations rejouées par `beforeEach`) ; (3) `format:check`
  échoue sur tout `.md` non passé par Prettier ⇒ passer Prettier sur les
  livrables ; (4) `npm run build` seul invalide le manifeste licence.
- **Git** : commit `docs(audit): audit integral 16 axes - 228 findings, 0
correction` sur `docs/reports/FULL_AUDIT_2026-10-19.md` +
  `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` + `docs/ADR-120-*.md` +
  `docs/reports/maintenance/audit-raw/` + `docs/INDEX.md`, puis commit
  `docs(handoff): session 2026-10-19 sexies - audit integral execute (baseline
gele)` sur `handoff.md` seul.

## 19) Session 2026-10-19 septies → 2026-10-20 (remédiation : vagues W1, W2, W3)

- **Demande propriétaire** : « قم بالاصلاحات الجذرية اللازمة » (faire les
  corrections radicales nécessaires) — exécution du plan d'audit vague par
  vague, avec approbation implicitement donnée pour les vagues déjà
  listées dans `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md`.
- **Reprise de session** : la session « تدقيق Veloria PoS وخطة الإصلاح الجذري »
  (ouverte le 19/10 à 21:50) s'était interrompue au milieu de la vague **W3**
  (le commit W2 était posé, la migration 0048 était écrite mais jamais
  appliquée). W3 a été reprise depuis zéro : migrations, code main, UI,
  tests, portes, ADR.

### Vague W1 — logique financière (`0e900f1`)

- 7 High + 3 Low corrigés **sans migration** : E-20 (conversion devis remisé
  → vente : la remise globale est répartie sur les lignes, somme EXACTE au
  centime, `discount_type` reste `none` — ADR-121) · E-22 (clôture Z : espèces
  seules, dépenses `paid` seules, retours non annulés seuls) · E-23 (avoir >
  solde : plus d'ABORT technique, excédent reporté) · E-24 (source de vérité
  unique de la dette) · E-25 (annuler une vente encaissée supprime
  l'encaissement et remet le solde) · E-26 (correction de quantité journalisée
  en mouvement de stock) · E-27 (frais de livraison capitalisés dans le coût
  FIFO) · E-33 (historique : pas d'encaissements de ventes annulées) ·
  E-34 (arrondi monétaire « half away from zero » exact) · E-36 (zakat : la
  VRAIE fonction du domaine est appelée).
- Preuves : `docs/reports/maintenance/audit-raw/w1-gates.txt`.

### Vague W2 — sécurité, RBAC, contrats (`cd43aa2`)

- K-01 (`customers.accessQrSvg` exige `debts` : fuite du PIN client fermée) ·
  K-04 (`staffScope()` fail-closed : sans session, les lectures sensibles
  sont refusées) · K-05 (`database.optimize` protégé comme `database.reset`) ·
  A-09 (verrou « code à changer » appliqué aux 32 canaux bruts) ·
  A-04/A-05 (plus aucune erreur moteur brute vers l'opérateur) ·
  A-10/A-11/A-13 (`operationId` exigé sur `expenses.delete`,
  `backup.restore`, `database.relocate`) · A-17 **réfuté** (le confinement de
  `logo_path` existait déjà) · K-02/K-03 (License Manager packagé : pas de
  VITE_MANAGER_URL, `will-redirect`/`will-attach-webview` bloqués) ·
  G-15 (date calendaire impossible refusée par le Manager) · G-13 (la garde
  ESLint « pas d'arabe dans src/ » était **inerte** ⇒ remplacée par une porte
  réelle `verify:fr`, fail-closed) · G-21 (`typecheck:mobile`, `verify:fr`,
  `test:coverage` branchés dans le CI).

### Vague W3 — base de données et migrations (`833cea1`)

- **E-21 — verrou de période close** : migration `0048` (15 triggers
  `RAISE(ABORT)`) : une journée close devient **immuable** (ventes,
  encaissements, dépenses, retours, paiements fournisseurs). La seule issue
  est explicite : `closings.reopen` (nouveau canal, **gérant** uniquement,
  tracé en `audit_log` avec les montants d'origine, idempotent par
  `operationId`) + bouton « Rouvrir la journée » dans l'écran Rapports
  (gérants uniquement, confirmation explicite). Les messages des triggers
  sont mappés en FR dans `ipc-errors.ts` (sans quoi l'opérateur aurait vu
  « Une erreur inattendue est survenue »).
- **E-28 — unicité du téléphone client** : migration `0049` (2 triggers,
  comparaison sur les chiffres, miroir de `PHONE_DIGITS_EXPR`) + contrôle
  applicatif `assertPhoneAvailable` (création ET modification). Trigger et
  non index UNIQUE : un index UNIQUE échouerait sur l'historique (migration
  non applicable sur une base réelle) et interdirait la réutilisation d'un
  numéro porté par un client archivé.
- **E-31** : `paginationSchema.page` borné à 10 000 (`OFFSET` illimité
  interdit).
- **E-36** : les gardes deviennent **échecables** — `verify:migrations`
  assume 0045/0046/0047 (elles ne l'étaient pas) et ajoute les blocs
  0048/0049 + la **pureté de l'argent** (toute colonne `*_minor` est
  `INTEGER`) ; `verify:domain` vérifie que toute mutation IPC appelée
  depuis un registre est **dans une transaction** et **accepte un
  `operationId`** (59 mutations analysées, seuil de non-vacuitité = 40).
- **F-08** : la sonde de vérification d'une copie de base a des pragmas
  (`busy_timeout`, `foreign_keys`, `query_only`, `trusted_schema`).
- **Contrats modifiés** (ADR-122) : canaux IPC servis 176 → **177**
  (snapshot mis à jour) · `FROZEN_SCHEMA_COUNT` 113 → **114** (total réel
  120 → **121**) · migrations 47 → **49** (`0001..0047` IMMUABLES, 0048/0049
  **nouveaux**) · arête inter-features `reports>staff` ajoutée à la liste
  blanche du test A3 (`staff` est une feuille ⇒ zéro cycle).

### Portes (mesurées sur l'arbre sale, chantier impression non commité)

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `typecheck:manager`
0 · `eslint --max-warnings 0` exit 0 · **vitest 130 fichiers / 857 tests 0** ·
**test:db 36 fichiers / 162 tests 0** (isolé, sinon `Hook timed out`) ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `license:scan` 0 · `build` ✓ (30.3 s) · `build:electron` ✓
(manifeste signé 217 fichiers). **`test:coverage` reste ROUGE (EXIT 1, 18
dépassements) — c'est l'objet de la vague W4.**

### Nouveaux tests (17 cas)

`tests/database/closing-period-lock.test.ts` (6) ·
`tests/database/customers-phone-unique.test.ts` (6) ·
`tests/integration/closing-reopen.test.ts` (5).

### En attente / à faire

1. **W4** (prochaine vague) : `test:coverage` EXIT 0 + gardes auto-dérivées
   (`validators.staff.ts` ⇒ `FROZEN_SCHEMA_COUNT` 114 → 121) + test
   d'énumération de `RAW_GUARDED_CHANNELS`.
2. **Q5 non tranché** : le chantier impression (20 M + 3 nouveaux) reste
   **intact et non commité** — commit ou stash ? (décision propriétaire).
3. **20 décisions owner** du plan (§4) encore ouvertes (Q1→Q20), dont Q6
   (avoir en cours), Q7 (source de vérité de la dette), Q17 (jour métier
   `Africa/Algiers`), Q19 (APK/EAS).
4. **ADR-120** (gardes de contrat auto-dérivées) toujours **proposé**, non
   approuvé.
5. **E2E à rejouer** avant tout tag : `staff-session` et `full-loop-client`
   (touchés par K-04 en W2) + le nouveau canal `closings.reopen`.
6. `verify:licensing`, packaging `release/` et `npm audit` (réseau) non
   relancés.

### Pièges de cette session

- `better-sqlite3` est compilé pour l'**ABI Electron** (136) : tout script
  Node qui l'importe échoue (`NODE_MODULE_VERSION 127`). Contournement :
  `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` — c'est aussi le moyen de
  lire la base `opencode.db` pour retrouver l'historique d'une session.
- Le console PowerShell affiche le UTF-8 en mojibake : ne jamais écrire un
  `.md` via `Set-Content` (le fichier serait corrompu). Écrire via l'outil
  d'édition ou un script Node en UTF-8, puis passer Prettier.
- Une arête inter-features nouvelle ⇒ **le test A3 échoue** : penser à mettre à
  jour `tests/unit/a3-organisation.test.ts` dans le même commit.
- `eslint` casse sur tout `.cjs`/`.mjs` déposé à la racine du dépôt (hors
  `allowDefaultProject`) : les scripts d'analyse temporaires doivent être
  supprimés avant de commiter.

### Git

`0e900f1` (W1) · `cd43aa2` (W2) · `833cea1` (W3) — 3 commits, staffage par
chemins explicites (le chantier impression n'a jamais été balayé). Le commit
`docs(handoff)` de cette section est séparé, conformément à AGENTS.md §10.

## 20) Session 2026-10-20 (bis) — remédiation : vague W4 (couverture + gardes)

- **Demande propriétaire** : « اكمل » (continuer) — exécution de la vague
  suivante du plan d'audit : **W4 — couverture et tests**.
- **État hérité** : W1/W2/W3 commitées (`0e900f1`, `cd43aa2`, `833cea1`),
  `handoff.md` à jour (§19). `test:coverage` était **ROUGE** (EXIT 1,
  18 dépassements de seuil sur 5 fichiers domain) alors qu'il est **dans le
  CI depuis W2/G-21** ⇒ le CI était cassé par la vague W2.

### Ce qui a été fait

- **Aucun seuil abaissé** : les seuils par fichier restent
  `statements 80 / branches 75 / functions 88 / lines 80` (`perFile: true`).
  La couverture est passée de **89,3 % → 95,63 %** des lignes et
  **82,04 % → 86,96 %** des branches, **100 %** des fonctions.
- **33 nouveaux tests** (`tests/unit/domain-rules-coverage.test.ts`) sur les
  règles domaine non testées : produit (fiche, codes-barres EAN), retours
  (`computeReturnLineTotal` / `validateReturnLines` — **jamais appelées**
  avant), fournisseurs (tous les plafonds de champs, soldes, paiement >
  dette), bons de commande (200 lignes, transitions, libellés FR), import CSV
  (prix/quantité invalides, doublon, en-tête, plafond 5 000, clients).
- **6 nouveaux tests OCR** + **bug de production corrigé** :
  `src/domain/ocr/parser.ts:86` — le quantificateur `{12,13,14}` est
  INVALIDE en JavaScript (3 valeurs ⇒ motif littéral) ⇒ **les codes-barres
  EAN-13/UPC-A n'étaient JAMAIS extraits** de l'analyseur de factures
  (seuls les codes à 8 chiffres passaient). Corrigé en `{12,14}`.
- **Gardes rendues auto-dérivées** (capables d'échouer) :
  `RAW_GUARDED_CHANNELS` (constante décorative ⇒ **appliquée** : scan
  complet de `electron/`, 34 canaux gardés, 5 exceptions documentées avec
  raison) · `FROZEN_SCHEMA_COUNT` 114 → **121** (`validators.staff.ts`
  inclus) · `bridge-shape` : **tous** les exports (127) au lieu des seuls
  `*Schema`, seuil gelé (127), 0 export mort, 8 schémas NESTED documentés ·
  `operation-id-coverage` : classification **complète** (43 REQUIRED +
  20 exceptions LWW + assertion « tout schéma non listé n'exige pas
  operationId ») · `ipc-channel-inventory` : `ocr.progress` push-only
  vérifié explicitement · `a1-p0-boundary` : le test creux (C-05) réécrit
  (date impossible **réellement** refusée) · `pin-kdf-parity` : parité
  **comportementale** (main + relais E2E + fonction Edge **exécutés**,
  condensats comparés ; constantes comparées numériquement) + parité KDF
  **équipe** ajoutée (elle n'existait pas).
- **4 tests « miroir » convertis à la production** (I-03) :
  `payment-receipt` (→ `getCustomerPaymentReceipt`), `operation-id`
  (→ `saveZakatCalculation`), `carts-drafts` (→ `save/load/clear`),
  `atomic-slices` (→ `receiveStockAtomic`). Un « miroir » réécrivait la
  logique de production dans le test : il restait vert même si la
  production était supprimée ou inversée.
- **Timeouts** : `hookTimeout` 10 s → **60 s** (chaque `beforeEach` rejoue
  49 migrations ⇒ 12 « Hook timed out » en exécution parallèle) ;
  `testTimeout` 15 s → **60 s** (la couverture instrumente tout le code :
  `client-loop` et `repair-hardening` dépassaient 15 s ⇒ faux négatifs).
- **CI** : `npm run test:coverage` était déjà présent (W2) mais ROUGE ⇒ il
  devient vert. `npm run verify:licensing` **non** ajouté (il vérifie l'état
  local du Manager — clé privée + `.vlic` importé — absent d'un runner :
  il resterait rouge ; c'est une porte post-release vendor, comme `package*`).

### Portes (arbre sale, chantier impression non commité)

`test:coverage` **EXIT 0** (95,63 % lignes · 86,96 % branches · 100 %
fonctions) · `vitest` **132 fichiers / 907 tests** 0 · `test:db` **36
fichiers / 164 tests** 0 · `tsc -b` 0 · `typecheck:electron` 0 ·
`typecheck:manager` 0 · `eslint --max-warnings 0` exit 0 · `format:check` 0 ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `verify:fr` 0 · `license:scan` 0 · `build` ✓ (28,6 s) ·
`build:electron` ✓ (manifeste signé 217 fichiers).

### Contrat gelé modifié (ADR-123)

`FROZEN_SCHEMA_COUNT` 114 → **121** · nouvel invariant
`FROZEN_EXPORT_COUNT = 127` · liste `REQUIRED` de `operation-id-coverage`
complétée (23 → **43**). La cible de W4 prévue au plan (120) devient **121**
à cause du schéma `closingReopenSchema` ajouté en W3.

### En attente / à faire

1. **W5** (prochaine vague) : rendu et ergonomie caissier — `formatDzd()`
   qui throw pendant le rendu (268 sites), double-submit, `useBusyFlag`,
   écrans qui meurent.
2. **Q11** (seuil de couverture de `src/features`) : périmètre inchangé
   (`src/domain` + `src/application`, 80/75/88/80 par fichier). L'extension à
   l'UI (119 fichiers) reste à arbitrer.
3. Les **11 autres fichiers « miroir »** de l'audit (I-03) : à auditer vague
   par vague (le patron de conversion est donné par les 4 converts).
4. **Q5** toujours ouvert (workshop impression), **20 décisions owner**
   (§4 du plan), **ADR-120** toujours proposé non approuvé.
5. **E2E à rejouer** avant tout tag : `staff-session`, `full-loop-client`.

## 23) Session 2026-10-21 (bis) - diagnostic des 3 bugs caisse (propriétaire)

**Demande** : « عند إضافة منتج حر إلى السلة… الاسم يكتب عادي لكن السعر يرجع
لخانة الاسم » · « منتج بالوزن 700 دج/كغ، بيع 50 دج ⇒ السلة تكتب 49,7 دج »
· « السلة مختلطة (حر + وزن + قائمة + خصة) ⇒ البيع لا يمر ويظهر خطأ ».

**Méthode** : lecture du code + **preuve par les données réelles** —
journal main `%APPDATA%\Veloria PoS\logs\veloria-2026-10-21.log` + base
`%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite` (6 ventes, 10 lignes) +
reproduction sur base migrée temporaire (repos réels `createSaleAtomic`).

### B1 — focus qui revient au champ « Nom » (article libre)

`useDialogFocus` (`src/shared/ui/primitives.tsx:313-355`) : `useEffect` avec
dépendances `[boxRef, onClose, extraKey]`. `onClose` arrive du parent sous
forme de flécheta **inline** (`SellScreen.tsx:297` `onCloseCustom={() =>
s.setCustomOpen(false)}`) ⇒ **identité nouvelle à chaque rendu** ⇒ l'effet
rejoue à chaque frappe : le cleanup rend le focus à l'ouvrant puis l'effet
refocus **le PREMIER `input` du dialogue** = « Nom du produit » (le prix est le
2ᵉ). Symptôme exact : 1 chiffre saisi puis retour au nom.
**Portée : tous les modales/tiroirs** dont `onClose` est inline (visible
seulement là où le champ|Lu n'est pas le premier).
Correctif : `onClose`/`extraKey` dans une ref, dépendances `[boxRef]` seul.

### B2 — montant saisi au poids ≠ montant facturé (49,70 au lieu de 50,00)

`weightDialogPreview` (`src/features/sales/sell/sell-weight.ts:64-84`) : mode
« Montant » → `qty = round(montant/prix, 3 déc.)` puis
`total = prix × qty` (`computeLineTotal`). 50,00 DZD à 700,00 DZD/kg ⇒
`qty = 0,071 kg` ⇒ total = **49,70 DZD** (100,00 DZD ⇒ 0,143 kg ⇒ **100,10**).
Le montant exact est **perdu** : `onConfirm(preview.qty)` ne transmet que la
quantité. **Preuve base réelle** : vente `FAC-2026-00006`, ligne « bil »
⇒ `quantity 0.071`, `line_total_minor 4970`.
Comportement « par design » (ADR-114 : facturer le poids arrondi), mais le
caissier **perd de la argent** ⇒ écart métier à trancher (voir §23 « à
trancher »).

### B3 — vente du panier mixte refusée (cause PROUVE)

Journal main, 7 fois le 2026-10-21 (20:27→20:32 UTC), canal `sales.create` :
`CHECK constraint failed: discount_amount_minor >= 0`.
Mécanique : un prix de ligne **supérieur** au prix d'origine (majoration)
⇒ remise de ligne **négative** (`origin − facturé < 0`) ⇒ le domaine
l'accepte (remise signée, « majoration admise ») mais la base l'interdit
(`sales.discount_amount_minor >= 0` — migration 0001 immuable + trigger
`trg_sale_items_discount_nonneg_ins` — migration 0031) ⇒ rollback total ⇒ le
caissier voit « Une erreur inattendue est survenue. Réessayez. »
**Lien B1 → B3** : le focus B1 tronque la saisie du prix de l'article libre
(ex. « 5 » au lieu de « 500 ») ⇒ le caissier corrige via le P.U. du panier
(prix **supérieur**) ⇒ la vente est refusée.
**Aggravant** : la garde main « Remise de ligne invalide pour « X » » est
exécutée **APRÈS** l'INSERT de la vente (boucle des lignes) ⇒ l'erreur SQL
brute gagne ⇒ message technique au lieu du FR (violation AGENTS §6).
Reproduction (repos réels, base migrée) : `discountAmount = -49500` ⇒
`CHECK constraint failed: discount_amount_minor >= 0`, **0 vente créée**.

### Constat secondaire (à vérifier)

Ventes `FAC-2026-00001/3/4/6` enregistrées avec `amount_paid_minor = 0` ⇒
**ventes à crédit** (reste = total) au lieu d'encaissement comptant ; la
vente 6 a `credit_limit_override = 1` (le caissier a coché le dépassement).
Piste : l'effet de synchro `paidText → cart.amountPaidMinor`
(`useSellState.ts:190-195`) borne à `totalMinor`, qui vaut **0** quand
`computeSaleTotals` lève (« Le montant payé doit être entre 0 et le total »,
soit un panier qui rétrécit après un montant saisi) ⇒ montant payé → 0.

### À trancher par le propriétaire

1. **B2** : (a) facturer le poids arrondi (ADR-114) mais l'annoncer
   explicitement (« 50,00 DZD ⇒ 71 g ⇒ 49,70 DZD facturés ») ; (b) facturer
   le montant saisi **exact** ⇒ la ligne porte un montant facturé propre ⇒
   la remise peut devenir négative ⇒ **reconstruction de la table `sales`**
   (SQLite ne sait pas supprimer un CHECK) + trigger 0031 + domaine + rapports
   ⇒ **nouvelle migration + ADR** ; (c) compromis : facturer le montant
   exact en portant un prix unitaire effectif (perte du prix catalogue sur le
   ticket).
2. **B3** : (a) interdire la majoration (message FR : « le prix ne peut pas
   dépasser le prix catalogue ») — simple, invariant DB respecté ; (b)
   autoriser la majoration de bout en bout (remise signée) ⇒ même migration
   que B2(b) ⇒ **une seule migration** pour les deux.
3. **B1** : correctif obvious (ref dans `useDialogFocus`) + test de non-régression.

**Aucun code modifié dans cette session** (diagnostic seul ; le fichier de
reproduction temporaire a été supprimé).

## 21) Session 2026-10-21 — remédiation : fin du plan d'audit (W6, W7, W10)

- **Demande propriétaire** : « اكمل الجلسة المسماة "تدقيق Veloria PoS وخطة
  الإصلاح الجذري" المفتوحة بتاريخ 20 oct 2026 على الساعة 14:56 » — reprise
  exacte de la session `ses_ea6665c78ffeLz5b52nyesQy1d` (état restauré depuis
  `opencode.db` : 804 messages, work-in-progress W6 interrompu sur une
  question au propriétaire).
- **État hérité** : W1→W5, W8, W9 commitées ; **W6 (code mort) à moitié
  fait** (4 fichiers modifiés, non commités) ; la question laissée en
  suspens portait sur `expo-constants` (dépendance mobile fantôme).

### Vague W6 — code mort trié (`60211cf`, ADR-127)

- **Correction d'un excès de la session précédente** : la suppression
  aveugle des 24 ré-exports du barrel d'impression a **cassé le build**
  (`tsc` : 8 symboles consommés par la suite de tests) ⇒ le rapport `knip`
  **ne voit pas** l'usage par les tests : la preuve, c'est la porte
  `typecheck`, pas l'outil. Règle retenue : _recherche exhaustive + tsc +
  suite complète_, jamais le rapport seul.
- **B-03** : le miroir main du constructeur de QR V1 est supprimé (le POS
  n'émet plus que la V2) ; le **format** V1 reste lu par l'APK et décrit par
  le use-case applicatif (spécification exécutée par son test).
- **B-02** : `clearSecureState()` supprimé (aucun flux ne l'appelait).
- **B-32** (décision propriétaire : « retirer + lockfile régénéré ») :
  `expo-constants` retirée de `mobile/package.json` ; le lockfile n'est
  modifié que sur **une ligne** (npm réécrivait aussi des champs `libc`
  sans rapport — écartés pour ne pas polluer la revue) ; la dépendance reste
  dans l'arbre comme **transitive** de `expo` (correct).
- **B-36** : `tailwindcss` retiré de `ignoreDependencies`.
- **O-05** : les 2 commentaires arabes de l'impression sont corrigés ⇒ la
  liste `PENDING_WORKSHOP` de `verify-fr-only.mjs` est **supprimée** (la
  garde FR est pleine : 321 fichiers, plus de dérogation temporaire).
- Résultat : **`knip` = 0** (0 fichier, 0 export, 0 type, 0 dépendance).

### Vague W7 — règles uniques (ADR-128)

8 duplications supprimées, une par une, avec test de parité :

| #    | Règle unique (source)                                    | Copies supprimées                                               |
| ---- | -------------------------------------------------------- | --------------------------------------------------------------- |
| D-02 | `parseQuantityInput` (`domain/common/quantity.ts`)       | `parseQtyInput`, `parseQty`, `parseQuantityInput` (weight-sale) |
| D-03 | `formatQuantityFr` (idem)                                | `fmtQty`, `formatQtyFr`                                         |
| D-04 | `percentOfMinor` (`domain/money/money.ts`)               | 2 calculs _inline_ (zakat, restockage)                          |
| D-05 | `multiplyMinorByQuantitySafe` (variante qui ne lève pas) | 7 `Math.round(prix × qté)` sans garde                           |
| D-06 | `daysBetween` (`domain/common/dates.ts`)                 | 3 implémentations d'écart en jours                              |
| D-07 | `strictOrNum` (`@shared/money/parse.ts`)                 | copie locale (réception)                                        |
| D-08 | `toMinorSafe` (`domain/money/money.ts`)                  | `asMinor`                                                       |

- **E-29** : le renderer normalise désormais le nom client **exactement**
  comme le main (« Cœur » ⇒ `coeur`, plus « c eur ») + test de parité sur
  16 vecteurs.
- **E-30** : l'état `'overdue'` **existe enfin** (règle unique dans
  `electron/ipc/handlers/debt-status.ts` : une vente ouverte échue) — écrit
  dans les 4 écritures du solde **et** recalculé à la lecture (l'échéance
  dépend du temps : un état matérialisé ne peut pas suivre le temps) ;
  `agingBucket` (code mort) supprimé. Trois flux ont été réordonnés
  (encaissement, avoir sur retour, annulation) pour que le statut soit lu
  dans l'état final de la transaction.
- **J-11** : `knip` couvre `license-manager/**` et `cloud/**` (la Edge
  Function est déclarée `entry`).
- 2 nouveaux tests : `parity-normalisation.test.ts` (E-29) et
  `money-rule-convergence.test.ts` (D-02 → D-08).

### Vague W10 — état d'erreur persistant (ADR-129)

- **A-06** : 12 écrans de données déclarent un état d'erreur **persistant**
  (`loadError`) et l'affichent via la nouvelle primitive `ErrorState`
  (`role="alert"`, message FR, icône) — l'erreur ne disparaît plus en 4,5 s
  et un tableau vide après un échec ne passe plus pour « aucune donnée ».
- Garde : `tests/unit/a06-screen-error-state.test.ts` (14 cas) parcourt les
  écrans et exige état + affichage (exemptions documentées : licence,
  caisse, réglages).
- **A-28** : le téléphone/e-mail codés en dur dans « À propos » sont
  remplacés par la **fiche entreprise** (réglable par le commerçant).
- **A-07 / A-27** : déjà traités en W5 (rappelés dans l'ADR).

### Portes (arbre propre, 2026-10-21)

`test:coverage` **EXIT 0** (95,83 % lignes · 87,19 % branches · 100 %
fonctions — aucun seuil abaissé) · `vitest` **140 fichiers / 964 tests** 0 ·
`test:db` **38 fichiers / 177 tests** 0 · `tsc -b` 0 · `typecheck:electron` 0 ·
`eslint --max-warnings 0` exit 0 · `format:check` 0 · **`knip` 0** ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `verify:fr` 0 (322 fichiers) · `verify:encoding` 0 (864 fichiers) ·
`license:scan` 0 (1367 fichiers) · `build` ✓ (12,1 s) · `build:electron` ✓
(manifeste signé 216 fichiers).

### Packaging (2026-10-21, après les vagues)

`release/` **reconstruit de zéro** (ADR-023 : jamais de réutilisation) :

| Artefact                                        | Taille   | SHA-256 (début)                                                    |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `Veloria-PoS-Setup-1.0.0.exe` (NSIS machine FR) | 129,4 Mo | `3fa6b662b3c963f14cbb4a20040cde7693e54650adff9194b8660634f63f868f` |
| `Veloria-PoS-Portable-1.0.0.exe`                | 128,9 Mo | `60742079adbb07637f3d92a1222d46305a6127d34f3c5ebd095ae7ec87a530e5` |
| `Veloria-License-Manager-Setup-1.0.0.exe`       | 111,5 Mo | `021da8b4684bf3da87dc1ca0d1340914533ee9acd1af5325f9c05973a99a3331` |
| `Veloria-License-Manager-Portable-1.0.0.exe`    | 111,1 Mo | `55f7e68535afea531274aed7b69ceec11b419f05fd7c624cd1cb84e1c3ffeec7` |

- 2 `.blockmap` + `SHA256SUMS.txt` + `release/win-unpacked/` (= POS).
  `release:smoke` **EXIT 0** (dist, preload sandbox-safe, stamps CommonJS,
  manifeste manager) · `better-sqlite3` **chargé dans le runtime packagé**
  (Electron 37.2.0, ABI 136, SQLite 3.50.2 — règle AGENTS.md §9).
  **APK mobile non construit** : ni EAS CLI/jeton, ni JDK/Android SDK, ni
  `EXPO_PUBLIC_*` réel (placeholders) ⇒ action propriétaire.

### En attente / à faire

1. **E2E à rejouer** avant tout tag : `staff-session` et `full-loop-client`
   (touchés par K-04 en W2 et par le canal `closings.reopen` en W3).
2. `verify:licensing`, packaging `release/`, `npm audit` (réseau) non
   relancés (hors périmètre / réseau).
3. **ADR-120** toujours _proposé_ (non approuvé) · les autres décisions
   owner du plan (§4) : Q6 (avoir en cours), Q7 (source de vérité de la
   dette), Q17 (jour métier `Africa/Algiers`), Q19 (APK/EAS).
4. Reste à faire hors plan d'audit : Q11 (extension du seuil de couverture
   à `src/features`), les 11 autres fichiers « miroir » (I-03).

### Pièges de cette session

- **`knip` ne voit pas l'usage d'un export par les tests** ⇒ ne jamais
  supprimer sur la foi du rapport : recherche exhaustive + `tsc -b` + suite.
- **Packaging** : `package:win` / `package:manager` exigent le privilège
  symlink (`signAndEditExecutable: true`, ADR-070) ⇒ **Developer Mode**
  (`AllowDevelopmentWithoutDevLicense=1`) pour construire **sans admin**.
  Les deux configs partagent `directories.output: release` ⇒ le second
  build **écrase `release/win-unpacked`** : construire le POS **en dernier**
  pour que `win-unpacked` contienne le POS (c'est lui qu'on teste au
  runtime). Le cache electron-builder est vide ⇒ premier build télécharge
  Electron (123 Mo) + winCodeSign + NSIS (~6 min).
- `npm run test:coverage 2>&1 | Select-Object -First N` : le `-First` ferme
  le pipeline et **tue** le run (sortie tronquée) ⇒ écrire dans un fichier
  (`> file 2>&1`) puis lire le fichier.
- `opencode.db` (historique des sessions) s'ouvre avec
  `node --experimental-sqlite` : `better-sqlite3` du projet est compilé pour
  l'ABI Electron (136) et refuse de charger sous Node 22 (ABI 127).
- Un `while` de recherche qui ne fait pas progresser l'index boucle à
  l'infini : écrire les scripts Node hors du dépôt (dossier TEMP) et les
  supprimer après usage (un `.cjs` à la racine casse `eslint`).
- **Vérifier le module natif packagé** : `require` du chemin **asar**
  (`resources/app.asar/node_modules/better-sqlite3`), pas du chemin
  `app.asar.unpacked` (le `bindings` n'y est pas) —
  `ELECTRON_RUN_AS_NODE=1 "release\win-unpacked\Veloria PoS.exe" script.js`.

## 22) Session 2026-10-21 (bis) — import/export CSV (Clients, Produits) + re-emballage

- **Demande propriétaire** : « اضف خاصية الاستراد و التصدير في صفحتي
  العملاء و المنتجات و تحقق منهما » — l'import clients et l'export produits
  manquaient (les deux écrans étaient asymétriques).
- **État hérité** : W1→W10 commitées, `release/` reconstruit (§21), arbre
  propre. Une **session concurrente** travaille sur un bug « panier mixte »
  (fichier `tests/integration/_repro-mixed-cart.test.ts`, TEMP) : ce fichier
  n'a **pas** été touché ni commité (staffage par chemins explicites).

### Ce qui a été fait (ADR-130, commit `8b55f3c`)

- **Import clients** (slice verticale complète) : le parseur de domaine
  existait déjà (`parseCustomersCsv`) mais **personne ne l'utilisait** ⇒
  chemin d'écriture complet :
  `importCustomersAtomic` (main, UNE transaction, tout-ou-rien) · canal
  `customers.import` + `customersImportSchema` (Zod) · preload ·
  `api.customerImport` · portes staff (`debts`) et licence (`customers`) ·
  bouton « Import CSV » + champ fichier masqué + confirmation FR.
  Garanties : unicité du téléphone **E-28** vérifiée AVANT l'écriture (message
  FR, pas de rollback du trigger 0049) · doublon dans le même fichier refusé ·
  **idempotence de lot** par `operationId` · `search_norm` recalculé (0047) ·
  aucune dette/plafond créés (l'import ne fait que des fiches).
- **Export produits** (renderer) : **toutes** les pages du filtre courant
  (parcours borné en concurrence + progression), montants DZD formatés,
  code-barres et statut inclus.
- **Contrats gelés** (documentés dans l'ADR) : canaux 177 → **178** ·
  `FROZEN_SCHEMA_COUNT` 121 → **122** · `FROZEN_EXPORT_COUNT` 127 → **128** ·
  `FROZEN_SCHEMA_TOTAL` 121 → **122** · `operationId` REQUIRED 43 → **44**.
- **Tests** : `tests/integration/customers-import.test.ts` (6 cas) +
  `tests/unit/import-export-ui.test.ts` (6 cas : garde statique du câblage
  renderer + lignes CSV de l'export + interdiction SQLite/Node dans l'UI) +
  `tests/e2e/csv-import-export.spec.ts` (**3 cas, E2E RÉEL** : le fichier CSV
  est importé par le main et la fiche apparaît dans le tableau avec son
  téléphone ; un fichier invalide est refusé **sans écrire de fiche** ; les
  deux exports parcourent le filtre et rapportent le compte de lignes).
  Note : l'événement `download` de Playwright n'est pas émis par Electron
  (téléchargement géré par la session Chromium) ⇒ l'export est vérifié par
  son **effet** (toast FR) et son contenu par le test unitaire.

### Formats (rappel)

- **export = RAPPORT** (lisible dans Excel) ;
- **import = flux de DONNÉES** : clients `prénom;nom[téléphone]`, produits
  `nom;vente;achat;quantité[;code-barres]` (en-tête optionnel) ;
- un export ré-importé n'est pas un aller-retour : il échoue proprement
  (format / téléphone déjà utilisé ⇒ message FR, **rien n'est écrit**) plutôt
  que de créer des doublons.

### Portes

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `eslint
--max-warnings 0` 0 · `knip` 0 · `vitest` **142 fichiers / 976 tests** 0 ·
`test:db` **39 fichiers / 183 tests** 0 · `verify:migrations/domain/perf`
VERIFIED · `verify:fr` 0 (322 fichiers) · `verify:encoding` 0 (868 fichiers) ·
`license:scan` 0 (1420 fichiers) · `test:coverage` **EXIT 0** (95,83 % lignes) ·
`build` + `build:electron` ✓ (manifeste signé 216 fichiers).
