# ADR-077 — Résurrection E2E + préparation production (2026-10-09/10)

## Contexte

Audit production (78/100) : 11 échecs E2E + packaging bloqué. Diagnostic
fichier par fichier (snapshots d'erreur Playwright + lecture du code
courant, jamais de devinette) : 10 dérives sélecteurs/UI préexistantes
(sessions antérieures, pas la découpe IPC), 1 bug UX réel, 1 contournement
de test périmé, 4 skips d'environnement. Zéro régression des découpes
ADR-075/076 (0 référence e2e aux API retirées, vérifié par grep).

## Décisions (correctifs)

1. **Squelette partagé** (`tests/e2e/helpers.ts:gotoModule`) : `.first()`
   documenté — « Clients » est sous-chaîne de « Retours — Clients et
   fournisseurs » (ordre DOM stable : groupe Tiers).
2. **Sélecteurs périmés alignés sur l'UI réelle** : placeholder Historique
   (`restart`), `title="Nouveau retour [F2]"` (`credit-return`),
   aria-label « Ouvrir la facture … » (`customer-invoice`),
   `title="Détails de la fiche"` (`full-loop-client`),
   labels miroir « Miroir Android » / « Adresse du serveur (URL) »
   (`full-loop-client`, y compris la section 7 jamais exécutée avant).
3. **Vrai bug UX corrigé** (`HistoryScreen.tsx`) : à 720p le contenu fixe
   mangeait tout l'espace et la zone table s'écrasait (~9 px, lignes
   invisibles/incliquables aussi à la main) → `min-h-[320px]` (scroll de
   page) + `scroll-pt-14` (thead sticky) + `scroll-mt-16` lignes.
4. **Bypass EXPIRED périmé** (`test-only-allow-expired.cjs`) : écrivait un
   état v1 artisanal, rejeté en CORRUPTED_STATE depuis la sécurisation H-3
   → construit désormais via `buildSecureStateV2` (tag d'intégrité valide).
5. **Skips conditionnels d'environnement** (`window-chrome.spec.ts`) :
   démarrage maximisé par l'OS sur écran < 1600×900 → skip explicite
   (même philosophie que les skips drag/resize existants).
6. **Ordre full-loop** : config miroir (URL + anon) AVANT l'activation —
   le QR V2 embarque URL+anon par conception (ADR-068), impossible sinon.
7. **Règle build** : tout `npm run build` renderer invalide le manifest
   d'intégrité → toujours suivre de `build:electron` (re-signature) avant
   tout e2e avec licence, sinon verdict `tampered` systématique.

## Décisions (volontairement non corrigé)

- **Clic ligne Historique sous thead sticky** : après correctif (3), le
  clic passe par le bouton « Voir … » de la colonne Actions (chemin
  utilisateur réel) ; le clic direct ligne reste sensible à la géométrie
  — pas de `force: true` permanent (masquerait une vraie régression).
- **Clic « Restaurer » perdu** (`stock-backup`) : clic Playwright résolu
  sans effet sur liste à rafraîchissement live (confirmé par probe :
  clic JS = modale OK, flux applicatif sain) → rejeu borné `toPass`
  documenté dans le spec, pas de changement applicatif.
- **`package:win`** : bloqué MACHINE (privilège symlink pour le cache
  winCodeSign), pas code — à rejouer sur poste vendor/admin ou Developer
  Mode, puis `installer.spec`.

## Conséquences

- E2E : 21 passés / 6 skips (4 taille écran + 2 drag/resize OS) / 0 échec.
- Relais miroir (`scripts/e2e-mirror-relay.mjs :8100`) : prérequis
  documenté du spec (échec explicite sinon).
- Index docs mis à jour (ADR-077).
