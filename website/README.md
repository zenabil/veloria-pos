# Veloria — Site vitrine (dark glass, rebuild 2026-11-09)

Pages FR : `index`, `pos`, `client`, `pricing`, `contact` + `admin` secret (non lié).
Theme : dark glassmorphism (blur, halos indigo/cyan), light marketing abandonné.

## Captures réelles (2026-11-09)

- POS (Electron réel, 5 écrans) : `assets/real-pos-*.png` — tableau de bord, caisse, stock, rapports, paramètres.
- Client (Expo web réel) : `assets/real-client.png` — écran de connexion (FR/عربي, Veloria).
- Vidéos : `assets/pos-demo.webm`, `assets/client-demo.webm` (Playwright/Chromium).

Note honnête : l'app Client sans serveur de synchro affiche l'écran « non configuré ».
Les écrans factures exigent le miroir (Supabase) configuré — voir `real-cloud-loop`.

## Lancement

Servir le dossier : `npx serve website`, puis ouvrir `index.html`.

## Admin secret (`admin.html`)

- Accès par code (`app.js` : `ADMIN_CODE`, défaut `veloria-admin` — à changer).
- Voit les messages reçus (localStorage `veloria:inbox`) et gère les liens de téléchargement (`veloria:links`, appliqués via `data-download`).
- Sans backend réel, l'inbox est locale au navigateur : pour un multi-poste, brancher un backend (ex. Supabase).

## Avant publication

- Prix « à définir / sur devis » dans `pricing.html` → vos tarifs réels.
- Code admin dans `app.js` → code fort.
