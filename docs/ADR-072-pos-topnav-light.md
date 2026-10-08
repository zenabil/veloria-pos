# ADR-072 — Navigation haute + horloge + mode clair (POS)

Date : 2026-10-07. Statut : accepté (demande caisse).

## Contexte

Caisse : barre latérale 240 px, pas d'horloge visible, sombre uniquement
(ADR-033). Demande : navigation en haut avec retour visuel, horloge
numérique professionnelle, mode clair doré, zéro réapprentissage.

## Décision

1. `Sidebar` devient un en-tête horizontal (mêmes `SidebarProps`, mêmes
   `data-path`, `kbd`, badges vigilance, filtre, `F1`/`F2` intacts).
   Audace unique : indicateur or coulissant sous le module actif
   (transition 150 ms, coupée par `prefers-reduced-motion`).
2. `TopBar` : horloge locale `fr-DZ` (HH:MM:SS + date courte, intervalle
   1 s nettoyé, aucune donnée métier, aucune dépendance).
3. Mode clair : surcharges CSS `[data-theme="light"]` seules dans
   `globals.css` (sombre identique par défaut). Préférence `localStorage`
   `veloria.theme`, jamais SQLite. Or `#FBBF24` conservé, textes
   redéfinis pour contraste AAA (`#14202E` sur `#FAF8F2`).
4. Caisse (`SellScreen`, raccourcis, centimes/DZD, `window.veloria`) :
   inchangée. Aucun canal IPC / schéma Zod modifié.

## Coupé pour sobriété

Bandeau « Poste vendeur » doublon envisagé puis conservé ; en revanche
aucune nouvelle police ni librairie (Inter + JetBrains Mono gardées),
aucun KPI supplémentaire dans l'en-tête.

## Vérification

`typecheck` vert, `vitest` scope caisse vert,
`grep -rE "ipcRenderer|better-sqlite3|node:" src/` vide, captures
bureau + 390 px avant/après.
