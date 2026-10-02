# ADR-034 — Licence tout-ouverts + base inscriptible (exploitation locale)

Date : 2026-09-28

## 1. Licence : `pages` explicites obligatoires (fail-closed)

Symptôme : licence ACTIVE (badge vert) mais tous les modules « Fonction non
disponible ». Cause : `issue-local-license.cjs` n'embarquait pas `pages` ;
`licensedPages()` (`electron/licensing/protocol.ts`, cutoff `LEGACY_PAGES_CUTOFF_ISO`
= 2026-09-01) refuse toute page aux licences neuves sans capabilities — fail
closed volontaire, jamais d'octroi silencieux.

Correctif : `scripts/licensing/issue-local-license.cjs` embarque désormais
`--pages=all` par défaut (17 pages à `true` depuis `LICENSE_PAGES` du dist) ou
liste restreinte `--pages=sales,products,…` validée contre le catalogue.
Réémission `VLIC-A5B9CE6D` (professional, 12 mois, 14 features, 17 pages) +
réimport → tous les modules accessibles.

## 2. Base ProgramData illisible en écriture (utilisateur standard)

Symptôme : `carts.save` → `SQLITE_READONLY` (« attempt to write a readonly
database »), retries utilisateur en boucle. Diagnostic (sonde
`scripts/database/probe-writable.cjs`, écriture testée sous ROLLBACK) :

- Dossier `C:\ProgramData\Veloria PoS\Data` inscriptible (Users : WD,AD,WEA,WA —
  `-wal`/`-shm` créés) mais fichier `Veloria POS DB.sqlite` en `RX` seul
  (créé par un processus élevé, propriétaire `BUILTIN\Administrateurs`).
- Piège : `fs.accessSync(W_OK)` rapporte « inscriptible » sur Windows (ne voit
  que l'attribut, pas les ACL) — seul un vrai `openSync('r+')` fait foi.
- Sans élévation (UAC), impossible de réparer l'ACL du fichier.

Correctif (sans élévation, via protocole applicatif) : nouveau
`scripts/database/relocate-local.cjs` — copie → contrôle readonly miroir de
`verifyDbFileCopy` (integrity + FK + migrations) → bascule `config.json`
(`persistDbPath`) vers le repli prévu `userData/Data`
(`%APPDATA%\Veloria PoS\Data\Veloria POS DB.sqlite`). Sonde d'écriture OK,
démarrage nominal sur le nouveau chemin (schema v30). Original ProgramData
conservé + copie de secours sur le Bureau.

Devoir installateur : le setup NSIS doit accorder `Users:(OI)(CI)M` sur
`%PROGRAMDATA%\Veloria PoS\Data` à la création (sinon tout poste standard
retombe sur ce cas). Piste durable : étendre la sonde `defaultDbPath()` au
fichier (open `r+`), avec message FR guidant vers Paramètres → Déplacer.

## Vérification

- `npx electron ./scripts/database/probe-writable.cjs <nouveau chemin>` → `writeProbe: OK`.
- Démarrage : `database.opened` sur `%APPDATA%\…`, `startup.ready`, zéro `handler.failed`.
