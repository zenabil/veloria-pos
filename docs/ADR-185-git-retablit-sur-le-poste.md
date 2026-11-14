# ADR-185: Git rétabli sur le poste de développement (PATH) et dette d'encodage de `handoff.md`

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owner:** Engineering
- **Related skills:** veloria-gates, veloria-orchestrator
- **Context:** `handoff.md` §1 (sessions 126, 128, 130, 131) ; audit
  `docs/engineering/audits/2026-11-11-full-forensic-audit/` (constat _git history_)

## Context

Quatre sessions consécutives (126, 128, 130, 131) ont consigné **le même
blocage** dans `handoff.md` :

> « **Aucun commit n'a pu être exécuté : l'exécutable `git` est ABSENT de ce
> poste** (vérifié : `where git`, `git --version`, `Program Files`,
> `Program Files (x86)`, `%LOCALAPPDATA%`, `C:\Program Files\Git\cmd\git.exe`
> — aucun chemin). »

La conclusion répétée — « le poste n'a pas Git » — était **fausse**. Le
diagnostic réel (mesuré) :

- `Get-Command git` → _not recognized_ : c'est un problème de **PATH**, pas
  d'absence de binaire.
- Le binaire existait : `C:\Users\Admin\AppData\Local\Programs\deepai-code-desktop\resources\git\cmd\git.exe`
  (Git for Windows **2.56.0.windows.2**, distribution portable) — embarqué dans
  le dossier `resources/` d'une application tierce.
- Le dépôt n'a jamais été « sans Git » : `.git/` existe, `HEAD` pointe
  `d9e992b`, l'index, les objets et les refs sont intacts, et
  `git fsck` ne signale **aucune** corruption.

Le coût de cette erreur de diagnostic a été **quatre sessions de travail réel
non committé** (42 fichiers modifiés + 20 fichiers nouveaux : vagues 0, 1, 2, 3,
4 et 5 du plan de remédiation, ADR-183, ADR-184, gouvernance, migration 0064,
portes `verify:release-config` et `verify:governance-arch`).

Une seconde dette s'est révélée en ouvrant le fichier : `handoff.md` dans
`HEAD` était **entièrement** en mojibake — **30 981 caractères U+FFFD** —
produit par un aller-retour PowerShell `Get-Content` (lecture ANSI cp1252 d'un
fichier UTF-8 sans BOM) suivi de `Set-Content` (réécriture UTF-8). La version
de travail avait été ramenée à **257 U+FFFD**, tous concentrés dans le bloc
« Session 130 » (écrit par un chantier tiers et donc hors du périmètre de ce
chantier).

## Decision drivers

- La règle 10 de `AGENTS.md` (« commit obligatoire en fin de tâche ») était
  ** inapplicable** depuis quatre sessions : le dépôt perdait son historique
  alors que le travail, lui, avançait.
- Le `handoff.md` est le **document de continuité** du projet : un document
  illisible à 100 % n'est pas un document de continuité, c'est une perte.
- Le §129 de `handoff.md` consigne déjà le piège exact : « la **réparation par
  `latin1`** est fausse pour la plage cp1252 `0x80`–`0x9F` (`€`, `…`, `œ`) :
  elle produit des `U+FFFD`. La bonne façon de faire est de **rejouer l'ajout
  depuis la source UTF-8**, pas de **ré-encoder un texte déjà abîmé** ».
- Un `PATH` pointant vers le dossier `resources/` d'une application tierce se
  brise à la première mise à jour de cette application : la correction doit
  être **durable**, pas provisoire.

## Decision

### 1. Git est installé dans un emplacement durable, puis exposé par le PATH

