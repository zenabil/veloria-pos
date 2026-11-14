# ADR-184: Réconciliation de la gouvernance avec l'architecture livrée (Supabase, pas Google Sheets)

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owner:** Engineering
- **Related skills:** veloria-orchestrator, veloria-sync, veloria-security, veloria-gates
- **Audit:** `docs/engineering/audits/2026-11-11-full-forensic-audit/` (finding ORCH-01 / SYNC-01)

## Context

L'audit forensique du 2026-11-11 a établi une **contradiction entre la couche
gouvernante et le code livré** :

- `governance/VELORIA_PROJECT_CONTRACT.md` §4 (§4, ligne 32) désignait
  **Google Sheets** comme « intermédiaire approuvé » du premier pont vers
  l'application client.
- `.opencode/skills/veloria-sync/SKILL.md` (ligne 17) et son fichier de
  référence `references/google-sheets-bridge.md` reprenaient cette direction
  comme **décision produit approuvée**, et toute la section « Security gate »
  était rédigée autour d'un modèle de menace « tableur partagé + identifiants de
  compte de service ».
- `governance/PROJECT_FACTS_TO_VERIFY.md` (ligne 36) instructs même au lecteur
  de **ne pas** supposer Supabase, au nom de Sheets.

Or **ADR-053** (« Client mirror Supabase », 2026-09-29, statut **accepté**)
rejette explicitement Sheets :

> « Google Sheets REJETÉ (pas d'isolation par client, pas de transactions,
> quotas). »

