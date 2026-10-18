# Handoff — Veloria POS (état au 2026-10-12)

> Document de continuité : tout ce qui a été fait, fichiers modifiés,
> erreurs (fermées/ouvertes), en-attente, commandes. Sessions 2026-10-07
> (§9) et 2026-10-11 (§1-8) archivées ci-dessous. §10 = session du jour.
> Répondre à l'utilisateur en arabe.

## 1) État courant

- Branche : `chore/root-layout` — HEAD `5920396` — 50 fichiers en portée
  modifiés NON commités (correctifs + design, §10) ; arbre harness
  (`.agents/.claude`, `AGENTS.md`, `skills-lock.json`) inchangé, hors périmètre.
- Tags locaux (pas de remote) : `v1.0.0-adr075`, `v1.0.0-e2e-green`,
  `v1.0.0-revue-client`, `v1.0.0-ui-unif`, `v1.0.0-searchfield`.
- ADRs : 001→083 + ADR-101/102/103 (ex-`ADR-NEW-*`, réimmatriculés ; nouveaux : 080 correctifs tri-UI,
  081 design fondations, 082 design surfaces, 083 design profondeur).
  `docs/INDEX.md` à jour (001→083).
- Portes vertes : `tsc -b` + `electron` + `manager` + `mobile` = 0 ·
  `eslint` (repo entier) = 0 · `vitest` **661/661** (659 + 2 parity) ·
  `verify:migrations` VERIFIED (40/40) · `verify:domain` OK ·
  `build` + `build:electron` + manifests signés (194 + 20) ·
  `release:smoke` + `SHA256SUMS.txt` OK · E2E **24 passés / skips
  documentés / 0 échec** (full-loop-client exige relais :8100,
  installer exige UAC élevé).
- `release/` : 4 installeurs frais 1.0.0 (POS Setup+Portable, Manager
  Setup+Portable) + blockmaps + SHA256SUMS (rebuildés après Phase 3).

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

## 5) En attente (next actions)

- [ ] **Revue + commit + tag** des 50 fichiers (proposition : tag local
      `v1.0.0-fixes-design` après revue).
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
  toujours enchaîner `build:electron`.
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
