# Handoff — Veloria POS (état au 2026-10-11)

> Document de continuité : tout ce qui a été fait, fichiers modifiés,
> erreurs (fermées/ouvertes), en-attente, commandes. Session 2026-10-07
> archivée en §9. Répondre à l'utilisateur en arabe.

## 1) État courant

- Branche : `chore/root-layout` — HEAD `5838d67` — arbre produit PROPRE
  (reste : suppressions `.agents/.claude` + `AGENTS.md`/`skills-lock.json`
  modifiés = harness, hors périmètre, jamais touchés).
- Tags locaux (pas de remote) : `v1.0.0-adr075`, `v1.0.0-e2e-green`,
  `v1.0.0-revue-client`, `v1.0.0-ui-unif`, `v1.0.0-searchfield`.
- ADRs : 001→079 + 3 `ADR-NEW-*` (derniers : 075 dead-code, 076 sidebar,
  077 e2e/prod-prep, 078 UI sûre, 079 SearchField). `docs/INDEX.md` à jour.
- Portes vertes : `tsc -b` + `electron` + `manager` = 0 · `eslint` = 0 ·
  `vitest` **659/659** · `verify:migrations` VERIFIED (40/40) ·
  `verify:domain` + `verify:perf` OK · `build` + `build:electron` +
  `build:manager*` OK · `license:scan` OK · E2E **21 passés / 6 skips / 0 échec**.
- Score production : **86/100 Strong** (audit `production-audit`).

## 2) Objectifs réalisés (09 → 11 oct 2026)

