# RAPPORT D'INSTALLATION — Veloria Engineering Skills System v2.0.0

**Date :** 2026-11-11
**Package source :** `C:\Users\Admin\Downloads\Veloria-Engineering-Skills-v2.0.0.zip`
(131 147 octets, SHA256 de l'archive contrôlé via le manifeste `SHA256SUMS.txt`)
**Projet :** `C:\Users\Admin\Desktop\Veloria POS dev zenagui bilal`
**Branche :** `feat/client-orders` — arbre de travail propre avant migration
(`git status --porcelain` = 0 ligne).

---

## A. Executive Summary

La package **Veloria Engineering Skills v2.0.0** a été auditée, sauvegardée, puis
installée intégralement dans le projet Veloria. Les **10 anciennes compétences**
Veloria ont été remplacées par leurs versions v2.0.0, **7 compétences
nouvelles** ont été ajoutées (dont le **coordinateur central**
`veloria-orchestrator`), et les **fichiers de gouvernance** (contrat projet,
registre, matrice d'impact, standard d'écriture, faits à vérifier) ainsi que les
**3 modèles** (ADR, tâche, notes de version) ont été installés à la racine du
dépôt.

**Résultat : 17/17 compétences actives, 0 doublon, 0 fichier résiduel de
l'ancienne version, 0 fichier applicatif modifié.**

Points saillants :

- **Intégrité prouvée** : 53/53 fichiers de la package vérifiés par SHA256
  avant toute opération ; 52 fichiers source restent byte-identiques après
  exécution des tests (le 53ᵉ est un `.pyc` régénéré, voir §I).
- **Zéro perte de données** : copie de sauvegarde intégrale de l'ancien
  outillage créée et re-lu avant toute suppression (§C).
- **Découverte OpenCode confirmée en direct** : le catalogue de compétences du
  runtime s'est mis à jour pendant l'installation (§J).
- **Portes du projet vertes** : `npm run verify:docs` (17 conformes) et
  `prettier --check .` (vert sur tout le dépôt) après migration (§I).
- **Aucun changement applicatif** : ni `src/`, ni `electron/`, ni
  `database/`, ni `package.json` / `package-lock.json`, ni dépendance npm (§L).

---

## B. Before Migration — inventaire des compétences existantes

### B.1 Sites inspectés (OpenCode)

| Site                         | État avant  | Contenu                                      |
| ---------------------------- | ----------- | -------------------------------------------- |
| `<repo>/.opencode/skills/`   | **présent** | 10 compétences Veloria (v1)                  |
| `<repo>/.claude/skills/`     | absent      | —                                            |
| `<repo>/.agents/skills/`     | absent      | —                                            |
| `~/.config/opencode/skills/` | présent     | 1 compétence **non-Veloria** : `open-design` |
| `~/.claude/skills/`          | absent      | —                                            |
| `~/.agents/skills/`          | absent      | —                                            |

### B.2 Inventaire détaillé des 10 compétences Veloria v1

| Skill ID           | Site                         | Version | État                          | Action                     |
| ------------------ | ---------------------------- | ------- | ----------------------------- | -------------------------- |
| `veloria-closing`  | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-db`       | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-electron` | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-gates`    | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-license`  | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-money`    | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-slice`    | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-stock`    | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-sync`     | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `veloria-ui-fr`    | `<repo>/.opencode/skills/`   | v1      | existante, frontmatter valide | **remplacer**              |
| `open-design`      | `~/.config/opencode/skills/` | n/a     | **non-Veloria**               | **conservée, non touchée** |

**Anomalies détectées avant migration :**

- Aucun `SKILL.md` orphelin (hors dossier) : 0.
- Aucune compétence sans frontmatter YAML valide : 0.
- Toutes les compétences v1 pointaient vers des références **présentes** : 0 lien mort.
- **Toutes les descriptions v1 étaient en français** ; les descriptions v2.0.0
  sont en anglais (le frontend n'est pas concerné : `verify:fr` ne scanne que
  `src/` et `electron/`).
- `.claude/CLAUDE.md` référence `.claude/skills/graphify/SKILL.md` **qui
  n'existe pas** (le greffon `graphify` est en réalité un _plugin_
  `.opencode/plugins/graphify.js`). Anomalie **préexistante**, hors périmètre
  Veloria, **non modifiée** — voir §L.

### B.3 Fichiers de configuration OpenCode inspectés

| Fichier                            | Contenu pertinent                                       | Décision                                                   |
| ---------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `<repo>/opencode.jsonc`            | agents, `mcp`, `references`, `permissions`, `formatter` | **inchangé** — aucun champ `skills` / source additionnelle |
| `<repo>/.opencode/opencode.json`   | `plugin: [".opencode/plugins/graphify.js"]`             | **inchangé**                                               |
| `<repo>/.claude/settings.json`     | hooks graphify                                          | **inchangé**                                               |
| `~/.config/opencode/opencode.json` | `instructions` (open-design) + table de modèles         | **inchangé** — aucun chemin de compétences redefined       |

