# ADR-174 — Audit intégral 2026-11-03 : portes mesurées, défauts prouvés, corrections radicales

- Date : 2026-11-03
- Statut : **appliqué** (code + tests + portes, dans le commit `fix(audit)` associé)
- Demande opérateur : « فحص المشروع بدقة و عمق شديدين من كل المشاكل و الاخطاء … خطة اصلاح جذرية … لا اريد اصلاحات سطحية … ثم اقصى عدد من الاختبارات … اي خطأ بعد الاختبار ابحث عن سببه الحقيقي و اصلحه جذريا و لا تخفي الاخطاء »
- Périmètre : POS (`src/`, `electron/`), License Manager, `mobile/`, `owner/`, `cloud/`, `database/`, `scripts/`, CI, gates.

## 1. Contexte : l'audit précédent était vert, le projet avait quand même des défauts

Mesure **avant** toute correction (poste réel, aucune supposition) :

| Porte                                                                                                                                    | Résultat                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `format:check` · `lint` · `typecheck` ×5                                                                                                 | 0                                                                              |
| `npm test`                                                                                                                               | **186 fichiers / 1354 tests** — 0 échec (595,78 s)                             |
| `verify:migrations` (59) · `verify:domain` · `verify:fr` · `verify:encoding` · `verify:perf` · `version:check` · `license:scan` · `knip` | 0                                                                              |
| `npm run build` puis `test:e2e` complet (25 specs) avec relais `:8100`                                                                   | **54 passed / 3 skipped / 0 failed** (19 min 18 s)                             |
| Bases réelles (`E:\data\backups\…`, `C:\ProgramData\…`)                                                                                  | `integrity_check=ok`, 0 violation FK, 0 solde incohérent, 0 doublon de facture |

Conclusion : **les portes ne voyaient pas les classes de défauts listées ici.** Un audit
qui se contenterait de « tout est vert » aurait donc menti. Ce qui suit est la liste
complète des défauts trouvés, y compris ceux qui rendaient une porte verte à tort.

## 2. Portes mensongères (causes racines, preuves reproductibles)

### E-53 — `verify:migrations` ne contrôlait pas l'immutabilité

`scripts/database/verify-migrations.mjs` recalculait le sha256 **du disque** et
l'insérait dans une base temporaire : éditer en place une migration appliquée
laissait la porte verte, `sign-integrity` resignait la dérive, et une base neuve
l'appliquait sans un mot. Le « checksum guard » de la règle 12 n'existait que dans
l'application, par base, jamais dans le dépôt.

**Décision** : `database/migrations.lock.json` (sha256 figés, versionné) contrôlé par
`verify:migrations` — fichier absent du loquet, loquet sans le fichier, ou hash
différent = échec. Régénération explicite par `npm run verify:migrations:lock`,
uniquement dans le commit qui ajoute la migration.

**Preuve** : une ligne ajoutée à `0059_cash_sessions.sql` fait échec (`FAIL:
migration(s) MODIFIÉE(S) en place … 0059_cash_sessions.sql`), retirée → vert.
**État réel vérifié** : 4 bases du poste comparées fichier par fichier → **0 dérive
aujourd'hui** (le défaut était préventif, pas un accident survenu).

### E-57 — la CI était rouge par construction et n'a jamais tourné

Deux échecs reproductibles sur un arbre propre (`git archive HEAD` :
`C:/veloria-build/ci-sim`) :

1. `npm run check` → `typecheck:mobile`/`typecheck:owner` : `extends: "expo/tsconfig.base"`
   exige `mobile/node_modules` et `owner/node_modules`, qu'un `npm ci` racine
   n'installe PAS (le dépôt n'est pas un workspace) → `TS2307 Cannot find module 'react'`.
