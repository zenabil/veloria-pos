# ADR-112 — Clients introuvables : visibilité, recherche tolérante, tri serveur

## Contexte

Des clients existants en base devenaient introuvables dans l'écran Clients
comme dans la caisse (« comme supprimés »). Diagnostic (code, pas de perte
de données — aucun canal `customers.remove` n'existe, suppression dure
bloquée par `trg_customers_no_delete_with_sales`) :

1. Archivés (`deleted_at`) invisibles dans les deux écrans (même
   `searchCustomers`, défaut `deleted_at IS NULL`) + archivage groupé
   silencieux (20 lignes d'un clic) + `refresh()` gardant une page devenue
   vide.
2. LIKE binaire brut : « Bélaïd » ≠ « belaid », téléphone espacé ≠ chiffres
   seuls.
3. Tri client limité à la page affichée (serveur toujours `ORDER BY
search_name`) : les plus endettés hors page 1 semblaient absents.
4. Pickers caisse/rapports/proformas tronqués à 8 sans total ni hint.
5. Compteur « N fiche(s) active(s) » affichant le total filtré.

## Décision

- Migration **0047** (immuable, rejouable) : colonne `search_norm` + index +
  backfill SQL miroir de `normCustomerSearch` (minuscules, accents français
  stripped via NFD côté repo, ligatures non décomposées œ/æ → oe/ae, ø → o,
  espaces repliés NBSP/tabulations inclus). Écritures neuves via le repo
  (`createCustomer`/`updateCustomer`).
- Parité SQL↔JS : exacte pour le latin courant (français, latin-1, ligatures
  étendues Ǽ/Ǿ, đ/Đ) — vérifiée par test. Les caractères hors de ces blocs
  restent best-effort pour l'historique (liste finie côté SQL sans ICU, NFD
  complet côté JS) ; impact limité aux noms exotiques créés avant 0047.
- `searchCustomers` : matche `search_name` OU `search_norm` OU `phone` OU
  téléphone sans séparateurs (≥ 2 chiffres, `( ) +` et NBSP inclus) ; LIKE
  échappé (`%` `_` `\` littéraux) ; repli sur la forme brute si la requête se
  normalise à vide (jamais de `LIKE '%%'` qui renverrait tout) ; nouveau param
  `sort` (whitelist fermée, `COALESCE(search_norm, search_name)` + `id` en
  tie-break — pas d'interpolation brute).
- IPC `customers.search` : schéma `sort` (défaut `name_asc`), passe-plat.
- Écran Clients : tri serveur (plus de `sortCustomers` sur la page — conservée
  `@deprecated` comme repli hors UI), repli page 1 si page hors bornes,
  compteur « affichée(s) » sous filtre, échecs d'archivage groupé affichés
  (toast d'erreur si échec partiel), annulation du debounce au changement de
  filtre/tri/recherche, export CSV **complet du filtre** (avant : la seule page
  affichée).
- Caisse : total serveur affiché (« +N autre(s) — affinez la recherche ») dans
  un slot à hauteur constante (le compteur ne déplace pas le panier sous la
  saisie) ; refocus de la recherche après sélection client/passage (frappe
  douchette) ; création express idempotente (`operationId` figé tant que la
  création n'a pas abouti — double Entrée = un seul client).
- Reports/proformas : même total + hint, mêmes remises à zéro.
- Erreurs de recherche/archivage/export journalisées (`console.error`,
  règle 6) sans toast anti-spam.

## Conséquences

- Ordre par défaut légèrement modifié pour les noms accentués (ordre
  normalisé + `id` stable — auparavant `search_name` brut sans tie-break).
- `search_norm` exposé en `SELECT *` (schémas renderer `.passthrough()` :
  toléré).
- Tests : `tests/database/customers-search.test.ts` (13 cas, premier test SQL
  direct de `searchCustomers`) ; `migrations.test.ts` 45→47.

## Revue (db-guardian + ui-fr, 2026-10-17)

Findings corrigés dans la foulée : parité ø/Ø + casse latin-1 + NBSP/espaces
multiples du backfill ; téléphone `( ) +` ; échappement LIKE couvert par
tests ; `operationId` express régénéré à chaque frappe ; timer de recherche
périmé après changement de tri/filtre ; focus perdu après sélection client ;
toast vert malgré les échecs d'archivage ; export CSV borné à la page ;
catches silencieux sans log.

Limite assumée et documentée : les caractères hors latin courant (ex. `Š`,
`İ`) — le backfill SQL (liste finie, sans ICU) ne décompose pas ce que NFD
côté JS décompose. Seules les lignes historiques antérieures à 0047 sont
concernées ; toute écriture neuve passe par le repo (NFD complet).