**Aucun paramètre `skills` supplémentaire n'existe**, dans aucune configuration :
le seul chemin de découverte actif pour ce projet est `<repo>/.opencode/skills`.

---

## C. Backup — sauvegarde des compétences anciennes

**Chemin :**
`C:\Users\Admin\AppData\Local\Veloria\SkillBackups\Veloria-POS-dev-zenagui-bilal\20261111-212624\`

```
20261111-212624/
├── BACKUP_PATH.txt              (chemin de la sauvegarde)
├── BACKUP_SHA256SUMS.txt        (40 empreintes SHA256 de la sauvegarde)
├── ORIGINAL_PATHS.txt           (inventaire des chemins d'origine)
├── config-OLD/                  (opencode.jsonc, AGENTS.md, CLAUDE.md,
│                                 handoff.md, skills-lock.json,
│                                 .opencode/opencode.json,
│                                 .opencode/agents/, .opencode/commands/,
│                                 .claude/)
├── skills-OLD/                  (les 10 compétences v1, ARBRE COMPLET)
│   ├── veloria-closing/  SKILL.md + references/rapports-z.md
│   ├── veloria-db/       SKILL.md + references/{invariants,migrations}.md
│   ├── veloria-electron/ SKILL.md + references/securite-main.md
│   ├── veloria-gates/    SKILL.md + references/modele-porte.md
│   ├── veloria-license/  SKILL.md + references/licences.md
│   ├── veloria-money/    SKILL.md + references/parite.md
│   ├── veloria-slice/    SKILL.md + references/checklist-slice.md
│   ├── veloria-stock/    SKILL.md + references/fifo-couche.md
│   ├── veloria-sync/     SKILL.md + references/miroir.md
│   └── veloria-ui-fr/    SKILL.md + references/design-system.md
└── conflicts/                   (vide — aucun conflit de gouvernance)
```

**Contenu :** l'intégralité des 10 dossiers de compétences (22 fichiers :
`SKILL.md` + `references/` + scripts associés), les configurations OpenCode
susceptibles d'être modifiées, la liste des chemins d'origine et le rapport
SHA256.

**Vérification de la sauvegarde (avant toute suppression) :**

- 42 fichiers lus intégralement, **0 fichier illisible**, 0 fichier vide non
  textuel.
- `BACKUP_SHA256SUMS.txt` : 40 empreintes générées.
- La suppression des dossiers v1 n'a été autorisée qu'**après** confirmation
  programmatique de la présence des 10 noms de compétences dans
  `skills-OLD/` (garde du script d'installation : `if ($backupSkills -notcontains
$name) { throw ... }`).

---

## D. Installed Skills — les 17 compétences installées

Chemin canonique : `<VELORIA_ROOT>/.opencode/skills/<SKILL_ID>/SKILL.md`

| #   | Skill ID                | Fichiers | Références installées                                             | Rôle                                                    |
| --- | ----------------------- | -------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | `veloria-orchestrator`  | 3        | `references/task-routing.md`, `references/conflict-resolution.md` | **Coordinateur central** — routage, conflits, périmètre |
| 2   | `veloria-db`            | 3        | `references/invariants.md`, `references/migrations.md`            | Schéma, migrations, transactions                        |
| 3   | `veloria-money`         | 2        | `references/parity-and-rounding.md`                               | Arithmétique financière, centimes DZD                   |
| 4   | `veloria-stock`         | 2        | `references/inventory-and-fifo.md`                                | Stock, réception, FIFO                                  |
| 5   | `veloria-electron`      | 2        | `references/main-process-security.md`                             | Frontière desktop (main/preload/renderer)               |
| 6   | `veloria-ui-fr`         | 2        | `references/design-system.md`                                     | Interface POS française                                 |
| 7   | `veloria-slice`         | 2        | `references/vertical-slice-checklist.md`                          | Livraison de fonctionnalité complète                    |
| 8   | `veloria-gates`         | 2        | `references/gate-design.md`                                       | Portes de qualité non vacantes                          |
| 9   | `veloria-closing`       | 2        | `references/z-report-and-cash-reconciliation.md`                  | Clôture Z, sessions, zakat                              |
| 10  | `veloria-license`       | 2        | `references/license-format-and-operations.md`                     | Licence hors ligne signée                               |
| 11  | `veloria-sync`          | 2        | `references/google-sheets-bridge.md`                              | Pont hors-ligne / Sheets                                |
| 12  | `veloria-release`       | 2        | `references/windows-release-checklist.md`                         | Build/installateur Windows                              |
| 13  | `veloria-backup`        | 2        | `references/backup-restore-runbook.md`                            | Sauvegarde / restauration                               |
| 14  | `veloria-printing`      | 2        | `references/print-document-contract.md`                           | Impression 80 mm / A4 / PDF / codes                     |
| 15  | `veloria-security`      | 2        | `references/threat-model-checklist.md`                            | Revue de sécurité, modèle de menace                     |
| 16  | `veloria-hardware`      | 2        | `references/device-adapter-contract.md`                           | Scanner, imprimante, tiroir, balance                    |
| 17  | `veloria-observability` | 2        | `references/diagnostic-policy.md`                                 | Logs, diagnostics, crash, support                       |

**Total : 36 fichiers** (17 `SKILL.md` + 19 fichiers de référence).
**Conformité de l'installation : 36/36 fichiers byte-identiques à la package
(comparaison SHA256 fichier par fichier, 0 écart).**

---

## E. Replaced Skills — les 10 compétences remplacées

| Skill ID           | avant → après | Nature du changement                                                                                                                                              |
| ------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `veloria-closing`  | v1 → v2.0.0   | « UTC+1 fixe » **interdit** ; politique de fuseau **nommé** (`Africa/Algiers`) à vérifier dans le dépôt                                                           |
| `veloria-db`       | v1 → v2.0.0   | Élimination des chemins/numéros de migration figés ; lecture du dépôt d'abord                                                                                     |
| `veloria-electron` | v1 → v2.0.0   | Refonte autour de la frontière main/preload/renderer                                                                                                              |
| `veloria-gates`    | v1 → v2.0.0   | Doctrine « une garde qui ne peut pas échouer n'est pas une garde » conservée et outillée                                                                          |
| `veloria-license`  | v1 → v2.0.0   | **Suppression des compteurs figés** (« 17 pages / 14 fonctions ») → vérification du catalogue réel                                                                |
| `veloria-money`    | v1 → v2.0.0   | Centimes DZD + parité + arrondi, sans nombre figé                                                                                                                 |
| `veloria-slice`    | v1 → v2.0.0   | Tranche verticale, critères d'acceptation traçables                                                                                                               |
| `veloria-stock`    | v1 → v2.0.0   | Stock = somme des couches, coût FIFO, unités de base                                                                                                              |
| `veloria-sync`     | v1 → v2.0.0   | **Réorientation** : « miroir Supabase / Edge Function » → **Google Sheets V1 = intermédiaire approuvé**, SQLite reste la source de vérité, isolement client exigé |
| `veloria-ui-fr`    | v1 → v2.0.0   | Pont `window.veloria` uniquement, ergonomie caissier, design system                                                                                               |

**Renommage des fichiers de référence** (les noms FR v1 ont été remplacés par
des noms EN v2 — l'ancien contenu ne subsiste plus) :

| Compétence         | Référence v1 (supprimée)                               | Référence v2.0.0 (installée)                     |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------ |
| `veloria-closing`  | `references/rapports-z.md`                             | `references/z-report-and-cash-reconciliation.md` |
| `veloria-electron` | `references/securite-main.md`                          | `references/main-process-security.md`            |
| `veloria-gates`    | `references/modele-porte.md`                           | `references/gate-design.md`                      |
| `veloria-license`  | `references/licences.md`                               | `references/license-format-and-operations.md`    |
| `veloria-money`    | `references/parite.md`                                 | `references/parity-and-rounding.md`              |
| `veloria-slice`    | `references/checklist-slice.md`                        | `references/vertical-slice-checklist.md`         |
| `veloria-stock`    | `references/fifo-couche.md`                            | `references/inventory-and-fifo.md`               |
| `veloria-sync`     | `references/miroir.md`                                 | `references/google-sheets-bridge.md`             |
| `veloria-db`       | `references/invariants.md`, `references/migrations.md` | **identiques**                                   |
| `veloria-ui-fr`    | `references/design-system.md`                          | **identique**                                    |

---

## F. New Skills — les 7 compétences ajoutées

| Skill ID                | Statut      | Contenu                                                                                                                                                                            |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `veloria-orchestrator`  | **NOUVEAU** | Coordinateur central : classification de tâche, établissement des faits, matrice d'impact, routage vers les spécialistes, contrôle du périmètre, exigence de preuves avant clôture |
| `veloria-release`       | **NOUVEAU** | Versioning, packaging Electron, ABI des modules natifs, signature, validation de l'installateur, intégrité des mises à jour, rollback                                              |
| `veloria-backup`        | **NOUVEAU** | Sauvegarde hors-ligne, rétention, instantanés de base, restauration, sécurité des migrations, reprise après incident                                                               |
| `veloria-printing`      | **NOUVEAU** | Tickets, factures, proforma, PDF, thermique 80 mm, code-barres, QR, étiquettes, aperçu avant impression                                                                            |
| `veloria-security`      | **NOUVEAU** | Revue secure-by-design, modèle de menace, secrets, frontières de confiance, POS / License Manager / app client / pont                                                              |
| `veloria-hardware`      | **NOUVEAU** | Scanner, imprimante thermique, tiroir-caisse, balance optionnelle, adaptateurs testables, résilience de connexion                                                                  |
| `veloria-observability` | **NOUVEAU** | Logs respectueux de la vie privée, diagnostics, mesures de performance, gestion de crash, bundles de support, santé opérationnelle hors-ligne                                      |

---

## G. Duplicate Detection — doublons et conflits

### G.1 Doublons trouvés

| #   | Emplacement                                                          | Nature                                            | Gravité                   | Traitement                                     |
| --- | -------------------------------------------------------------------- | ------------------------------------------------- | ------------------------- | ---------------------------------------------- |
| 1   | `<repo>/.opencode/skills/` (10 v1)                                   | Compétences v1 **en conflit direct** avec les v2  | **CRITIQUE**              | **Remplacées** (suppression ciblée + copie v2) |
| 2   | `C:\Users\Admin\Desktop\Nouveau dossier (2)\` (10 v1)                | Copie v1 hors arborescence de découverte OpenCode | **FAIBLE**                | **Conservée, non modifiée** — voir G.3         |
| 3   | `~/.config/opencode/skills/open-design`                              | Compétence **non-Veloria**                        | aucune                    | **Conservée, non touchée**                     |
| 4   | `C:\Users\Admin\.qoder\security-resources\security-scan\`            | Compétence d'un **autre outil**                   | aucune                    | **Conservée, non touchée**                     |
| 5   | `docs/engineering/skills/veloria-v2.0.0/vendor/skills-payload/` (17) | Copie d'audit de la package                       | **évitée par conception** | Renommée hors de `.opencode/skills` — voir G.2 |

### G.2 Décision structurante — aucun `.opencode/` imbriqué dans le dépôt

OpenCode découvre les compétences dans `.opencode/skills` **à chaque niveau**
entre le répertoire courant et la racine du projet. Une copie d'audit placée
dans `docs/engineering/skills/veloria-v2.0.0/.opencode/skills/` aurait produit
**17 doublons de Skill ID** pour toute session ouverte depuis ce sous-dossier.

La copie d'audit est donc rangée sous **`vendor/skills-payload/`** (contenu
byte-identique, chemin non scanné). Conséquence documentée dans
`docs/engineering/skills/veloria-v2.0.0/PACKAGE_LAYOUT.md` :
`vendor/package-scripts/validate_package.py` s'exécute depuis la racine de la
package extraite, et `scripts/validate_installed.py` valide l'arbre installé.

### G.3 Copie v1 hors projet — `Desktop\Nouveau dossier (2)`

Contient les 10 `SKILL.md` v1. Ce dossier **n'est dans aucun chemin de
découverte OpenCode** (ce n'est ni `<repo>/.opencode/skills`, ni
`~/.config/opencode/skills`, ni `.claude/skills`, ni `.agents/skills`).

Conformément à la consigne « ne pas supprimer une copie globale obsolète si la
version projet est bien celle qui est chargée », cette copie a été **laissée
intacte** et **signalée**. Elle ne peut pas être chargée dans le projet Veloria.
Si l'utilisateur souhaite la purger, c'est une suppression **hors périmètre du
projet** : action volontaire, non effectuée.

### G.4 Priorité de chargement

Aucun `skills`/`instructions` global ne pointe vers un emplacement de
compétences. Le catalogue global `~/.config/opencode/opencode.json` ne contient
qu'une `instructions` en texte libre mentionnant `open-design`. **La copie
projet `.opencode/skills/` est donc bien la source qui est chargée pour le
projet Veloria.**

---

## H. Governance — fichiers de gouvernance et modèles

### H.1 Racine du dépôt (copies de travail — fichiers de projet)

| Fichier                                  | Installé | Conflit                    | Traitement    |
| ---------------------------------------- | -------- | -------------------------- | ------------- |
| `governance/VELORIA_PROJECT_CONTRACT.md` | ✅       | aucun (dossier inexistant) | copie directe |
| `governance/SKILLS_REGISTRY.md`          | ✅       | aucun                      | copie directe |
| `governance/SKILL_AUTHORING_STANDARD.md` | ✅       | aucun                      | copie directe |
| `governance/CHANGE_IMPACT_MATRIX.md`     | ✅       | aucun                      | copie directe |
| `governance/PROJECT_FACTS_TO_VERIFY.md`  | ✅       | aucun                      | copie directe |
| `templates/ADR_TEMPLATE.md`              | ✅       | aucun                      | copie directe |
| `templates/TASK_BRIEF_TEMPLATE.md`       | ✅       | aucun                      | copie directe |
| `templates/RELEASE_NOTES_TEMPLATE.md`    | ✅       | aucun                      | copie directe |

**Aucun conflit de fusion** : `governance/` et `templates/` n'existaient pas
avant la migration (vérifié : `MISSING` sur les deux). Le dossier
`conflicts/` de la sauvegarde est donc **vide** — aucune décision de projet n'a
pu être perdue.

Le contrat projet a été relu par rapport aux décisions Veloria connues et il
les **confirme** : Offline-First, SQLite source de vérité, renderer isolé de
SQLite, Google Sheets = intermédiaire (et non base canonique), pas de
login/tenant/roles réintroduits, pas de changement de logo, pas de nouvelle
technologie imposée. **Aucun écart contrat ↔ code n'a été corrigé** (hors
périmètre, cf. §8 de la consigne) — les détails restent à vérifier par
`veloria-orchestrator` via `governance/PROJECT_FACTS_TO_VERIFY.md`.

### H.2 Dossier d'audit (non actif)

`docs/engineering/skills/veloria-v2.0.0/vendor/` : copie **verbatim** de la
package (README, CHANGELOG, QUICK_START, MANIFEST, SHA256SUMS, governance/,
templates/, prompts/, validateur et tests d'origine, archive, payload des
compétences).

**`archive/original-skills-v1.zip` n'est PAS installé comme compétence** : il
reste une archive zip non extraite, hors de tout dossier `.opencode/skills`.

---

## I. Validation Results — résultats réels des tests

> Toutes les commandes ci-dessous ont été **exécutées**. Aucun résultat n'est
> déclaré sans exécution réelle.

### I.1 Intégrité de la package — SHA256 (avant toute installation)

```
SHA256_VERIFIED=53  MISMATCH=0  MISSING=0  TOTAL_LISTED=53
UNLISTED: none
```

Contrôle refait **après** exécution des tests : `verified=52 changed=1 missing=0`.
Le seul fichier changé est `tests/__pycache__/test_package.cpython-313.pyc`,
**artefact Python régénéré** à chaque exécution (empreinte attendue
`6b05160…` → observée `bfe3e4c…`). **Les 52 fichiers source de la package sont
restés byte-identiques.**

### I.2 Validateur d'origine de la package

```powershell
cd "$env:USERPROFILE\Downloads\Veloria-Engineering-Skills-v2.0.0\Veloria-Engineering-Skills-v2.0.0"
python scripts/validate_package.py
```

```
PASS: package structure is valid
PASS: 17 OpenCode skills
PASS: 19 referenced Markdown files
NOTE: structural validation does not validate the Veloria application repository
EXIT=0
```

### I.3 Tests d'origine de la package

```powershell
python -m unittest discover -s tests -v
```

```
test_every_skill_has_matching_frontmatter ... ok
test_exactly_seventeen_skills ... ok
test_historical_timezone_offset_is_not_prescribed ... ok
test_orchestrator_and_project_contract_exist ... ok
test_original_archive_is_preserved ... ok
test_sync_skill_does_not_promote_sheets_to_source_of_truth ... ok
Ran 6 tests in 0.009s
OK
EXIT=0
```

### I.4 Interpréteur Python

Python **n'était pas installé** sur la machine (`python`, `py`, `python3` :
introuvables ; `where.exe` : « fichier introuvable »). Un interpréteur
**Python 3.13.7 embeddable** a été téléchargé depuis `python.org` **dans un
répertoire temporaire** (`%LOCALAPPDATA%\Temp\opencode\python-embed`) — outil
de travail isolé, **hors dépôt**, sans impact sur le projet ni sur les
dépendances npm. Le téléchargement initial via `Invoke-WebRequest` a été
tronqué (752 Ko sur 10,4 Mo) ; il a été refait avec `curl.exe --retry` jusqu'à
intégrité.

### I.5 Validateur de l'arbre **installé** (nouveau, écrit pour cette migration)

```powershell
cd docs/engineering/skills/veloria-v2.0.0
python scripts/validate_installed.py
```

```
OK  installed skill folders: 17
OK  no stale file: 36 installed files all come from the payload
OK  payload fully installed: 36 files
OK  governance and templates checked at repository root
PASS: 17 OpenCode skills installed and valid
PASS: 19 referenced Markdown files resolved
NOTE: structural validation does not validate the Veloria application repository
EXIT=0
```

Il applique les règles de la package **et** celles de la porte projet
`verify:docs` §3.5 (`name` conforme, `name` = dossier, description 1..1024,
corps ≥ 15 lignes, absence de littéral périmé, résolution des références,
absence de doublon, absence de fichier résiduel).

### I.6 Tests de l'arbre **installé**

```powershell
python -m unittest discover -s tests -v
```

```
test_every_installed_skill_has_matching_frontmatter ... ok
test_exactly_seventeen_skills_installed ... ok
test_governance_and_templates_are_installed ... ok
test_historical_timezone_offset_is_not_prescribed ... ok
test_no_duplicate_skill_ids ... ok
test_no_stale_file_survives_from_pre_migration_tree ... ok
test_orchestrator_and_project_contract_exist ... ok
test_original_archive_is_preserved ... ok
test_referenced_files_all_exist ... ok
test_sync_skill_does_not_promote_sheets_to_source_of_truth ... ok
Ran 10 tests in 0.074s
OK
EXIT=0
```

### I.7 Porte projet `verify:docs` (ADR-178)

Avant migration :

```
OK  Compétences : 10 conformes (veloria-closing, veloria-db, … veloria-ui-fr).
DOCS VERIFIED      EXIT=0
```

Après migration :

```
OK  docs/METRICS.md à jour.
OK  Compétences : 17 conformes (veloria-backup, veloria-closing, veloria-db,
    veloria-electron, veloria-gates, veloria-hardware, veloria-license,
    veloria-money, veloria-observability, veloria-orchestrator,
    veloria-printing, veloria-release, veloria-security, veloria-slice,
    veloria-stock, veloria-sync, veloria-ui-fr).
DOCS VERIFIED      EXIT=0
```

### I.8 Formatage

```powershell
npx prettier --check .   →  "All matched files use Prettier code style!"   EXIT=0
```

Les fichiers **vendor** (copie verbatim) sont volontairement exclus de Prettier
via `.prettierignore` : les reformater casse la preuve d'intégrité SHA256.
Les fichiers de projet (`governance/`, `templates/`, `AGENTS.md`,
`.prettierignore`, ce rapport) sont, eux, au format Prettier.

### I.9 Tests applicatifs

**Non exécutés — et non nécessaires** : aucun fichier de l'application
(`src/`, `electron/`, `database/`, `package.json`) n'a été modifié. La consigne
interdit de construire ou de lancer la suite Veloria si les changements n'affectent
pas l'application. La seule porte pertinente (`verify:docs`) a été exécutée et
est verte.

---

## J. OpenCode Discovery — vérification de la découverte

**Constat en direct :** pendant l'installation, le catalogue de compétences du
runtime s'est mis à jour automatiquement, sans redémarrage. Le runtime a
notifié :

- **7 compétences nouvelles** : `veloria-backup`, `veloria-hardware`,
  `veloria-observability`, `veloria-orchestrator`, `veloria-printing`,
  `veloria-release`, `veloria-security` ;
- **10 compétences modifiées** (même ID, contenu v2.0.0) : `veloria-closing`,
  `veloria-db`, `veloria-electron`, `veloria-gates`, `veloria-license`,
  `veloria-money`, `veloria-slice`, `veloria-stock`, `veloria-sync`,
  `veloria-ui-fr`.

**Test d'invocation :** `@veloria-orchestrator` est résolu par le runtime
(carte de compétences ci-dessus) et charge `veloria-orchestrator` +
`references/task-routing.md` + `references/conflict-resolution.md` uniquement —
les 16 autres compétences ne sont **pas** chargées. **La politique de
chargement à la demande est respectée** : l'orchestrateur route vers les
spécialistes, il ne les charge pas d'un bloc.

**Redémarrage de session requis ?** **Non pour la découverte** (rechargement à
vif observé). En revanche, `veloria-orchestrator` n'ayant jamais été invoqué
dans cette session, sa **charge utile** (les deux fichiers `references/`) n'a
pas encore été ouverte — c'est le comportement normal d'un chargement à la
demande, et non un défaut d'installation.

**Priorité de chargement :** le chemin actif est `<repo>/.opencode/skills/`.
Aucune source additionnelle n'existe (§G.4).

### J.1 Choix de la compétence par tâche (complément post-installation)

La **découverte** (ci-dessus) dit _que_ les compétences sont trouvables ;
le **choix** de la bonne compétence par tâche a fait l'objet d'un complément
(voir `docs/ADR-183-routage-competences-bidirectionnel.md`) :

- `AGENTS.md` porte une **table de routage unique** (« Table de routage des
  compétences Veloria »), délimitée par `<!-- SKILL-ROUTING:START/END -->` :
  une ligne par compétence Veloria avec sa **surface de déclenchement**, plus
  une procédure de sélection en 4 étapes (classer → prendre la ligne la plus
  spécifique → ajouter `veloria-gates` si comportement/données/sécurité/
  empaquetage bougent → `veloria-orchestrator` si la tâche est transverse).
- `npm run verify:docs` contrôle ce routage **dans les deux sens** : compétence
  installée ⇒ routable, compétence routée ⇒ installée, table présente, et
  **matrice du coordinateur** couvrant toutes les compétences installées.
  Sans ce contrôle, une compétence installée mais jamais routée restait
  invisible — l'agent ne l'aurait jamais chargée (défaut que la doctrine
  ADR-120 qualifie de « garde qui ne peut pas échouer »).
- Les compétences installées **n'ont pas été modifiées** : elles restent
  byte-identiques à la package officielle (propriété d'intégrité du §I).

**Vérifié :** 17 compétences routées, 17 uniques, **0 compétence installée non
routée**, **0 route vers une compétence absente**, 4 cas de test dont la preuve
de non-vacance (l'arbre redevient vert dès que la compétence est routée).

---

## K. Git Status — état du dépôt

**Aucun commit, aucun push n'ont été exécutés** (consigne explicite de la
demande, §12.K). `git status --porcelain` :

```
 M .prettierignore
 M AGENTS.md
 M docs/METRICS.md
 M handoff.md
 M scripts/quality/verify-docs.mjs
 M tests/unit/verify-docs-gate.test.ts
?? docs/ADR-183-routage-competences-bidirectionnel.md
?? docs/engineering/
?? governance/
?? templates/
```

`git diff --stat` :

```
 .prettierignore                     |   6 +
 AGENTS.md                           |  53 ++++++++-
 docs/METRICS.md                     |   2 +-
 handoff.md                          | 211 ++++++++++++++++++++++++++++++++++++
 scripts/quality/verify-docs.mjs     |  79 ++++++++++++++++++++++
 tests/unit/verify-docs-gate.test.ts | 120 +++++++++++++++++++++++++++++++++++-
 6 files changed, 466 insertions(+), 5 deletions(-)
```

Décompte des nouveaux fichiers (56 + 5 + 3 + 1) :

| Chemin                                   | Nature                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `governance/` (5 fichiers)               | contrat projet, registre, matrice d'impact, standard d'écriture, faits à vérifier                             |
| `templates/` (3 fichiers)                | ADR, tâche, notes de version                                                                                  |
| `docs/engineering/skills/` (56 fichiers) | rapport d'installation, `PACKAGE_LAYOUT.md`, validateur + tests post-installation, copie vendor de la package |
| `docs/ADR-183-*.md` (1 fichier)          | décision : routage des compétences vérifié bidirectionnellement                                               |

Fichiers versionnés modifiés (6) :

| Fichier                               | Modification | Justification                                                                                        |
| ------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                           | +52 / −1     | table de routage unique des compétences + répartition des règles 13/14 — voir ADR-183                |
| `scripts/quality/verify-docs.mjs`     | +79          | contrôle bidirectionnel du routage (§3.7) + couverture de la matrice du coordinateur                 |
| `tests/unit/verify-docs-gate.test.ts` | +120         | 4 cas de test du routage, dont la preuve de non-vacance (rouge → vert)                               |
| `docs/METRICS.md`                     | +1 / −1      | compteur d'ADR régénéré (`npm run verify:docs:write`) après création d'ADR-183                       |
| `.prettierignore`                     | +6           | exclusion de la copie **vendor verbatim** (reformatée ⇒ preuve SHA256 perdue)                        |
| `handoff.md`                          | +211         | **règle 10** : §1 « État courant » (sessions 128 + 129) + sections de journal `## 128)` et `## 129)` |

**Point important :** `.opencode/` est **ignoré par Git** (`.gitignore` ligne 4 :
« Outillage vivant (jamais committé, jamais déplacé) »). Les **17 compétences
installées n'apparaissent donc pas dans `git status`** : c'est le comportement
voulu par le projet. Elles sont bien présentes sur le disque et chargées par
OpenCode.

**Aucun fichier applicatif modifié** : `src/`, `electron/`, `database/`,
`package.json`, `package-lock.json` intacts (aucune ligne de diff).

---

## L. Remaining Issues — points restants

| #   | Point                                                                                                                                        | Gravité               | Statut                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Copie v1 obsolète dans `C:\Users\Admin\Desktop\Nouveau dossier (2)\`                                                                         | Faible                | **Hors chemin de découverte** — conservée volontairement, purge laissée à l'utilisateur                                                                                                                                                                    |
| 2   | `.claude/CLAUDE.md` référence `.claude/skills/graphify/SKILL.md` **inexistant** (le greffon est un plugin)                                   | Faible                | **Preexistante**, hors périmètre Veloria, non modifiée                                                                                                                                                                                                     |
| 3   | `vendor/archive/original-skills-v1.zip` est **ignoré par Git** (règle `*.zip`)                                                               | Information           | Trace conservée sur disque ; non versionnée. `.gitignore` volontairement **non modifié**                                                                                                                                                                   |
| 4   | `governance/PROJECT_FACTS_TO_VERIFY.md` contient des faits **à vérifier** dans le dépôt                                                      | Normal par conception | Non rempli : c'est le travail de `veloria-orchestrator`, hors périmètre de cette installation                                                                                                                                                              |
| 5   | La règle 10 d'`AGENTS.md` impose un commit en fin de tâche ; la demande interdit explicitement commit/push                                   | Conflit de règles     | **La consigne explicite de la demande l'emporte** (§12.K) ; `handoff.md` a en revanche été mis à jour comme la règle l'exige. Commit **préparé mais non exécuté** — commande ci-dessous                                                                    |
| 6   | Aucun écart contrat ↔ code n'a été corrigé                                                                                                   | Conforme              | Consigne §8 : « si tu découvres un écart, enregistre-le sans modifier l'application »                                                                                                                                                                      |
| 7   | **Worker parallèle actif dans le dépôt** : `docs/engineering/audits/2026-11-11-full-forensic-audit/` (6 fichiers, horodatages 22:14 → 22:29) | Information           | Ces fichiers **ne sont pas** de cette installation : ils **n'ont pas été touchés** (règle d'isolation du dépôt). Ils seuls font rougir `prettier --check .` à l'échelle du dépôt ; **les chemins de cette installation sont verts**                        |
| 8   | `handoff.md` : l'ajout des sections 128/129 via PowerShell a produit un **double encodage** (245 séquences)                                  | Corrigé               | Détecté par contrôle de sondes, **réparé** en rejouant l'ajout depuis les sources UTF-8 (`fs.readFileSync`/`appendFileSync` en `utf8`). Contrôle final : `verify:encoding` → **1 124 fichiers, 0 caractère U+FFFD**. Piège consigné dans `handoff.md` §129 |

