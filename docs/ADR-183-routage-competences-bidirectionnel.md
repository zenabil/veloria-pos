# ADR-183 — Routage des compétences vérifié bidirectionnellement (table unique dans `AGENTS.md`)

- **Date** : 2026-11-11
- **Statut** : accepté
- **Branche** : `feat/client-orders`
- **Portée** : `AGENTS.md`, `scripts/quality/verify-docs.mjs`,
  `tests/unit/verify-docs-gate.test.ts`, `docs/METRICS.md`.
  **Aucun code applicatif touché** (`src/`, `electron/`, `database/`).
- **Compétences concernées** : `veloria-orchestrator`, `veloria-gates`,
  `veloria-slice` (les 16 autres sont les cibles du routage).

## Contexte

La suite de compétences est passée de 10 à 17 (installation du
_Veloria Engineering Skills System v2.0.0_), avec un **coordinateur central**
(`veloria-orchestrator`) dont le rôle declared est justement de **router** vers
les spécialistes.

L'exigence est explicite : **l'agent doit choisir la compétence adaptée à
chaque tâche**, et non charger l'ensemble. Deux mesures ont révélé que ce
choix n'était **pas garanti** :

1. **La porte ne contrôlait le routage que dans un sens.** ADR-179 §2.3
   vérifie que « toute compétence citée dans `AGENTS.md` **existe** ». Le cas
   inverse — une compétence **installée mais jamais routée** — passait : la
   porte restait verte alors que l'agent ne chargerait **jamais** cette
   compétence. C'est exactement le défaut que la doctrine ADR-120 interdit :
   « une garde qui ne peut pas échouer n'est pas une garde ».
2. **Le routage était illisible en pratique.** La règle 13 d'`AGENTS.md`
   tenait sur une seule ligne de plusieurs milliers de caractères, mélangeant
   la politique, la liste des compétences et les déclencheurs. Aucun contrôle
   ne garantissait que la matrice de routage du coordinateur
   (`veloria-orchestrator/references/task-routing.md`) couvre les compétences
   réellement installées.

## Facteurs de décision

- L'agent doit **choisir** une compétence par tâche : le routage doit être une
  donnée lisible, pas une prose à deviner.
- Une règle de routage **non vérifiée** est une instruction fragile : elle doit
  être contrôlée dans les deux sens, sinon elle dérive en silence.
- Une **source unique** : la table de routage ne doit exister qu'à un endroit,
  sinon deux copies divergent (le défaut même qu'ADR-178 a éliminé pour les
  compteurs).
- Les compétences installées sont l'**artefact approuvé** (package
  officielle) : elles ne sont pas réécrites par le projet.

## Options considérées

### Option A — Statu quo (routage en prose, porte à sens unique)

- **Bénéfices** : aucun fichier touché.
- **Coûts/risques** : la régression « compétence installée non routée » reste
  indétectable ; le routage reste difficile à lire et à maintenir ; l'exigence
  « l'agent choisit la compétence adaptée » reste une intention.

### Option B — Réécrire les `description` des compétences en français/avec

déclencheurs arabes

- **Bénéfices** : la description est le seul texte lu avant activation, donc
  le meilleur point d'accroche pour la sélection automatique.
- **Coûts/risques** : les `SKILL.md` sont **l'artefact approuvé** de la
  package officielle ; les modifier casse la propriété « installé =
  byte-identique à la package » (preuve d'intégrité de l'installation) et
  crée une **seconde surface de routage** (description _et_ table), donc une
  nouvelle source de divergence. Le vocabulaire métier étant déjà commun
  (zakat, scanner, code-barres, FIFO, SQLite, PDF), le gain est marginal.

### Option C — Table de routage unique dans `AGENTS.md` + porte bidirectionnelle

- **Bénéfices** : une surface lisible et unique, lisible par l'agent à chaque
  tâche (`AGENTS.md` est chargé automatiquement) ; la divergence est **détectée
  par la porte**, pas constatée à l'usage ; les compétences restent
  byte-identiques à la package.
- **Coûts/risques** : une section de plus dans `AGENTS.md` (à tenir à jour) —
  **le problème même que la porte résout** ; le contrôle échoue si le
  marqueur du bloc est retiré par mégarde (message explicite).