2. `npm run verify` → `version:check` lisait `mobile/android/app/build.gradle`,
   100 % gitignoré (`mobile/android/`) → plantage `ENOENT` avec une stack Node nue
   (violait aussi la règle 6 : jamais d'exception brute).

Et `git remote -v` est **vide** : 299 commits sur `chore/root-layout`, zéro exécution
CI, zéro copie hors du poste. C'est ce qui a caché les deux points pendant des mois.

**Décision** : la CI installe `mobile` et `owner` (avec cache sur les trois lockfiles),
`version:check` rend le gradle **optionnel et annoncé** (`SKIP … non versionné (poste
vendor seul)`), et un job `e2e` séparé est ajouté (relais `:8100` inclus, sans
`continue-on-error`).

### E-54 — gardes silencieusement vides ou aveugles

- `verify-fr-only.mjs` / `verify-encoding.mjs` échouaient sur une faute mais
  passaient sur **0 fichier scanné** (dossier renommé, glob inversé) → plancher
  `< 300 fichiers = échec`.
- `secret-scan.mjs` ne scaniait **pas `owner/`** (l'app qui porte les identifiants
  Supabase) ni `config/`, et ses motifs ignoraient toute la classe réellement
  présente dans ce projet : `sb_secret_`, `service_role`, jetons `eyJ…`. Ajouté, avec
  une distinction sémantique : un JWT n'est fautif que si son **payload décodé**
  déclare un rôle privilégié (`service_role`, `supabase_*_admin`, `authenticator`) —
  la clé `anon` est publique par conception et serait un faux positif permanent.
  Plancher `< 600 fichiers = échec`. **Résultat mesuré** : 1712 fichiers (au lieu de
  1522), aucun secret.
- `test:coverage:all` (le ratchet 51/50/44/53 qui mesure `electron/`, `shared/`,
  `mobile/`, `owner/`) n'était câblé **ni dans `npm run ci` ni dans la CI** :
  mesurable mais jamais exercé. Il y est maintenant.

### E-55/E-56 — `owner/` hors de la porte de version

`version:check` alignait racine + client mais ignorait l'app propriétaire : elle
est restée à `0.1.0` (quatre cibles) pendant que la suite sortait en `1.0.4` — écart
signalé en §99/§102, jamais fermé. `owner` (package.json, package-lock, app.json,
gradle) devient cible de `check` **et** de `set`, avec la même loi de croissance du
`versionCode` (`owner/android/app/build.gradle` 0.1.0/1 → 1.0.4/**2** sur ce poste).

## 3. Défauts applicatives corrigés

### Argent et saisie

- **E-36** — `parseDzdInputStrict` passait par `Number()` : `0x10` → 16, `1e3` →
  1000, `+7` → 7 acceptés. Un tarif fournisseur « 1.5E3 » dans un CSV importé
  devenait 150,00 DZD **sans erreur**. La conversion est désormais faite sur la
  **chaîne** (gate regex identique à `parseQuantityInput`, groupement français
  espace/U+00A0/U+202F accepté, virgule ou point, un seul séparateur), ce qui
  supprime aussi le double arrondi `toFixed(6)` (`10.0049999` → 1000, plus 1001).
- **E-37** — `sumSafeMinors` validait chaque addenda au plafond **unitaire** (1e9)
  alors que `multiplyMinorByQuantity` autorise un total de ligne jusqu'à 1e11 : une
  ligne correcte de 1 500 000 000 centimes était refusée avec « Sous-total invalide :
  hors bornes [0, 1000000000] ». La borne d'un addenda est maintenant `MAX_MINOR_TOTAL`.
- **E-40** — plafond appliqué à la mauvaise grandeur dans les validateurs et l'UI :
  `nisabMinor` + les six **sources** de la zakat et `amountMinor` d'une dépense (agrégats
  / paiements) passaient en `moneyMinor` (10 000 000,00 DZD max) ; six dialogues
  pré-remplissaient un agrégat avec `minorToInput` (unitaire), qui **lève** — dans un
  `useState`, donc écran mort devant le commerçant (Zakat ×4, paiement client, paiement
  fournisseur, dettes, avoir, conversion de devis, dépense, nisab). Tous basculés sur
  `minorToInputTotal`/`parseDzdInputTotal`/`strictOrNegTotal` **par paire** (pré-remplissage
  - parsing + validateur), `ReportsScreen` sur `formatDzdTotal`/`formatDzdTotalSigned`
    (11 emplacements affichaient « — » sur des totaux valides, dont le solde de clôture
    négatif, alors que le Dashboard affichait le même champ correctement).
    **Mesure sur la base réelle** : valeur du stock à l'achat 882 754,37 DZD — le défaut
    est donc **latent** pour ce commerçant, déclenché au premier franchissement de 10 M DZD.
- **E-38** — `assertCreditLimitNotExceeded` **échouait ouvert** : un solde client
  non entier ou négatif faisait sauter entièrement le contrôle de plafond, alors que
  `computeDebtStatus`/`applyPaymentToBalance` lèvent sur la même donnée. Politique
  unique : illisible → refus FR ; négatif (avoir) → ramené à 0 comme `return-rules`,
  donc le plafond s'applique. **Vérifié** : `sales.repo.ts:366-377` recontrôle le plafond
  dans la transaction à partir de la base + trigger SQL — la garde du renderer restait
  une défense en profondeur, pas l'autorité (rien n'a donc été surfondé).
- **E-39** — `sale-ticket.ts` imprimait **l'horloge du poste** comme date de vente
  quand `created_at` était absent : une pièce comptable avec une date inventée.
  Affiche désormais `—` (l'anomalie se voit).

### Idempotence (`operationId`)

- **M-1** — l'identité de la vente était figée par panier **sans liaison au contenu** :
  après une réponse perdue, le caissier corrige une ligne et revalide → le main rejoue
  la vente **stockée** (ancienne) tandis que la caisse imprime et annonce le panier
  **nouveau** : ticket ≠ facture, la correction n'est jamais vendue, panier vidé en
  silence. Nouvelle règle, la même que le devis (`proforma-op.ts`) : `sale-op.ts`
  (`saleOperationKey` / `pickSaleOperationId` / `persistedSaleOperationId`) — même
  contenu = même UUID (rejoué), contenu modifié = opération neuve, l'empreinte étant
  résolue **au commit** sur le montant réellement appliqué.
- **M-2** — `newOperationId()` **au clic** supprimé des chemins mutatifs :
  `proformas.convert` (facture + sortie stock + dette client = facture dupliquée),
  deux autres emplacements du même dialogue, `InventoryDialog`, `AdjustmentDialog`,
  `saleCancel`, `saleReopen` (après une réponse perdue, le réessai ouvrait une
  **nouvelle** opération sur une vente déjà annulée → « Annulation impossible »).
  `useContentOperationId` (cache par empreinte, purgé au démontage) devient le point
  de génération unique.
- **M-3** — import CSV (catalogue, clients) : aucun état d'envoi, bouton non désactivé,
  UUID par clic → re-choisir le fichier pendant la committing duppliait des lignes.
  Désormais `importing` + bouton désactivé + opération par contenu.

### File de synchronisation (miroir)

- **E-41** — un `payload_json` illisible **gelait la file pour toujours** :
  `buildMirrorRequests` levait, la poussée entière mourait avant `lastPushAt`, la
  même ligne était re-sélectionnée au tick suivant (`ORDER BY id ASC LIMIT 200`).
  ADR-173 n'isolait que les rejets **HTTP**. `partitionOutboxRows` écarte la ligne
  localement corrompue (condamnée, raison FR, journalisée) et laisse partir les autres.
- **E-42** — `PERMANENT_MIRROR_REJECTION` inclut 404 : si la table `client_payloads`
  est absente (mauvais projet, schéma non provisionné), la bissection d'ADR-173
  condamnait **une par une les 200 clichés** en `failed`, état définitif, après
  ~400 POST. `classifyMirrorRejection` distingue maintenant **row / table / transient**
  (404, `42P01`, `PGRST205`, « relation … does not exist » = table) : une table
  refusée **arrête** la poussée et laisse toute la file `pending` (rejouable).
  **Constat sur la base réelle** : 6 lignes `failed` du 13/10 sans aucune trace de
  motif — la table `sync_outbox` n'a ni `attempts` ni `last_error` (relevé comme
  reste-à-faire, cf. §6).
- **E-43** — `lastPushAt` n'étant écrit qu'au succès, un miroir injoignable relançait
  une poussée complète **toutes les 60 s** au lieu de la cadence `intervalMinutes` :
  `lastAttemptAt` (écrit succès **et** échec, côté file client comme côté liasse
  propriétaire) gouverne désormais la gate.
- **E-45** — le transport du miroir était un `fetch` nu : pas d'`AbortController`
  (un pair TCP muet laissait la requête suspendue) et pas de verrou d'exclusion (le
  timer empilait les poussées, avec écritures concurrentes sur `app_settings.client_sync`).
  `mirrorTransport` shared + timeout 20 s + verrou, et la publication propriétaire
  utilise le même transport.
- **E-58** — un refus sur une ligne d'**accès** interrompait la poussée avant la file.
  L'ordre accès→clichés est une dépendance réelle (FK côté miroir) et n'est **pas**
  inversé ; `postAccess` bissecte et écarte la ligne d'accès fautive (elle est
  re-dérivée de `customer_access` au tick suivant, donc aucun état à tracer).
- **E-44** — `readDoc` avalait un échec DPAPI dans `SYNC_DEFAULTS` : l'écran affichait
  « miroir jamais configuré » alors que la configuration était intacte. L'erreur est
  mémorisée et rendue visible par `getSyncView`.

### SQLite, impression, sécurité

- **E-47** — `factoryResetDatabase` faisait `checkpointAndClose()` → `unlinkSync()`
  **sans snapshot** (le seul filet était l'auto-sauvegarde, elle-même best-effort :
  disque plein ou poste jamais sauvegardé = aucune copie exploitable). Un
  `VACUUM INTO` de sécurité est désormais **obligatoire et vérifié** avant toute
  suppression, échec-fermé comme la pré-migration (`veloria-avant-reinitialisation-*`,
  rotation 5).
- **E-48** — `database.health` (`PRAGMA integrity_check` + `foreign_key_check`, scan
  complet synchrone du thread principal) n'était gardé par **aucune** porte (ni
  session, ni permission, ni licence), contrairement à sa sœur `database.optimize`
  alignée en K-05. Le renderer l'appelle au démarrage : la correction n'est donc pas
  une garde mais une **mémoïsation 30 s** (le contrôle de boot reste systématique).
- **E-49** — `webContents.print` sans échéance : spouleur bloqué = callback jamais
  rappelé = `await` éternel, `finally printWin.destroy()` jamais exécuté, invoke IPC
  pendu et une fenêtre cachée qui fuit **par tentative**. Extraite dans
  `printing.watchdog.ts` (respect du cap de 300 lignes) avec message FR.
- **E-50** — l'export PDF acceptait un **chemin absolu fourni par le renderer** :
  le garde n'était qu'une liste noire de dossiers système, donc `writeFileSync`
  écrasait n'importe quel `.pdf` d'un dossier utilisateur sans passer par la boîte
  d'enregistrement. Confinement en **liste blanche** (`realpath` sous `userData` ou
  dossier temporaire), la boîte native reprenant la main ailleurs ; le flux E2E
  existant (qui écrit dans son répertoire isolé) continue de passer.
- **E-51** — `ipc-client.call()` propageait le rejet brut d'Electron
  (`Error invoking remote method 'sales.create': Error: …`) : texte anglais + nom de
  canal, **non reconnu** par la liste noire de `frError` donc affiché à l'opérateur
  (règle 6 violée). Le pont est la frontière : tout rejet du pont devient un message
  FR (détail technique journalisé), et `TECHNICAL_INFRA_RE` attrape la même classe
  venues d'autres appels.

### `owner/` et `mobile/`

- **CRASH-OWNER** — `owner/src/format.ts` `formatMinor` **lève** sur un montant non
  entier ; `isSnapshotShape` ne vérifiait que 3 champs de premier niveau ; `Root`
  n'avait **aucun** `ErrorBoundary` (contrairement à `mobile`, qui a les deux). Une
  seule valeur REAL publiée par le POS = exception de rendu, et comme la liasse est
  **mise en cache localement**, chaque relance rechute : l'écran est mort et
  inrecupérable sans vider le cache à la main. Trois corrections : `OwnerErrorBoundary`
  (écran FR + « Réessayer » + purge du cache), validation structurelle complète de la
  liasse (type predicate, `Number.isSafeInteger` sur tout `*Minor`, `version === 1`) qui
  **conserve la dernière liasse saine** au lieu de rendre, et formatteurs de rendu
  **totaux** (`formatMinorSafe` → `—`, comme `mobile`).
- `Today.tsx` affichait `NaN %` / `Infinity %` chaque matin avant la première vente
  (division par `salesMinor === 0` non gardée) ; `Periods.tsx` lisait une date
  `YYYY-MM-DD` en heure **locale** (décalage d'un jour à l'ouest de UTC) en
  contredisant la règle E-35 du projet ; une session expirée laissait l'app dans un
  état mort (401 permanent, `expiresAt` calculé puis jeté, pas de `endSession`) alors
  que `mobile` ferme la session ; le filtre « Rupture » (`quantity !== 0`)
  contredisait le badge et le compteur (`quantity <= 0`) : un produit en stock négatif
  était badgé rupture et absent de la liste. Les deux apps partagent maintenant le
  même prédicat.
- `mobile/src/config.ts` masquait un build mal configuré (`SYNC_URL ?? 127.0.0.1:8099`,
  `ANON_KEY ?? "demo"`, « demo » ne correspondant pas à son propre regex de placeholder) :
  un APK sans env EAS démarrait silencieusement et chaque connexion échouait en
  « Magasin hors ligne ». Les valeurs par défaut silencieuses sont supprimées, un
  bandeau non dissipable bilingue annonce le défaut de configuration (une porte
  bloquante aurait cassé le QR V2, où c'est le QR qui apporte l'URL et la clé `anon`).

### Découvert pendant la re-vérification (E-59)

Le E2E rejoué après les correctifs a fait échouer `catalogue-labels.spec.ts` : le
snapshot montrait « Page 2 sur 2 · 21 élément(s) », « Suivant » désactivé, **et le
tableau rempli des articles 01→20 de la page 1**. Cause racine : dans
`ProductsScreen`, `page` (intention, posée immédiatement) et `rows` (résultat, posé
par `load()` sous garde de séquence `loadSeq`) sont deux sources de vérité distinctes,
et les chargeurs sont impératifs sur six chemins ; le debounce de recherche (250 ms,
qui recharge `page: 1` en dur) peut démarrer **après** un clic « Suivant », gagner la
garde de séquence et écraser la page 2 avec la page 1. Le test n'a fait que révéler un
défaut de production : le caissier qui coche des lignes à cet instant imprime ou exporte
un jeu de lignes **différent de la page annoncée**.

Correction à la racine : (1) `loadedPage` est committé avec `rows`/`total` sous la même
garde de séquence et le `Pager` affiche `loadedPage` — le pied de page ne peut plus
revendiquer une page dont les lignes ne sont pas à l'écran ; (2) tout chargeur annule le
debounce en attente (`queryTimer.cancel()` sur page, catégorie, filtre, archivés,
refresh, réinitialisation), donc aucune requête obsolète n'est émise. Les 5 specs
Catalogue/Clients repassent. Aucune de ces deux garanties n'existait, et **aucun test ne
couvrait ce cas avant** — d'où la règle rappelée ici : une porte n'est déclarée verte
qu'après rejeu complet suivant chaque correctif.

## 4. Ce qui a été REFUSÉ (et pourquoi) — pas de correction de façade

- **`minorToInput` ne devient pas tolérant** : il est le contrat des chemins
  d'écriture. Les sites corrigés utilisent la variante **totale** existante ; rendre
  le formateur muet aurait masqué le vrai défaut (mauvaise borne sur un agrégat).
- **La détection FR des erreurs ne passe pas en liste blanche stricte** : 232 appelants
  de `frError` passent des messages FR fabriqués localement ; tout exiger un « brand »
  aurait dégradé l'existant. La frontière est réparée **à sa source** (le pont IPC) et
  la liste noire est élargie — mesure proportionnée et vérifiable.
- **Le chemin du rétablissement (`backup.restore`) n'est pas confin** : l'opérateur
  choisit le fichier dans une boîte native, le canal exige la permission `settings`,
  et un snapshot de sécurité précède déjà la restauration. Le confiner à `backupDir()`
  aurait cassé la reprise sur disque externe — régression déguisée en durcissement.
- **`phone_hash` non salé (SHA-256 d'un espace ~10⁸) et `service_role` dans une base
  sous `%PROGRAMDATA%`** : c'est un risque **réel et documenté**, pas corrigé ici —
  le salage casserait la recherche exacte de la fonction Edge `client-sync` (contrat
  `cloud/supabase/schema.sql`), et la relocalisation de la base vivante est un geste
  opérateur. Signalé en §6 au lieu d'être caché.
- **`snapshotBeforeFactoryReset` ne remplace pas l'auto-sauvegarde** : il ajoute le
  filet immédiat qu'exige une action destructrice irréversible.

## 5. Preuves après corrections

- Suite complète relancée après lot de correctifs : voir la table de `handoff.md` §105
  (format, lint, 5 typechecks, `npm test`, 6 `verify:*`, `knip`, 3 portes de couverture,
  E2E rejoué).
- Nouveaux tests **écrits pour échouer sans le correctif** :
  `tests/unit/money-parse-strict-input.test.ts`, `tests/unit/money-total-scope.test.ts`,
  `tests/unit/sync-mirror-resilience.test.ts`,
  `tests/integration/sync-push-resilience.test.ts` (E-41/E-42/E-43 sur base migrée
  réelle + transport injecté), `tests/unit/sale-operation-id-content-key.test.ts`,
  plus les tests des specs owner/mobile ajoutés par la même session.
- Dérive de migration : reproduction puis restauration (`git checkout --`), gate rouge
  puis verte.
- CI : deux échecs reproductibles sur `git archive HEAD`, puis comportement attendu
  après correctif (`SKIP` annoncé + échec FR propre au lieu d'un crash Node).

## 6. Reste ouvert — délibérément écrit, pas oublié

1. **Per-row diagnostics de la file** : `sync_outbox` n'a ni `attempts` ni `last_error`
   → migration `0060` + compteur visible (« n clichés condamnés ») dans Réglages.
   Différé : les 6 lignes `failed` du 13/10 ne peuvent pas être expliquées sans lui, et
   ajouter une migration pendant la campagne E2E aurait rendu les mesures ambiguës.
2. **Aucun dépôt distant** : 299 commits, la CI et les 3 lockfiles ne servent rien tant
   que `origin` n'existe pas ; la sauvegarde hors poste reste à décider (action cloud →
   accord opérateur).
3. **Clé `service_role` jamais saisie côté POS** (401 persistant, cf. §103) et **base
   vivante dans `E:\data\backups`**, le même dossier que les snapshots (§102).
4. **`owner_snapshots` RLS `USING (true)`** pour `authenticated` : sûr tant qu'un seul
   compte existe et que l'inscription reste fermée (§101), mais non cloisonné par
   `auth.uid()`.
5. **Secrets de keystore Android en clair** dans `mobile/android/app/build.gradle`
   (fichier non versionné) : à sortir vers `keystore.properties` avant d'ajouter
   `.gradle` aux extensions scannées par `secret-scan`.
6. **`phone_hash` non salé**, base sous `%PROGRAMDATA%` lisible par tout compte local
   standard, legacy `safeStorage` non ré-emballé à la lecture.
7. **Rétention `owner_snapshots`** (append-only) et **`.opencode/` gitignoré** : les
   trois skills projet (`veloria-db`/`veloria-slice`/`veloria-ui-fr`) que la règle 13
   rend obligatoires ne sont pas versionnées, donc perdues sur un clone.
