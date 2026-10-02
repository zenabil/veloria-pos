# ADR-038 — Audit strict : IPC 100 %, version SQLite réelle, F2 sans conflit, lint vert

Date : 2026-09-28 (resserre ADR-037, méthode : preuves exécutées, pas lectures).

## Vérifications automatisées (scripts éphémères, supprimés après usage)

- **IPC renderer→main : 0 rupture.** 158 appels client `(a.ns.fn)` tous présents
  dans le preload ; tous les canaux gérés sont déclarés ; les 32 canaux sans
  `handle()` direct vivent dans les services (`printing.*`, `backup.*`,
  `ocr.*`) ou sont des événements main→renderer (`ocr.progress`,
  `window.maximizedChanged`). Au passage : `customers.search`/`sales.history`
  sont gérés en multiligne (faux négatif regex, levé par lecture).
- **Raccourcis : 0 orphelin réel.** Script étiquettes `[Fx]` vs `e.key === "Fx"`
  par fichier : tous couverts (caisse via `useSellShortcuts`). Faux positifs
  expliqués : `CustomItemDialog [F1]` = touche d'ouverture (descriptif honnête),
  `F1/F7` dans `App.tsx` = données du footer contextuel.
- **Français :** balayage 200+ lignes — restes corrigés : `Chercher` →
  `Rechercher` (2 dialogs retours), `Mode` → `Mode de paiement` (aperçu reçu),
  badge éditions licence en FR.
- **SQLite : 3.50.2** (sonde `SELECT sqlite_version()` sous runtime Electron),
  pas 3.45 : le badge mentait.

## Corrections

- **Badge véridique** : `database.health` expose désormais `sqliteVersion`
  (additif, best-effort, jamais bloquant) ; la barre affiche
  `SQLITE {version} · WAL`, repli `SQLITE · WAL`. `SYNCHRONISÉ` supprimé
  (aucune réplication).
- **Conflit F2 résolu** : `App` ne bascule plus le format quand le module actif
  est Retours (qui possède son F2 `Nouveau Retour`) — `activeRef`, documenté.
- **58mm** : moteur = canal thermique CSS-largeur (pas de canal dédié) — l'onglet
  58mm = mise en page + aperçu honnêtes ; impression 58mm native (texte 32 col)
  = suivi (rebuilders `buildReceiptText` concernés).
- **Code mort** : champ `ready` + pastille `En reconstruction` supprimés
  (17 modules) — le garde réel est `moduleAllowed`/licence.
- **Lint** : 5 erreurs corrigées dont 1 critique introduite par un script de
  nettoyage (`</button>` mangé — JSX cassé, rattrapé par eslint avant tout
  build). Leçon : jamais de script sed sans `typecheck`+`lint` derrière.
  2 erreurs préexistantes aussi corrigées (`archivedOnly ?? false`,
  `summary?.returns… ?? 0`).
- Prix pain 0 à la commande = conception (pricing à facturation/transfert),
  pas un bug. Statut zakat `payée` sans canal = mapping d'export conservé
  (sortie toujours véridique `Calculée`).

## Non-faits (inchangés depuis ADR-037)

Multi-caisses, TVA/G50, ESC/POS natif, VFD/balance, SMS/WA, clôture X, sessions
d'inventaire, `PIECE` (code domaine).

## Vérification

- `eslint` ciblé vert, `typecheck` + `typecheck:electron` verts, `vite build` +
  `build:electron` (integrity 130 fichiers), démarrage nominal, `vitest`
  65 fichiers / 409 verts.