L'implémentation livrée suit ADR-053 : `cloud/supabase/` (schéma, RLS, deux
fonctions Edge `client-sync` / `client-order`), `electron/sync/` (outbox durable,
revendication d'`operationId` avant envoi), et RLS **sans aucune politique**
(deny-by-default) avec `REVOKE ALL` sur `anon`/`authenticated`.

Une recherche mécanique sur `electron/`, `src/` et `cloud/` pour
`sheets.googleapis|spreadsheet|googleapis` ne renvoie **aucune** occurrence.

**Le code avait raison ; les instructions avaient tort.**

## Decision drivers

- Le protocole de résolution de conflit de `veloria-orchestrator` impose de
  **constater** un conflit entre un ADR accepté et un texte gouvernant, et de le
  **trancher explicitement** plutôt que de laisser les deux coexister.
- La règle 11 de `AGENTS.md` impose que la documentation soit **vivante** et
  non périmée ; `docs/METRICS.md` (ADR-178) a déjà démontré le modèle correct
  (source générée + porte).
- Le paquet de compétences v2.0.0 a été **généré depuis `governance/`** : le
  même défaut s'y propage par construction. Il faut donc corriger la source
  (le contrat), pas seulement la copie.
- Les **invariants** de sécurité (le miroir n'est jamais l'autorité du POS ;
  aucun identifiant de service dans le renderer ni dans l'APK ; l'isolation doit
  être prouvable) restent **inchangés** : seule la **technologie nommée** et le
  **modèle de menace** étaient faux.

## Considered options

### Option A — Corriger le contrat, les faits et la compétence sync (retenue)

- Benefits: une seule vérité ; le code, le schéma, les ADR et les instructions
  concordent ; la correction est **additive** (aucun changement de code) ; le
  modèle de menace décrit correspond à ce qui est réellement déployé.
- Costs/risks: le contrat est un document approuvé par l'opérateur — sa
  modification mérite une trace explicite (c'est cet ADR) ; les两份 fichiers de
  la compétence v2.0.0 s'écartent **byte-identiques** de la package officielle
  (propriété d'intégrité vérifiée par `SHA256SUMS.txt`) : la correction les
  modifie **localement**, ce qui rompt l'égalité de hash avec la package
  d'origine. C'est un compromis assumé et documenté (le contenuWas correct).

### Option B — Supprimer la compétence sync et revenir à un contrat Sheets

- Benefits: cohérence avec le texte d'origine.
- Costs/risks: **techniquement faux**. Sheets ne peut pas prouver l'isolation
  par client (c'est la raison même du rejet d'ADR-053) ; cela obligerait à
  réécrire le miroir, l'APK et les fonctions Edge. Rejeter.

### Option C — Laisser les deux textes coexister

- Benefits: aucun travail.
- Costs/risks: exactement le défaut observé. Un agent suivant la compétence
  concevrait un second pont parallèle sur les données clients, avec le mauvais
  modèle de menace. **C'est l'option qui a produit le constat.** Rejeter.

## Decision

**Option A.** L'architecture approuvée du pont client V1 est la **miroir
Supabase** (PostgREST + fonctions Edge), conformément à ADR-053.

1. `governance/VELORIA_PROJECT_CONTRACT.md` §4 est réécrit : la clause Sheets
   devient une clause Supabase assortie d'une trace de réconciliation pointant
   vers cet ADR. Les invariants (le miroir n'est pas l'autorité ; aucun
   identifiant de service dans le renderer ni dans l'APK ; l'isolation doit être
   prouvable) sont **conservés mot pour mot** là où ils restent exacts.
2. `governance/PROJECT_FACTS_TO_VERIFY.md` ligne 36 est inversée : la
   consigne devient « le pont V1 est Supabase (ADR-053) », avec la date de
   correction.
3. `.opencode/skills/veloria-sync/SKILL.md` et
   `references/google-sheets-bridge.md` sont réécrits pour l'architecture
   livrée. La section « Security gate » décrit désormais la posture réelle
   (RLS sans politique + `REVOKE` + fonction Edge unique + secret confined au
   main + échec fermé sur ambiguïté) au lieu du modèle « tableur partagé ».
4. **Le code n'est PAS modifié** : il suit déjà l'ADR accepté.

### Ce qui n'est PAS décidé ici

- Le **périmètre** du secret `service_role` : il contourne encore la RLS. Son
  stockage est correct (chiffré au repos par le coffre du système), mais son
  **droit** reste total. Le resserrer (clé limitée aux tables du miroir) est
  une décision produit/opérationnelle distincte, listée comme question ouverte
  dans la compétence sync.
- La politique de fuseau horaire (UTC+1 fixé) : c'est une autre ADR (§ 3 du
  contrat, interdiction de coder `+1 hour` en dur). Elle est traitée séparément
  et n'est pas mixée avec la présente décision.

## Consequences

- Positive: la couche gouvernante, les ADR, le code et les compétences
  décrivent **la même architecture** ; le risque d'un second pont parallèle
  disparaît ; le modèle de menace décrit est le modèle déployé.
- Negative/trade-offs: les deux fichiers de la compétence sync ne sont plus
  byte-identiques à la package officielle v2.0.0 — la vérification
  d'intégrité de la package (`SHA256SUMS.txt`) signalera cet écart tant que la
  package n'est pas rééditée. C'est **assumé** : conserver le défaut est pire.
- Operational impact: une note de version / un ticket de package skills
  devrait accompanyer la présente divergence.
- Security/privacy impact: aucun changement de comportement — les contrôles
  existants (RLS deny-by-default, `REVOKE`, fonction Edge unique, secret
  confinedé au main) sont **maintenus** et désormais **décrits** correctement.
- Data migration/compatibility impact: **aucun**.

## Verification

- `npm run verify:docs` — vert (la table de routage et la matrice du
  coordinateur sont inchangées : les 17 compétences restent en place).
- `npm run verify:fr`, `verify:encoding` — verts (les textes réécrits sont en
  français, sans caractère hors ASCII).
- Recherche mécanique : plus aucune occurrence de `Google Sheets` /
  `spreadsheet` / `googleapis` dans `governance/` ni dans
  `.opencode/skills/veloria-sync/` (hors trace historique explicitement
  signalée).
- `npm test` — vert (aucun test ne dépendait du nom de la technologie ; le
  contrat est de la documentation, pas du code).

## Follow-up

1. Rééditer la package `Veloria-Engineering-Skills` avec les fichiers corrigés,
   ou acter que les skills v2.0.0 sont « versionnés avec le dépôt » et que
   l'égalité byte-à-byte avec la package n'est exigée que pour les fichiers
   **vendor** (déjà le cas : `docs/engineering/skills/veloria-v2.0.0/vendor/`).
2. Décider du périmètre du secret `service_role` (voir « Ce qui n'est pas
   décidé ici »).
3. Décider de la politique de fuseau horaire (UTC+1 fixé) et amender les trois
   textes qui l'interdisent.
