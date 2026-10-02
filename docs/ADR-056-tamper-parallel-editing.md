# ADR-056 — Incident TAMPER_DETECTED : émission tsc sans re-signature + édition parallèle

> Renommé depuis `ADR-042-tamper-parallel-editing.md` : le numéro 042 était
> déjà attribué à `ADR-042-radical-repair-2026-09-28.md` (043/044 = suites radicales),
> collision de numérotation signalée à l'audit D1. Aucun document ne référençait
> ce fichier par son nom/numéro ; la numérotation 001–055 restait continue,
> 056 était le prochain libre.

Date : 2026-09-29 ~00:30 (détecté via logs d'exploitation, pas en dev).

## Incident

L'application en cours d'exécution a basculé `TAMPER_DETECTED`
(`integrity.mismatch dist-electron/backup/backup.service.js`) : toutes les
pages protégées refusaient les IPC (`Fonction protégée…`), alors que la
licence est valide. Cause : un fichier `dist-electron` a été réémis APRÈS la
dernière signature du manifest (23:20), sans re-signer.

## Cause racine (structurelle, pas un attaquant)

`tsconfig.json` référence `tsconfig.electron.json` (`composite: true`,
`outDir: dist-electron`, emit activé). Donc **tout `tsc -b` / `npm run
typecheck` réémet `dist-electron` sans re-signer** — le verdict tamper suit
au prochain contrôle licence. Le sign n'était chaîné qu'à `build:electron`.

## Facteur aggravant : édition parallèle non coordonnée

Preuves (semble le poste du vendor lui-même) :

- ~88 fichiers modifiés non commités, dont des sources que cette session n'a
  jamais touchées (`electron/*` repos/validators/preload/channels,
  `src/shared/*`, `src/domain/*`, `package.json`, `electron-builder.yml`…).
- Journal HMR du vieux serveur `vite dev` : salves d'éditions 22:12 → 00:58
  sur ces mêmes fichiers (ex. `validators.ts` ×12, tous les `*.repo.ts`).
- `tsbuildinfo` + `dist-electron/*.js` réécrits à 23:20 et ~01:00 sans
  re-signature → l'incident.
- Par ailleurs : migration `0031_defensive_sale_item_discount.sql` ajoutée par
  l'autre partie et appliquée proprement au démarrage (snapshot OK, v31).

## Correctifs appliqués par cette session

1. **Immédiat** : `npm run license:integrity` (131 fichiers re-signés),
   vieux `vite dev` résiduel tué, rebuild complet + restart → démarrage
   nominal, migration 0031 appliquée, zéro `mismatch`.
2. **Cause racine** : hook `posttypecheck` → `license:integrity` dans
   `package.json`. Tout `npm run typecheck` réussi re-signe désormais
   (auto-réparation ; échec tsc = pas de signature, jamais de manifest
   partiel).
   - **Suite audit (R2)** : ce hook cassait la CI (pas de clé vendor sur
     `ubuntu/windows-latest` → `sign-integrity` sortait en 1 → tout le job
     échouait). Correctif : flag `--if-key-present` — le hook **et**
     `build:electron` sautent avec un message explicite quand la clé est
     absente ; les scripts `package*` appellent `license:integrity` **sans**
     flag (packaging strict inchangé, échec sans clé), et le POS packagé
     reste fail-closed (TAMPER sans manifeste). L'auto-réparation du poste
     vendor (clé présente) est conservée à l'identique.
3. **Suivi 02:50** : second incident — `dist-electron/package.json` (tampon
   `{type: commonjs}`) absent → crash au chargement (`exports is not defined
in ES module scope`). Rebuild `build:electron` complet (tsc + esbuild +
   stamp + sign, 133 fichiers) + restart → démarrage nominal v31.
   Leçon : seul `npm run build:electron` (jamais `tsc` nu) produit un
   `dist-electron` exécutable+signé.

## Reste à trancher AVEC l'opérateur (bloquant coordination)

- Qui édite en parallèle (2e session IA ?) et sur quelle branche/plan ?
  Nos deux piles de modifications non commitées sont **entremêlées** (ex. le
  build en cours embarque son `PrintTemplatesScreen` réduit 12→5 Ko par-dessus
  le nôtre, son `registry.ts`, ses repos…).
- Recommandation : `git stash` / branches séparées + revue avant merge, et
  toujours `npm run build:electron` (signe) après `tsc` manuel. Ne JAMAIS
  affaiblir le verdict tamper (il a correctement fait son travail ici).
- **Vérification finale** : `typecheck` vert (code des deux parties),
  `vitest` 65 fichiers / **410 tests verts** (409 + 1 nouveau de l'autre
  partie : `update-operationid` 8 tests).
