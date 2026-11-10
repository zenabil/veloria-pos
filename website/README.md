# Veloria — Site vitrine « Terminal d'Or »

Pages FR : `index`, `pos`, `client`, `pricing`, `contact` + `admin` secret (non lié).

## Design system (ADR-180)

Le site ne réutilise pas une palette SaaS générique : il porte **les couleurs
et le geste du produit réel** — encre `#051424`, or `#fbbf24`, chiffres
monospace, tickets perforés, cadre d'application.

| Élément                        | Rôle                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `.app-frame`                   | fenêtre « application » qui présente les captures réelles      |
| `.tabs`                        | `tablist` accessible (flèches ←/→) qui fait défiler les écrans |
| `.chapters` + `.chapter-frame` | scrollytelling : cadre collant, image qui suit le chapitre     |
| `.ledger-paper`                | le grand livre Z : la formule réelle de clôture, sur papier    |
| `.receipt-cta`                 | appel à l'action en forme de reçu perforé                      |
| `.rotator`                     | mot tournant de l'héros (crossfade)                            |
| `.stats`                       | bandeau de chiffres monospace, compteurs animés                |

Règles :

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
npm run verify:site      # console, débordement, structure, CLS, liens morts
```

Rend des captures dans `docs/shots/site/` (gitignoré : artefact régénérable).
Sans navigateur Playwright installé, la porte **saute** au lieu d'échouer.

## Admin secret (`admin.html`)

- Accès par code (`app.js` : `ADMIN_CODE`, défaut `veloria-admin` — à changer).
- Voit les messages reçus (localStorage `veloria:inbox`) et gère les liens de téléchargement (`veloria:links`, appliqués via `data-download`).
- Sans backend réel, l'inbox est locale au navigateur : pour un multi-poste, brancher un backend (ex. Supabase).

## Avant publication

- Prix « à définir / sur devis » dans `pricing.html` → vos tarifs réels.
- Code admin dans `app.js` → code fort.
