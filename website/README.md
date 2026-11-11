# Veloria — Site vitrine « Terminal d'Or »

Pages FR : `index`, `pos`, `client`, `pricing`, `contact` + `admin` secret (non lié, hors build).

## Architecture (ADR-180 design · ADR-181 organisation)

```
website/
  build.mjs              ← build statique (zéro dépendance) : partials + données → pages
  src/
    data/site.json       ← métadonnées, navigation, textes du CTA (source unique)
    partials/            ← COMPOSANTS HTML partagés (une définition par composant)
      head.html  skip.html  header.html  footer.html  cta-receipt.html
    pages/               ← le contenu PROPRE de chaque page (aucun dupliquer)
      index.html  pos.html  client.html  pricing.html  contact.html  admin.html
  styles/                ← CSS en couches (une couche = un fichier)
    tokens.css  base.css  layout.css  responsive.css  preferences.css
    components/          ← un fichier par composant (header, hero, app-frame, ledger…)
  index.html …           ← SORTIE GÉNÉRÉE (ne pas éditer à la main)
  styles/main.css        ← SORTIE GÉNÉRÉE (concaténation des couches)
  app.js                 ← interactions (une seule source)
  assets/                ← captures et vidéos réelles
```

### Règles

1. **Un composant = un fichier** dans `src/partials/`. La tête, la navigation,
   le pied de page et l'appel à l'action « reçu » ne sont plus recopiés dans
   les pages : ils y sont **inclus** (`<!-- @include header -->`).
2. **Les textes et liens** viennent de `src/data/site.json` (une seule source :
   changer le WhatsApp ou les titres se fait à un endroit).
3. **Le CSS est en couches** : `tokens` (variables) → `base` (reset) →
   `layout` (grilles) → `components/*` (un fichier par composant) →
   `responsive` → `preferences`. Le build les concatène en
   `styles/main.css` : **une seule requête HTTP**, aucun `@import` en cascade.
4. **La sortie est générée** : `index.html`, `pos.html`, `client.html`,
   `pricing.html`, `contact.html` et `styles/main.css` sont des artefacts.
   Ne jamais les éditer — éditer la source, puis `npm run site:build`.
5. `admin.html` reste **hors build** (outil local, `noindex`, navigation
   propre) : il est formaté et vérifié comme les autres.

### Commandes

```bash
npm run site:build        # assemble la sortie (à lancer après toute modif. de src/ ou styles/)
npm run site:check        # vérifie que la sortie est à jour (sortie 1 si périmée)
npm run verify:site       # porte complète : fraîcheur + rendu + structure + liens
```

## Design system (ADR-180)

Le site porte **les couleurs et le geste du produit réel** — encre `#051424`,
or `#fbbf24` (couleurs de l'app POS), chiffres monospace, tickets perforés,
cadre d'application.

| Composant                      | Rôle                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `.app-frame`                   | fenêtre « application » qui présente les captures réelles      |
| `.tabs`                        | `tablist` accessible (flèches ←/→) qui fait défiler les écrans |
| `.chapters` + `.chapter-frame` | scrollytelling : cadre collant, image qui suit le chapitre     |
| `.ledger-paper`                | le grand livre Z : la formule réelle de clôture, sur papier    |
| `.receipt-cta`                 | appel à l'action en forme de reçu perforé                      |
| `.rotator`                     | mot tournant de l'héros (crossfade)                            |
| `.stats`                       | bandeau de chiffres monospace, compteurs animés                |

Règles de rendu :

- **zéro police web** (pile système) ⇒ 0 octet, 0 requête, 0 décalage (CLS) ;
- images avec `width`/`height` obligatoires, `fetchpriority="high"` sur l'image
  LCP, `loading="lazy"` sous la ligne de flottaison ;
- la révélation au défilement ne s'active **qu'avec JS** (classe `js`) : sans
  JS, tout le contenu reste visible ;
- `prefers-reduced-motion` neutralise toute animation ; `prefers-contrast`
  renforce les contrastes ; focus visible ≥ 3:1 (WCAG 2.2) ;
- lien d'évitement, un seul `h1`, `lang="fr"` sur chaque page.

## Captures réelles (2026-11-09)

- POS (Electron réel, 5 écrans) : `assets/real-pos-*.png` — tableau de bord, caisse, stock, rapports, paramètres.
- Client (Expo web réel) : `assets/real-client.png` — écran de connexion (FR/عربي, Veloria).
- Vidéos : `assets/pos-demo.webm`, `assets/client-demo.webm` (Playwright/Chromium).

Note honnête : l'app Client sans serveur de synchro affiche l'écran « non configuré ».
Les écrans factures exigent le miroir (Supabase) configuré — voir `real-cloud-loop`.

## Lancement

```bash
npx serve website        # puis ouvrir index.html
```

## Porte de qualité

```bash
npm run verify:site      # fraîcheur du build + console + débordement + structure + CLS + liens
```

Rend des captures dans `docs/shots/site/` (gitignoré : artefact régénérable).
Sans navigateur Playwright installé, la porte **saute** au lieu d'échouer.

## Admin secret (`admin.html`)

- Accès par code (`app.js` : `ADMIN_CODE`, défaut `veloria-admin` — à changer).
- Voit les messages reçus (localStorage `veloria:inbox`) et gère les liens de téléchargement (`veloria:links`, appliqués via `data-download`).
- Sans backend réel, l'inbox est locale au navigateur : pour un multi-poste, brancher un backend (ex. Supabase).

## Avant publication

- Prix « à définir / sur devis » dans `src/pages/pricing.html` → vos tarifs réels.
- Code admin dans `app.js` → code fort.
