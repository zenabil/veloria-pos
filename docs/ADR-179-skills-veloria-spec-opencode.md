# ADR-179 — Compétences Veloria : suite conforme au standard Agent Skills, auto-vérifiée

**Décision** : les compétences du projet sont réécrites selon le standard
**Agent Skills** (OpenCode v2), complétées par les domaines critiques
non couverts (argent, stock, clôture, synchro, licence, Electron, portes),
et **auto-vérifiées** par `npm run verify:docs` — une compétence qui ne
respecte pas le standard ou qui cite un chiffre périmé fait échouer la
porte.

**Date** : 2026-11-10
**Statut** : accepté

## 1) Constat (mesuré, pas supposé)

La suite existait (3 compétences, 3 agents, 3 commandes) mais :

- les 3 `name` étaient **non conformes** au standard Agent Skills
  (`Veloria DB`, `Veloria Slice`, `Veloria UI FR` : espaces + majuscules,
  et **≠ nom du dossier** `veloria-*`) ;
- les chiffres de référence étaient **périmés** : « prochain numéro après
  `0051_sales_signed_discount.sql` » (dernière migration : 0062),
  « next number after ADR-135 » (dernier : ADR-178), `PHASE_X_REPORT.md`
  à la racine (interdit depuis ADR-058) ;
- la chaîne de vérification de l'agent QA ne couvrait que 2 des 5
  `typecheck` et ignorait `verify:domain`, `verify:docs`, `verify:fr`,
  `verify:encoding`, `verify:perf`, `knip` ;
- **7 domaines métier critiques n'avaient aucune compétence** : argent,
  stock/FIFO, clôture/Z, miroir cloud, licence, processus principal
  Electron, discipline des portes.

## 2) Décision

### 2.1 Standard de rédaction (issu de la documentation officielle)

- `name` : `^[a-z0-9]+(-[a-z0-9]+)*$`, **identique au nom du dossier**.
- `description` : 1..1024 caractères, **déclare quand l'appliquer** (seul
  texte lu avant activation) — mots-clés du domaine inclus.
- **Divulgation progressive** : métadonnées → corps (< 5 000 jetons) →
  `references/*.md` chargés à la demande. 11 fichiers de référence
  contient le détail (inventaire des triggers, parité de l'argent, runbook
  du miroir, squelette de porte…).
- Compétences **focalisées** plutôt qu'un document géant.

### 2.2 Suite livrée (10 compétences, 5 agents, 5 commandes)

| Compétence         | Domaine                                              |
| ------------------ | ---------------------------------------------------- |
| `veloria-db`       | schéma, migrations immuables, invariants SQL         |
| `veloria-slice`    | tranche verticale, fin de tâche                      |
| `veloria-ui-fr`    | renderer, français, ergonomie, design system         |
| `veloria-money`    | centimes, arrondi, parité, audit                     |
| `veloria-stock`    | FIFO, unités de base, carton, coût rendu             |
| `veloria-closing`  | Z, jour métier, sessions de caisse, zakat, liasse    |
| `veloria-sync`     | miroir Supabase, outbox, contrat Edge, accès client  |
| `veloria-license`  | `.vlic` Ed25519, empreinte, manifeste, capabilities  |
| `veloria-electron` | sécurité main, enveloppe IPC, sauvegarde, impression |
| `veloria-gates`    | doctrine des portes non vacantes, inventaire         |

Agents : `db-guardian`, `qa`, `ui-fr` (mis à jour) + **`money-guardian`** et
**`sync-guardian`** (nouveaux — les deux domaines à plus fort risque).
Commandes : `migration-new`, `slice`, `verify` (mises à jour) + `docs-metrics`
(nouvelle).

### 2.3 Compétences auto-vérifiées (le point dur)

`npm run verify:docs` contrôle désormais, en plus des compteurs :

1. **standard Agent Skills** : `name` conforme **et** égal au dossier ;
   `description` présente (≤ 1024 caractères) ; corps ≥ 15 lignes ;
2. **zéro chiffre périmé** dans `.opencode/**` et `AGENTS.md` (liste noire :
   « prochain numéro après 0051 », `ADR-135`, `PHASE_X_REPORT.md` sans
   préfixe, `169 fichiers`, `typecheck ×3`, `0001..0056`) ;
3. **table de routage** : toute compétence citée dans `AGENTS.md` **existe**
   (le bug inverse : router vers une compétence absente).

Trois modes d'échec prouvés en conditions réelles (démonstration exécutée) :
compétence renommée → rouge ; chiffre périmé réintroduit → rouge ; capacité
citée absente → rouge.

### 2.4 Source unique des chiffres

Les compétences ne répètent plus de compteurs « vivants » : elles pointent
vers `docs/METRICS.md` (généré, ADR-178) et citent les seuls chiffres
**structurels** (plafonds, formats, tables), qui sont des invariants et non
des états.

## 3) Sources consultées (recherche externe, 2026-11-10)

- Standard Agent Skills : `agentskills.io/specification`, documentation
  OpenCode (`name` = dossier, `description` ≤ 1024, divulgation progressive).
- SQLite : `sqlite.org/stricttables.html`, `lang_altertable.html`,
  `howtocorrupt.html`, `wal.html`, `backup.html` (CHECK vérifié à
  l'écriture seulement, `PRAGMA` no-op en transaction, copie WAL).
- Argent : guides de money engineering (entiers minor units, politique
  d'arrondi centralisée et nommée, propriétés de conservation/bornes).
- Retail : Z-report, réconciliation de tiroir, FIFO et coût rendu par lot,
  conventions de clôture (variances documentées).
- Zakat : actifs − dettes × 2,5 %, seuil (nisab), créances attendues
  encaissables, immobilisations exclues.
- Supabase : `row-level-security`, `api-keys`, `securing-your-data`
  (clé secrète jamais dans un navigateur, `security_invoker` sur les vues,
  clé secrète + jeton utilisateur ⇒ RLS appliqué).
- Licences hors ligne : location signée Ed25519, ordre de vérification fixe,
  algorithme épinglé, clés de rotation embarquées, garde anti-rollback.
- Electron : `context-isolation`, `sandbox`, durcissement CSP/navigation/
  permissions ; Playwright : `electron.launch`, `firstWindow()`, build
  testé, fermeture systématique.

## 4) Conséquences

- Une compétence est **une instruction exécutable** : elle doit être aussi
  exacte que le code qu'elle décrit. D'où l'interdiction automatique des
  chiffres périmés.
- Le routage `AGENTS.md` (règle 13/14) couvre désormais les 7 domaines
  auparavant sans couverture.
- Coût : une porte de ~2 s, aucun runtime ajouté.

## 5) Portes

`verify:docs` vert (compteurs **et** compétences) · `verify:migrations` vert ·
`verify:domain` vert · `verify:fr` / `verify:encoding` verts ·
`format:check` · `eslint` · `tsc -b` ×5 · suite complète verte.
