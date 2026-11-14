# PACKAGE_LAYOUT — Veloria Engineering Skills v2.0.0 (audit + outillage)

Ce dossier est l'**artefact d'audit** de l'installation de la package
`Veloria-Engineering-Skills-v2.0.0.zip` dans le projet Veloria.

Il ne contient **aucune compétence active**. Les compétences installées
(découvertes par OpenCode) sont dans `<repo>/.opencode/skills/<SKILL_ID>/SKILL.md`.

## Pourquoi `vendor/` et non `.opencode/skills/`

OpenCode découvre les compétences dans `.opencode/skills` **à chaque niveau**
entre le répertoire courant et la racine du projet. Une copie imbriquée de
`.opencode/skills` dans ce dossier créerait donc des **Skill ID en double**
si une session était ouverte depuis ce sous-dossier.

La copie d'audit est donc rangée sous `vendor/skills-payload/` : contenu
**byte-identique** à la package, mais **jamais scanné** par OpenCode.

> Conséquence : `vendor/scripts/validate_package.py` (le validateur original de
> la package) attend `.opencode/skills` **relativement à sa racine** ; il doit
> donc être exécuté depuis la racine de la package extraite, pas depuis ici.
> Pour vérifier **l'arbre installé**, utiliser `scripts/validate_installed.py`.

## Arborescence

```text
docs/engineering/skills/veloria-v2.0.0/
├── INSTALLATION_REPORT_V2.0.0.md   <- rapport d'installation (A..M)
├── PACKAGE_LAYOUT.md               <- ce fichier
├── scripts/
│   └── validate_installed.py       <- NOUVEAU : valide l'arbre INSTALLÉ
├── tests/
│   └── test_installed.py           <- NOUVEAU : 10 tests sur l'arbre INSTALLÉ
└── vendor/                         <- COPIE VERBATIM de la package
    ├── README.md
    ├── CHANGELOG.md
    ├── QUICK_START_OPENCODE.md
    ├── MANIFEST.json
    ├── SHA256SUMS.txt
    ├── governance/                 <- 5 fichiers (audit)
    ├── templates/                  <- 3 fichiers (audit)
    ├── prompts/                    <- FIRST_AUDIT_PROMPT_AR.md
    ├── package-scripts/validate_package.py     <- original, non modifié
    ├── package-tests/test_package.py           <- original, non modifié
    ├── archive/original-skills-v1.zip          <- traçabilité (NON une compétence)
    └── skills-payload/             <- les 17 SKILL.md + références (audit)
```

## Ce qui est installé OÙ (chemins canoniques)

| Élément                                | Chemin canonique                                |
| -------------------------------------- | ----------------------------------------------- |
| Compétences actives (17)               | `<repo>/.opencode/skills/<SKILL_ID>/SKILL.md`   |
| Contrat projet                         | `<repo>/governance/VELORIA_PROJECT_CONTRACT.md` |
| Registre des compétences               | `<repo>/governance/SKILLS_REGISTRY.md`          |
| Standard d'écriture                    | `<repo>/governance/SKILL_AUTHORING_STANDARD.md` |
| Matrice d'impact                       | `<repo>/governance/CHANGE_IMPACT_MATRIX.md`     |
| Faits à vérifier                       | `<repo>/governance/PROJECT_FACTS_TO_VERIFY.md`  |
| Modèles (ADR, tâche, notes de version) | `<repo>/templates/`                             |

`governance/` et `templates/` sont **copiés à la racine du dépôt** : ce sont des
fichiers de projet, pas des artefacts d'audit. Les copies `vendor/` ne servent
qu'à la comparaison et à la preuve d'intégrité.

## Exécuter les vérifications

### 1) Intégrité de la package (racine de la package extraite)

```powershell
cd "$env:USERPROFILE\Downloads\Veloria-Engineering-Skills-v2.0.0\Veloria-Engineering-Skills-v2.0.0"
python scripts/validate_package.py
python -m unittest discover -s tests -v
```

### 2) Arbre installé dans le dépôt (ce dossier)

```powershell
cd docs/engineering/skills/veloria-v2.0.0
python scripts/validate_installed.py
python -m unittest discover -s tests -v
```

`validate_installed.py` applique les règles de la package **et** celles de la
porte projet `scripts/quality/verify-docs.mjs` (§3.5), puis vérifie qu'aucun
fichier résiduel de l'ancienne version ne subsiste.

### 3) Porte projet (depuis la racine du dépôt)

```powershell
npm run verify:docs
```

## Empreintes

`vendor/SHA256SUMS.txt` est le manifeste de la package d'origine. Pour
re-vérifier la copie d'audit (hors `tests/__pycache__/*.pyc`, artefact Python
régénéré à chaque exécution) :

```powershell
cd docs/engineering/skills/veloria-v2.0.0/vendor
Get-Content SHA256SUMS.txt | ForEach-Object { ... }   # voir INSTALLATION_REPORT §I
```

## Interdits

- `vendor/` est **verbatim** : ne jamais l'éditer (Prettier l'ignore
  volontairement, `.prettierignore`).
- `vendor/archive/original-skills-v1.zip` est une **trace**, pas une compétence :
  il ne doit jamais être extrait dans un dossier `.opencode/skills`.
- `vendor/skills-payload/` ne doit jamais être renommé en `.opencode/skills`
  (cf. « Pourquoi `vendor/` » ci-dessus).