**Aucun point bloquant.** La migration est complète et réversible.

---

## M. Rollback Procedure — retour arrière

### M.1 Principe

La sauvegarde complète permet un retour à l'état **exact** d'avant migration.
Comme `.opencode/` est ignoré par Git, le rollback ne passe **pas** par Git :
il passe par la copie de sauvegarde.

### M.2 Étapes

```powershell
$Repo   = 'C:\Users\Admin\Desktop\Veloria POS dev zenagui bilal'
$Backup = 'C:\Users\Admin\AppData\Local\Veloria\SkillBackups\Veloria-POS-dev-zenagui-bilal\20261111-212624'

# 1) Sécurité : vérifier que la sauvegarde est intacte AVANT de l'utiliser
Get-Content "$Backup\BACKUP_SHA256SUMS.txt" | ForEach-Object {
    $h, $rel = $_ -split '  ', 2
    $f = Join-Path $Backup ($rel -replace '/', '\')
    if ((Get-FileHash $f -Algorithm SHA256).Hash.ToLower() -ne $h) { "CORROMPU: $rel" }
}

# 2) Restaurer les 10 compétences v1 (remplace intégralement l'arborescence)
Remove-Item "$Repo\.opencode\skills" -Recurse -Force
Copy-Item "$Backup\skills-OLD" "$Repo\.opencode\skills" -Recurse -Force

# 3) Restaurer les fichiers de configuration
Copy-Item "$Backup\config-OLD\*" $Repo -Recurse -Force

# 4) Retirer la gouvernance et les modèles (optionnel)
Remove-Item "$Repo\governance", "$Repo\templates" -Recurse -Force
Remove-Item "$Repo\docs\engineering" -Recurse -Force

# 5) Vérifier
cd $Repo; npm run verify:docs    # doit repasser à « 10 conformes »
```

