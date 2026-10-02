# ADR-039 — Dashboard : presets, delta, vigilance unifiée, PDF/Excel/CSV

Date : 2026-09-28 (demande utilisateur : développer le dashboard, choix :
tout par phases, période = jour courant, exports PDF+Excel+CSV, alertes en
panneau unique sans navigation).

## Ajouts (données 100 % réelles du `dashboardSummary`)

- **Presets UTC** : Aujourd'hui · Hier · 7 derniers jours · Ce mois-ci
  (la période par défaut reste la journée en cours).
- **KPI Ventes nettes** : sous-titre enrichi du delta réel
  `±x % vs précédente` (`comparison.deltaPercent`, donnée existante).
- **Vigilance unifiée** : remplace les `AlertRow` + boutons de navigation par
  un panneau unique tout-inline — stock bas/ruptures (top 8 lignes), pain
  (en cours/prêtes/livrées), échéances dépassées + 7j (top 8), système
  (sauvegarde + intégrité). `onNavigate` supprimé du composant et de `App`.
- **Exports** :
  - CSV [F8] : centimes bruts sommables (inchangé dans l'esprit).
  - Excel : même synthèse en DZD lisibles (`-excel.csv`, BOM `;` — convention
    maison `CSV (Excel)`, pas de `.xlsx` sans dépendance tierce).
  - PDF : `reportPreview` → modale Aperçu A4 → `reportPrint` (8 KPI + courbe
    journalière + 4 tables, bornes schéma respectées : ≤12 KPI, ≤4 charts,
    ≤10 tables, ≤200 lignes, strings ≤120/60/40). Garde licence
    `reports`/`advanced-reports` via `frError` (pas de bouton désactivé
    trompeur : l'erreur remonte en FR si la licence ne couvre pas).

## Honnêteté maintenue

- Pas de `.xlsx` binaire (dépendance absente) : nommé explicitement CSV/Excel.
- Pas de courbe de marge journalière : `daily` ne porte que les ventes
  (nouvel IPC nécessaire — suivi).
- Footer dashboard : F4/F5/F8 (tous câblés), inchangé.

## Vérification

- `typecheck` + `eslint` ciblé verts, `vite build` + `build:electron`
  (integrity 130 fichiers), démarrage nominal, `vitest` 65/409 verts.
