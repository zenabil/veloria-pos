# ADR-033 — Adoption littérale du design system Stitch « Industrial Dark POS »

Date : 2026-09-28
Source : `stitch_veloria_pos_desktop_system/` (18 × `code.html` + `veloria_industrial_dark_pos/DESIGN.md` + `veloria_pos_logo/code.html`)

## Décision

Appliquer les tokens Stitch au حرف dans le renderer, sans toucher au métier :

- Palette : fond `#051424`, surfaces `#010f1f` → `#273647`, `on-surface #d4e4fa`,
  `on-surface-variant #d3c5ac`, primaire `#ffe1a7` / `#fbbf24` / texte `#402d00`,
  secondaire `#4edea3`, tertiaire `#cde8ff`, erreur `#ffb4ab`.
- Typographies : Inter (UI) + JetBrains Mono (montants DZD, codes-barres, touches F) ;
  échelle `display-kpi 26/700` … `mono-kbd 10/600` en classes utilitaires globales.
- Chrome : barre fine (licence · `SQLITE 3.45 WAL SYNCHRONISÉ` pulsant émeraude ·
  `Caisse 01` · `Poste 04`), rail 240px `Veloria PoS / Caisse·DZD` + nav `data-path`
  avec pastille `F1`, footer fixe `F1 Caisse … F8 Exporter`, toasts haut-droite,
  modales `backdrop-blur 8px`.
- Composants : `Card #122131`, `Button` primaire `#fbbf24/#402d00`, `Kpi` liseré accent,
  `PageHeader` Stitch (pastille + H1 + badge poste + période + actions), `Kbd`.
- Page manquante ajoutée : `Impression` (concepteur ticket 80mm 48 col ESC/POS +
  facture A4 DGI, zones 01-04, aperçu thermique/A4 `[F7]`, 14 drapeaux persistés en
  préférence locale — jamais SQLite métier).
- Tableau de bord restylé Stitch : `PageHeader` + 8 KPI à accents + export `[F9]`.

## Contraintes respectées (AGENTS.md)

- SQLite seule source métier ; préférences UI en `localStorage` uniquement.
- Renderer sans Electron/Node ; aucun canal `run-sql` générique ajouté.
- Icônes : `lucide-react` conservé (offline-first + CSP `font-src 'self'`) au lieu du
  CDN Material Symbols de Stitch — écart volontaire documenté ici.
- Polices distantes Stitch non embarquées (CSP + hors-ligne) : piles locales
  `Inter, Segoe UI` / `JetBrains Mono, ui-monospace` avec mêmes métriques.
- Monnaie en centimes, FR uniquement, aucune migration touchée.

## Vérification

- `npm run typecheck` vert.
- `npm test` : 65 fichiers / 409 tests verts.
- `npm run build` vert (chunk `PrintTemplatesScreen` présent).
- `npx prettier --write` appliqué aux fichiers touchés.

## Suite

Restyle profond écran par écran (vente dual-pane, tiroirs, thermiques 80mm, Grand-livre,
bordereaux pain, G50/SCF, Zakat, licence x509) en réutilisant `PageHeader/Kpi/Kbd`.
