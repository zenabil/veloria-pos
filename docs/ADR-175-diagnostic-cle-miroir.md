# ADR-175 — Diagnostic d'identité du miroir : une clé refusée le dit, et une clé publique n'entre plus dans le champ secret

- Date : 2026-11-06
- Statut : **appliqué** (code + tests, commit associé)
- Demande opérateur : « فتح supabase في المتصفح، التحقق من اعداداتها، ربطها مع pos، ان وجدت اخطاء صححها »
- Périmètre : `electron/sync/sync.protocol.ts`, `electron/sync/sync.service.ts`, `src/features/settings/SettingsSectionsB.tsx`, `cloud/supabase` (lecture seule : aucun changement de schéma ni de réglage cloud n'était nécessaire).

## 1. Mesure avant correction

Audit du projet `veloria-pos` (`ynktschorbwukxovjzcz`, Londres, `ACTIVE_HEALTHY`) via l'API
platform du dashboard, plus sondes comportementales :

| Contrôlé                                                 | Résultat mesuré                                                                                                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/auth` : `disable_signup` · `password_min_length` | `true` · `8` — la fuite d'inscription reste fermée                                                                                                                                              |
| `POST /auth/v1/signup`                                   | `422 signup_disabled` (preuve vivante, pas un réglage lu)                                                                                                                                       |
| `api-keys?reveal=false`                                  | 4 clés : legacy `anon` + legacy `service_role` + `sb_publishable_…` + `sb_secret_…` — legacy **encore activée**, indispensable aux 4 builds de la session 99                                    |
| `functions`                                              | `client-sync` ACTIVE v3, `verify_jwt=false` — `POST /functions/v1/client-sync/sync {}` → `401 AUTH_ERROR` « Téléphone ou code incorrect. »                                                      |
| RLS live vs `cloud/supabase/schema.sql` + `rls.sql`      | `client_access` / `client_payloads` : RLS actif **sans politique** = refus voulu ; `owner_snapshots_read[SELECT\|authenticated]` présent ; vue `latest_client_payloads` `security_invoker=true` |
| `anon` en lecture directe REST                           | `42501 permission denied` sur `client_access` et `owner_snapshots`                                                                                                                              |
| CHECK `client_payloads.kind` live                        | les 6 kinds, `announcement` + `access_revocation` inclus                                                                                                                                        |
| Données                                                  | `client_access` 7 lignes · `client_payloads` 36 · **`owner_snapshots` 0** · base 11 MB                                                                                                          |
| `projects-resource-warnings`                             | seul `auth_restricted_email_sending = warning` (SMTP géré par Supabase, quotas)                                                                                                                 |
| Advisors (`run-lints`)                                   | 4 `unused_index` INFO · 2 `rls_enabled_no_policy` INFO (**volontaire**) · 1 `auth_leaked_password_protection` WARN (**plafond du plan Free, déjà ruled ADR-171**)                               |

Côté POS (`app_settings.client_sync`, sonde **sans secret** sur une copie de la base) :

```
enabled=true · supabaseUrl=https://ynktschorbwukxovjzcz.supabase.co (correct)
intervalMinutes=5 · ownerEnabled=false · lastPushAt=null
lastError="Miroir injoignable (HTTP 401)." · lastAttemptAt=2026-11-06T20:48:23Z
serviceKey=dpapi1:BLOB(107) · anonKey=dpapi1:BLOB(111)
sync_outbox : 9 pending · 6 failed · customer_access local : 1 ligne
```

**Le cloud est sain ; le lien est cassé d'un seul côté : la clé de service enregistrée sur le
poste est refusée par Supabase.** Un blob DPAPI de 107 caractères déchiffre ~45 caractères —
la longueur exacte d'une `sb_publishable_…`, pas celle d'une clé legacy (≈ 250). La sonde
croisée le confirme : la `sb_publishable_` et la legacy `anon` **sont acceptées** par le
plateforme (elles renvoient `42501 permission denied`, donc elles s'authentifient), tandis
qu'une valeur inventée renvoie `Invalid API key`. Les deux réponses arrivent avec **le même
code HTTP 401**.

## 2. Cause racine : deux natures d'échec, un seul message

`pushNowOnce` ne regardait que le **statut**. Or 401 recouvre trois situations que le
commerçant ne répare pas du tout de la même façon :

- clé inconnue du projet → ressaisir la clé ;
- clé valide mais publiable (aucun droit d'écriture sur des tables verrouillées par RLS) →
  remplacer par la **secrète** ;
- 401 transitant par un proxy/portal qui n'a rien à voir avec l'identité → réseau.

Le message produit était `Miroir injoignable (HTTP 401).`, mot pour mot identique au cas
réseau. **Le diagnostic pointait le routeur alors que la solution était dans le champ de
saisie.** Aucun nombre de re-tentatives ne change rien : la file (9 clichés) reste `pending`
et le tick suivant repart, avec la même phrase trompeuse.

S'y ajoute une porte d'entrée béante : `validateSyncConfig` contrôlait la **longueur** de la
clé (20–500) et sa **charset**, jamais sa **nature**. Une clé publiable — voire une legacy
`anon` — passait donc parfaitement au champ « Clé de service (rôle service) », et
s'asseyait là pour des semaines avant qu'on ne la remarque.

Et le symétrique, plus grave : le champ « Clé anon (publique) » **n'avait aucune garde de
nature**. La valeur saisie là part dans l'endpoint public du QR V2 (`getShopEndpoint`). Y
coller une `sb_secret_…` ou une legacy `service_role` — erreur d'autant plus probable que
l'interface ne précisait pas où les trouver dans le dashboard — **publierait la clé à pleine
puissance (bypass RLS) dans un QR imprimé sur le comptoir**.

## 3. Décision

1. **La classification temporaire/définitif d'ADR-173 est intacte.** Un problème d'identité
   ne condamne **aucune** ligne : `isPermanentMirrorRejection` reste sur
   `{400, 404, 409, 410, 415, 422}`, la file demeure rejouable. Ce change que le
   **diagnostic**, pas la politique de file.
2. **`isMirrorAuthRejection(status, detail)`** — pur, dans `sync.protocol` : 401/403 **et**
   un détail serveur qui parle d'identité (`Invalid API key`, `42501 permission denied`,
   `jwt expired`, `missing authorization`). Le corps fait la différence que le code HTTP
   seul ne peut pas faire.
3. **Message unique** `SERVICE_KEY_REFUSED` = « Clé de service refusée par Supabase :
   ressaisissez-la (Réglages → Miroir Android). » — utilisé par la poussée miroir **et** par
   la publication de liasse (même cause, même remède), et déjà employé par le chemin Admin
   Auth. Règle 6 : français, action nommée, le détail brut reste au log `push.http`.
   Un 401 **sans** détail d'identité garde « Miroir injoignable (HTTP 401) » (cas réseau).
4. **`classifyApiKey(key)`** classe une clé par sa **forme** : préfixes
   `sb_publishable_`/`sb_secret_`, et pour les JWT legacy le claim `role` (`anon` vs
   `service_role`) décodé en base64url **sans vérifier la signature** — pur classement,
   jamais une authentification, jamais une valeur recopiée dans un log ni dans l'UI
   (`maskConfig` reste la seule vue du renderer). Forme inconnue ⇒ `unknown` ⇒ **on ne refuse
   pas** : c'est la clé du projet qui compte, pas son apparence.
5. **Garde à la SAISIE, pas à la poussée, pour l'anonymat.**
   `assertServiceKeyUsable` est appelé par `validateSyncConfig` (donc à l'enregistrement
   comme à chaque poussée) : une publiable en champ secret ne pourra plus être stockée, et
   une configuration héritée de ce type s'explique enfin d'elle-même. `assertAnonKeyPublic`,
   lui, n'est appelé que dans `saveSyncConfigAtomic` **sur la valeur effectivement tapée** :
   refuser une valeur déjà en base ferait échouer, pour une erreur de saisie ancienne, des
   poussées qui fonctionnaient la veille.
6. **Les deux champs du formulaire disent maintenant où chercher** (API Keys → Secret key /
   Publishable key, onglet Legacy pour les builds expédiés) et nomment le préfixe attendu.
   La racine du malentendu était documentaire, pas technique.
7. **`noteConfigRejection(doc, now, err, lane)`** — un refus **hors HTTP** (clé de la mauvaise
   classe, configuration incomplète, synchro coupée) écrit désormais `lastError` +
   `lastAttemptAt` (lane `mirror`) ou `lastOwnerError` + `lastOwnerAttemptAt` (lane `owner`)
   avant de renvoyer l'erreur. Sans ceci, la garde de clé **reculait** l'observabilité :
   `startSyncTimer` avale l'exception (best-effort, règle financière), donc un refus levé
   avant la requête n'était plus écrit nulle part, et l'écran restait figé sur l'ancienne
   panne réseau — une erreur fausse est pire qu'une erreur vague. Le refus se voit donc au
   timer comme au clic, avec la même phrase.

## 4. Refusé

- **Scripter la bonne clé dans l'application.** Le `service_role` déchiffre la liasse
  complète ; sa valeur ne doit ni entrer dans une transcription de session, ni transiter par
  un script. La saisie reste un geste humain (Paramètres → Miroir Android → « Clé de
  service »). La correction livrée rend ce geste **autrement** : une clé publiable y est
  désormais refusée à l'instant, au lieu d'être stockée puis 401 pendant des semaines.
- **Refermer le RLS en ajoutant des politiques sur `client_access`/`client_payloads`** : les
  2 `rls_enabled_no_policy` des advisors sont **le modèle d'accès V1 écrit dans `rls.sql`** (« aucune politique créée volontairement »). Les « corriger » rouvrirait la fuite close en session 101.
- **Activer `ownerEnabled` à la place du gérant** : la liasse sort sans décision explicite
  (ADR-171, défaut OFF). `owner_snapshots` à 0 ligne est une conséquence de ce réglage et du
  401, pas un défaut du cloud.
- `password_hibp_enabled` (402), `site_url`, SMTP, CIDR/`ssl_enforced` : déjà ruled ADR-171,
  non re-discutés.

## 5. Preuves

- `tests/unit/sync-protocol.test.ts` → 5 tests E-60 : classement des 4 formes + `unknown`,
  refus croisé publiable↔secrète dans chaque sens, `validateSyncConfig` refuse la publiable
  **avant** stockage mais accepte une clé legacy de forme inconnue, et `isMirrorAuthRejection`
  ne confond ni un 401 de passerelle, ni un 503, ni un 409 de ligne.
- `tests/integration/sync-push-resilience.test.ts` → 4 tests E-60 sur la vraie file (base
  migrée + transport injecté) : 401 « Invalid API key » ⇒ message de **clé**, `pending`
  conservés, `failed` absent, `lastAttemptAt` horodaté ; 401 « 42501 permission denied » ⇒
  même diagnostic ; 503 ⇒ reste « injoignable » (la panne réseau n'est pas renommée en
  erreur de clé) ; **clé publiable déjà stockée** ⇒ refusée **avant toute requête** (le
  transport lève si on l'appelle) et `lastError` écrite quand même — la preuve du point 7.
- `tests/integration/sync-push-queue.test.ts` : assertion existante sur le 401 mise à jour
  vers le nouveau message, invariance `pending: 15` **inchangée** — preuve que la politique de
  file d'ADR-173 n'a pas bougé.
- Côté cloud, rien n'a été modifié : les sondes §1 sont la preuve que les réglages étaient
  déjà conformes à `cloud/supabase/*.sql`.

## 6. Ce qui reste ouvert (écrit noir sur blanc)

1. **Le lien attend le geste de l'opérateur** : coller la **Secret key** (`sb_secret_…`, ou
   la legacy `service_role`) dans Réglages → Miroir Android, puis « Pousser maintenant ». Les
   9 clichés `pending` partent dans la foulée ; les 6 `failed` restent en audit (ADR-173).
2. **`ownerEnabled=false`** : tant que le gérant ne l'active pas, `owner_snapshots` reste à 0
   et l'app Owner affiche un pipeline vide — l'écran de l'owner n'est pas cassé, il n'a rien
   à montrer.
3. **Clé legacy vs nouvelle** : les 4 builds de la session 99 portent la legacy `anon`. Les
   nouvelles clés restent donc inutilisables pour eux ; une migration complète =rebuild
   (hors périmètre).
4. `auth_restricted_email_sending` : nécessite un SMTP et ses identifiants — une décision +
   un secret, pas un commutateur.