## Décision

**Option C retenue.**

1. **`AGENTS.md` porte une table de routage unique**, section
   « Table de routage des compétences Veloria », délimitée par les marqueurs
   `<!-- SKILL-ROUTING:START -->` / `<!-- SKILL-ROUTING:END -->`. Une ligne par
   compétence Veloria : l'identifiant et la **surface de déclenchement**
   (les mots qui signalent la couche concernée). Une procédure de sélection en
   4 étapes accompagne la table : classer → choisir la ligne la plus
   **spécifique** → ajouter `veloria-gates` si le comportement, les données,
   la sécurité ou l'empaquetage changent → `veloria-orchestrator` si la tâche
   est transverse ou la couche incertaine.
2. **Les règles 13 et 14 sont reparties** : la règle 13 porte la **politique**
   (chargement obligatoire, sources de priorité, renvoi vers la table) ; la
   règle 14 porte les compétences **génériques** hors Veloria. **Aucune
   compétence n'est perdue** dans la répartition.
3. **`verify:docs` contrôle le routage dans les deux sens** (section 3.7) :
   - compétence **installée** ⇒ **routable** (sinon l'agent l'ignore) ;
   - compétence **routée** ⇒ **installée** (sinon l'agent vise le vide) ;
   - table de routage **présente** (marqueurs obligatoires) ;
   - **matrice du coordinateur** ⇒ couvre toutes les compétences installées
     (c'est elle que l'orchestrateur consulte pour router).
4. **La garde est testée dans les deux sens** (ADR-120) : quatre cas dans
   `tests/unit/verify-docs-gate.test.ts`, dont un cas de **non-vacance** —
   l'arbre redevient **vert** dès que la compétence est routée, ce qui prouve
   que l'échec vient bien du routage et non d'un arbre de test cassé.

Ce qui n'est **pas** décidé : aucune compétence n'est modifiée, aucune
technologie n'est ajoutée, aucune dépendance npm n'est modifiée, et le
chargement reste **à la demande** (jamais les 17 d'un bloc).

## Conséquences

- **Positives** : le choix de compétence devient une **donnée vérifiable** et
  non une intention ; une compétence ajoutée sans route fait rougir la porte
  avant d'être livrée ; l'agent dispose d'une procédure de sélection
  déterministe, en français, alignée sur le vocabulaire des demandes.
- **Négatives / compromis** : `AGENTS.md` gagne une section à tenir à jour
  (contrôlée par la porte) ; le marqueur du bloc devient un point de rupture
  (message d'erreur explicite si absent).
- **Impact opérationnel** : aucun. La porte coûte une fraction de seconde,
  aucun runtime ajouté.
- **Impact sécurité / vie privée** : aucun.
- **Impact données / compatibilité** : aucun — aucun schéma, aucune migration,
  aucune donnée applicative touchée. Seul `docs/METRICS.md` est régénéré (le
  compteur d'ADR est un compteur vivant, ADR-178).

## Vérification

- `npm run verify:docs` : vert, avec les nouvelles lignes
  « Table de routage : … compétence(s) routée(s) » et
  « Matrice du coordinateur : … compétence(s) couverte(s) ».
- `npx vitest run tests/unit/verify-docs-gate.test.ts` : **10/10** verts, dont
  les 4 cas de routage (rouge / vert / citation fantôme / table absente).
- `npm run verify:docs:write` puis `npm run verify:docs` : vert après
  régénération de `docs/METRICS.md` (le compteur d'ADR a changé).
- `npm run format:check` : vert.

## Motifs de réexamen

- La documentation OpenCode change sa règle de découverte (par exemple une
  source de compétences configurable dans `opencode.json`) : le contrôle
  « installée ⇒ routable » devrait alors porter sur la source **réellement
  chargée**, pas seulement sur `.opencode/skills/`.
- Le projet gagne un second jeu de compétences (par exemple une famille
  `client-*` distincte de `veloria-*`) : le routage gagnerait alors une
  table par famille, et la porte devrait valider chaque famille séparément.
- Un jour où la table de routage devient volumineuse au point de devoir être
  déportée dans `governance/SKILLS_REGISTRY.md` : la porte devrait alors lire
  la source déportée au lieu du bloc de `AGENTS.md`.
