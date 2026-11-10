# ADR-178 — Source unique des métriques : `docs/METRICS.md` + porte `verify:docs`

**Décision** : aucun compteur (migrations, canaux IPC, fichiers de test, ADR,
pages/features de licence, tables) n'est plus recopié à la main dans les
documents vivants. Une **source unique générée** (`docs/METRICS.md`) est la
seule porte de ces chiffres, et une **porte automatique** (`verify:docs`)
échoue dès que le code et la documentation divergent.

**Date** : 2026-11-10
**Statut** : accepté

## 1) Constat (cause racine, pas symptôme)

Audit doc↔code du 2026-11-10 (Kod réel contre documentation) : les documents
« vivants » citaient des nombres **figés**, tous recopiés à la main :

| Document            | Valeur citée                    | Valeur réelle                               |
| ------------------- | ------------------------------- | ------------------------------------------- |
| `README.md`         | « 169 fichiers / ~1 146 tests » | 193 fichiers / 1 417 cas                    |
| `README.md`         | « typecheck ×3 »                | ×5 (root, electron, manager, mobile, owner) |
| `README.md`         | « 24 specs / 54 tests » (E2E)   | 26 specs                                    |
| `README.md`         | « ADR-001→153 »                 | 177 ADR                                     |
| `docs/STRUCTURE.md` | « 0001..0056 IMMUABLES » (×3)   | 0001..0062                                  |
| `docs/INDEX.md`     | « ADR-001 a ADR-166 »           | 177 (ADR-177 non indexé)                    |
| `handoff.md` §6     | « vitest (661) »                | 1 417 cas                                   |

Ces nombres n'étaient pas faux **par incompréhension** : ils étaient vrais au
moment de leur rédaction, puis n'ont pas suivi le code. Chaque correction
manuelle laissait au moins une autre occurrence fausse, et la dérive
revenait à chaque session (constat déjà fait dans `handoff.md` §57, où
README/STRUCTURE avaient été « corrigés » à la main — ils ont de nouveau
dérivé depuis).

Cause racine : **le compteur était dupliqué dans N fichiers, sans mécanisme
qui relie la copie à la source**.

## 2) Décision

1. **Source unique** : `docs/METRICS.md` (section entre les marqueurs
   `GENERATED:verify-docs:START/END`) est l'unique endroit où vivent les
   indicateurs. Les documents humains **y renvoient**, ils ne les recopient
   plus.
2. **Génération** : `node scripts/quality/verify-docs.mjs --write` recalcule
   les compteurs depuis l'arbre réel et réécrit la section.
3. **Garde** : `node scripts/quality/verify-docs.mjs` (alias npm
   `verify:docs`, **intégré à `npm run verify`**) recalcule et compare :
   - section générée absente ou périmée ⇒ **rouge** ;
   - littéral obsolète réintroduit dans un document vivant ⇒ **rouge**
     (liste de régression figée dans la porte : `0056`, `169 fichiers`,
     `1 146 tests`, `typecheck ×3`, `ADR-001→153`, `661`, `181`, `125`…) ;
   - document vivant ne renvoyant pas vers `docs/METRICS.md` ⇒ **rouge**.
4. **Exception explicite** : `handoff.md` est un **journal**. Les chiffres
   qu'il rappelle dans ses résumés de session sont des archives datées
   (vraies à leur date) : la porte ne les juge pas, sinon il faudrait
   réécrire l'histoire du chantier à chaque commit.

## 3) Compteurs couverts (tous déterministes, sans réseau ni exécution lourde)

Migrations SQL (nombre + dernière version) · tables réelles (hors `*_new`
temporaires) · ADR (nombre + dernier) · canaux IPC déclarés · canaux IPC
servis (snapshot gelé `tests/unit/__snapshots__/ipc-channels.json`) ·
fichiers de test (unit + integration + database) · specs E2E · modules de la
coquille · pages et features de licence · dossiers du domaine.

## 4) Correction de la qualification des documents

- `docs/specs-archive/` n'est **plus** « la source of truth figée » : c'est une
  **spec historique du 2026-09-14**, explicitly datée et signalée comme telle
  (README + bandeau `docs/specs-archive/00_START_HERE.md`). Écart mesuré : 25
  tables documentées contre 48 réelles, unité `Bread` supprimée (ADR-109),
  pile technique imposée (Next.js/Radix/Recharts) jamais adoptée.
- `docs/INDEX.md` : en-tête « ADR-001 a ADR-166 » remplacé par « tous saries »
  (le dernier ADR est lisible dans `docs/METRICS.md`), et ADR-177 indexé.

## 5) Conséquences

- Un compteur ne peut plus mentir : soit il est dans `docs/METRICS.md` et
  vérifié par la porte, soit il n'est écrit nulle part.
- Coût : une porte de ~7 s dans `verify` (aucune dépendance ajoutée).
- Limite assumée : la porte couvre les **compteurs**, pas les **énoncés
  qualitatifs** (une phrase d'ADR devenue fausse reste à corriger à la main —
  c'est le travail d'un ADR de révision, pas d'un script).

## 6) Portes

`verify:docs` vert · `verify:migrations` vert · `verify:domain` vert ·
`verify:fr` / `verify:encoding` verts · `tsc -b` vert · `eslint` vert ·
suite complète verte (193 fichiers / 1 417 cas).