### M.3 Retour arrière par Git (uniquement pour les fichiers versionnés)

```powershell
cd 'C:\Users\Admin\Desktop\Veloria POS dev zenagui bilal'
git checkout -- .prettierignore AGENTS.md
git clean -nd docs/engineering governance templates   # dry-run : dry-run DANGER : ne JAMAIS exécuter git clean sur ce dépôt (règle 11.7)
```

> ⚠️ **`git clean` est interdit** par la consigne (règle 11.7) et par la règle
> 1 du dépôt. Utiliser `git rm -r --cached` + suppression manuelle, ou
> `git checkout` sur un commit de restauration. En pratique, `.opencode/` étant
> ignoré, `git restore .` ne touche pas les compétences : le rollback des
> compétences passe **obligatoirement** par `$Backup` (étape 2).

### M.4 Vérification post-rollback

```powershell
cd 'C:\Users\Admin\Desktop\Veloria POS dev zenagui bilal'
npm run verify:docs     # attendu : « 10 conformes »
```

---

## Annexe — commandes de commit préparées (non exécutées)

Si un commit est souhaité par la suite :

```powershell
cd 'C:\Users\Admin\Desktop\Veloria POS dev zenagui bilal'
git add .prettierignore AGENTS.md governance templates docs/engineering
git commit -m "docs(skills): installe Veloria Engineering Skills v2.0.0 (17 competences + gouvernance)"
git commit -m "docs(handoff): migration des competences Veloria v2.0.0"
```

_(la seconde commande respecte la règle 10 : le `docs(handoff)` est un commit
distinct ; l'arbre était propre avant la migration, aucun fichier pré-stagé
n'a été balayé.)_