La distribution portable est **copiée** vers `C:\Users\Admin\tools\git\` — la
convention déjà en place sur ce poste (`tools\node`, `tools\jdk17`), hors du
répertoire d'une application tierce. `C:\Users\Admin\tools\git\cmd` et
`C:\Users\Admin\tools\git\bin` sont ajoutés au **PATH utilisateur**
(`HKCU\Environment`, pas Machine : aucun privilège administrateur requis) et
les entrées `deepai-code-desktop` sont **retirées** du PATH. Une diffusion
`WM_SETTINGCHANGE` est émise pour que les processus déjà ouverts en tiennent
compte.

### 2. Le blocage « git absent » est consigné comme **erreur de diagnostic**, pas comme un état de l'environnement

Le fait à retenir n'est pas « Git est installé » (un fait d'environnement,
qui peut changer) mais « **le diagnostic était faux** » : une recherche de
binaire dans les répertoires standard n'a pas suffi, parce que le binaire était
ailleurs. Le contrôle à appliquer : `Get-Command git` **et** un parcours des
répertoires d'applications embarquées — et, surtout, la vérification que le
dépôt `.git/` est cohérent (`git fsck`) avant de conclure à « pas de Git ».

### 3. Le bloc « Session 130 » est **rejoué** depuis sa source, pas ré-encodé

Les 257 U+FFFD résiduels sont réparés en **rejouant l'ajout** depuis une source
UTF-8 propre : le contenu réellement livré par le code du dépôt
(`scripts/licensing/secret-scan.mjs`, `scripts/release/stamp-build-info.js`,
`scripts/release/verify-artifact.js`, `scripts/quality/verify-release-config.mjs`,
`electron/ipc/sender-guard.ts`, `config/playwright.config.ts`,
`tests/unit/secret-scan-bypass.test.ts`,
`tests/unit/ipc-sender-guard.test.ts`,
`tests/database/client-order-domain-contract.test.ts`) et le plan
`docs/engineering/audits/2026-11-11-full-forensic-audit/08_RADICAL_REMEDIATION_PLAN.md`.
**Aucune** tentative de re-décodage du texte abîmé : c'est la seule méthode
documentée comme fiable (§129), et la seule qui rende le texte **exact**.

### 4. La porte `verify:encoding` couvre désormais `handoff.md`

`handoff.md` était hors du périmètre de `scripts/quality/verify-encoding.mjs`
(`SCAN_DIRS` + `SCAN_FILES`) : **le document de continuité n'était pas
protégé** par la porte censée empêcher la corruption d'encodage. Il y est
ajouté, ce qui fait de la porte une garantie réelle plutôt que partielle.

## Consequences

**Positives**

- La règle 10 redevient applicable : l'arbre est committé, l'historique est
  reconstitué, les sessions 130 et 131 ne sont plus perdues.
- `handoff.md` redevient lisible (0 U+FFFD) et **contrôlé** par une porte.
- Git est **durable** : la copie dans `tools\git` survit à la mise à jour de
  l'application qui embarquait la distribution.

**Négatives / limites assumées**

- `npm run license:key-custody` sort **1** sur ce poste : l'ancre embarquée
  `resources/license/keys.json#k1` a sa clé privée correspondante dans
  `private/vendor-keys/`. C'est le comportement **correct** de la porte
  (fail-closed) — la rotation de l'ancre reste une **action opérateur** sur la
  machine vendor (`docs/licensing/KEY_MANAGEMENT.md`). Ce chantier ne
  modifie pas l'ancre : il n'a ni la clé privée de production ni le droit de
  changer l'ancre de vérification des POS déjà livrés.
- La correction du PATH est **par poste**, pas versionnée : elle n'est pas
  reproductible par `npm install`. Elle est consignée ici pour être rejouée sur
  tout poste de développement clone.

## Alternatives rejected

- **Installer Git for Windows (MSI) dans `C:\Program Files\Git`.** Écarté :
  exige les droits administrateur, modifie le PATH Machine (impact machine
  entière), et n'apporte rien que la distribution portable n'ait pas — le
  poste n'a pas besoin d'un gestionnaire d'installations, il a besoin d'un
  binaire stable.
- **Ré-encoder le bloc corrompu via `latin1`/`cp1252`.** Écarté : le §129
  documente que cette méthode produit des `U+FFFD` sur la plage `0x80`–`0x9F`
  et ne restitue pas le texte d'origine.
- **Laisser le bloc corrompu et le signaler.** Écarté : le bloc devait être
  committé ; committer un texte illisible propage la dette et la rend
  difficile à distinguer d'une corruption légitime.
- **Ajouter `handoff.md` à `verify:encoding` sans le réparer.** Écarté : la
  porte doit être verte au moment où elle est activée, sinon elle est
  ignorée.