| #   | Objectif                                        | Résultat                                                                                                                   |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Inspection complète du projet                   | 5 sous-agents + vérif : 188 src / 107 electron / 40 migrations / 77 ADR / 106 tests — 2 violations FR corrigées            |
| 2   | Correction radicale (2 violations)              | `use-notifications.ts:60` via `frError` + test régression ; `Reporting` → `Rapport`                                        |
| 3   | Code mort (audit d'abord, jamais auto-supprimé) | 10 canaux IPC + 5 repos + 3 schemas + 3 exports supprimés (ADR-075, commit `59ddd8b`, 33 fichiers +155/−371)               |
| 4   | Barre latérale verticale repliable              | `Sidebar.tsx` réécrit (w-60/w-[68px]) + layout `App.tsx` en ligne (ADR-076, `64ac766`)                                     |
| 5   | Résurrection E2E (11 échecs → 0)                | Sélecteurs périmés, bypass EXPIRED v1→v2, skips `<1600×900`, relais documenté (ADR-077, `df70ac7`)                         |
| 6   | Revue live utilisateur + client                 | 13 opérations POS réelles + APK (dette/factures/reçu réels via relais) — bug table 720p trouvé+fixé (`39dcc40`)            |
| 7   | Audit designs + SearchField                     | `Switch` (9 sites) + couleurs tokens + `SearchField` (12 sites) — ADR-078/079 (`6aafb72`, `613d1b7`)                       |
| 8   | Builds POS/Manager/Client                       | `dist*/` verts + manifest signé ; APK impossible ici (EAS + placeholders) ; `.gitignore` += `mobile/dist-web/` (`5838d67`) |

## 3) Fichiers modifiés (cette période, par commit)

- `59ddd8b` dead-code : `channels.ts`, 8 registres, `preload.ts`, 5 repos,
  3 validators, `license-gates.ts`, `vite-env.d.ts`, snapshot, 3 tests,
  `catalog.ts`, `zakat/types.ts`, `product-rules.ts`, `backup-frequency.ts`,
  `backup.service.ts`, `use-notifications.ts`, `ZakatScreen.tsx`,
  `fr-map.test.ts`, `validators-inventory.test.ts`.
- `64ac766` sidebar : `Sidebar.tsx`, `App.tsx`, ADR-076.
- `df70ac7` e2e : 7 specs + `helpers.ts`, `test-only-allow-expired.cjs`.
- `39dcc40` revue : `HistoryScreen.tsx` (min-h/scroll), `globals.css`
  (scroll-margin global), `mobile/config.ts` (relais :8100).
- `6aafb72` UI : `primitives.tsx` (Switch), 7 fichiers switches, 3 couleurs charts,
  2 dropdowns, ADR-078.
- `613d1b7` search : `primitives.tsx` (SearchField), 12 écrans, ADR-079.
- `5838d67` : `.gitignore` (mobile/dist-web).
- Temporaires créés PUIS supprimés : `zz-revue/probe/geo/stab.spec.ts`,
  `scripts/zz-mob.mjs` (+ screenshots `test-results/e2e-loop/zz-*` conservés,
  git-ignorés).

## 4) Erreurs découvertes

### Fermées (31)

FR brut notifications · `Reporting` · 10 canaux IPC morts · 5 repos morts ·
3 schemas morts · 3 exports morts · double import · UNIT_CODES/CL ·
backupFrequency · STOCK_STATUS_CASE · 11 échecs E2E (détail : placeholders,
titles, aria-labels, gotoModule.first, retry Restaurer, skips écran,
bypass v1, ordre QR-miroir) · table Historique 720p · relais rejeté ·
9 switches · 4 couleurs · 12 search fields.

### Ouvertes / assumées

1. **`package:win` BLOQUÉ machine** : symlink requis pour cache winCodeSign
   (pas admin). Tentatives : retry direct, archive patchée (checksum sha512
   codé en dur côté Go → rejet), contournement `signAndEditExecutable=false`
   REFUSÉ (ADR-070 + yml:67-69, fail-closed voulu). Zéro trace restante
   (cache restauré, serveurs tués, TMp nettoyé).
2. **Pas de remote/CI** : tags locaux uniquement ; `installer.spec` jamais
   exécuté (exige l'installateur).
3. **Dette documentée** (ADR-075) : D1/D2/D4/D5/F-E, `paymentTicketFormatSchema`,
   `FormFooter`, mini-labels ×25, fusions Drawers/Payment — unification aveugle
   plus risquée que le doublon.
4. **Dû mobile** : helpers `invoiceUi`/`useRefresh`/`share.ts`, Kit adoption,
   2 clés i18n mortes (`quickRefresh`, `switchLanguage`), `STITCH`/`GRADIENTS`
   inutilisés (~260 lignes).
5. **`handoff.md` racine** : conservé (fichier de travail actif).
6. **Expo** : warnings compat `expo-sqlite`/`react-native` (non bloquants).
7. **Montants masqués `•••`** dans l'APK : design confidentialité, pas un bug.

## 5) En attente (next actions)

- [ ] **Packaging** : session admin/Developer Mode (reg `AllowDevelopmentWithoutDevLicense`)
      → `package:win` + `package:manager` + `installer.spec` → remplacer `release/` (3-5 oct, périmé).
- [ ] **Remote** : créer dépôt distant + push + CI (config `.github/workflows/ci.yml` prête) ; alternative : `git bundle` via USB (déjà proposé).
- [ ] **APK** : compte EAS + remplir `eas.json` (URLs Supabase réelles — placeholders refusés par design).
- [ ] **Dû mobile** (§4.4) avec cycle Expo-shots dédié.
- [ ] **Specs E2E manquantes** : dashboard/debts/expenses/proformas/bread/suppliers/zakat/settings/templates (11 specs actuelles seulement).
- [ ] Arbre harness (`.agents/.claude`, `AGENTS.md`, `skills-lock.json`) : décision opérateur, hors code.

## 6) Commandes

```powershell
npm run dev:electron          # dev (build electron + electron .)
npm test                      # vitest (659)
npm run test:e2e               # Playwright (electron.launch, workers:1)
node scripts/e2e-mirror-relay.mjs            # relais :8100 (prérequis full-loop)
npx expo start --web --port 8083             # APK web (mobile/, EXPO_PUBLIC_SYNC_URL)
$env:PHONE="..."; $env:PIN="......"; node scripts/e2e-mobile-shots.mjs
npm run verify:migrations && npm run verify:domain && npm run verify:perf
npm run build && npm run build:electron      # TOUJOURS couplés (manifest, sinon e2e "tampered")
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
3. UI 100 % FR, erreurs FR + log · 7. Tranches verticales ·
4. format → typecheck → tests → build · 9. better-sqlite3 vs Electron 37 ·
5. ADR-*.md + INDEX · 11. Migrations IMMUABLES + verify vert ·
   12-13. Skill-first + routage (db/slice/ui-fr, graphify, impeccable+craft-floor
   avant tout edit UI, audit-avant-suppression, dragon si aucun match).

## 8) Pièges rencontrés (ne pas répéter)

- `build` renderer seul invalide le manifest → e2e licence `tampered` ;
  toujours enchaîner `build:electron`.
- Toasts empilés (4,5 s) : drainer avant lecture du toast suivant.
- `getByLabel` matche aussi les `aria-label` des boutons (ex. nav) → préférer
  `title=` ou `data-path` si collision.
- thead sticky + `min-w-[1240px]` : clic ligne → bouton `Voir …` + scroll
  explicite ; `scroll-margin` global dans `globals.css`.
- `exactOptionalPropertyTypes` : `ref` par spread conditionnel.
- PowerShell 5.1 : pas de `sed/grep/tail` → outils `read/grep` natifs ;
  `Select-String` sans `-Recurse`.
- `test-only-allow-expired.cjs` DOIT suivre `buildSecureStateV2` (H-3).
- QR V2 exige URL+anon configurés AVANT l'activation (ADR-068).
- e2e fenêtrage : écran < 1600×900 → démarrage maximisé (skips dédiés).

## 9) Archive session 2026-10-07 (topnav + Manager icon, ADR-072/073)

TopBar fusionné + Sidebar compacte horizontale + horloge fr-DZ 24h + mode
clair CSS-only + icône Manager (`resolveManagerIcon`). Vérifié + rebuildé ;
screenshots `docs/shots/pos-*.png`. Restes : sign-off visuel demandeur,
`test:e2e` packagé, Manager UI + APK refonts en attente, `graphify update .`
impossible (CLI absent).
