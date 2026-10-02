# ADR-054 — QR d'activation scannable par l'APK (splash_login Stitch)

Date : 2026-09-30
Statut : accepté (V1, lecture seule)

## Contexte

Le design Stitch `splash_login` prévoit « مسح QR من المحل ». Côté POS, le QR
d'activation existait en texte seul (`ClientDialogs` : `QR : {code}`) —
aucune image scannable, aucun contrat de lecture côté APK (`client-sync`
n'accepte que téléphone + PIN).

## Décision

- Format versionné unique : `VELORIA1|<phone>|<pin>|<code>` (`|` interdit
  dans le téléphone, bornes = domaine : PIN 6 chiffres, code 16..128 URL-safe).
- Le PIN reste le seul secret de connexion (même appel `client-sync`, même
  niveau que la dictée manuelle) ; le code ne sert qu'au traçage futur.
- POS : use-case pur `buildActivationQrPayload` + miroir main
  (`client-access.repo`, le main ne peut pas importer `src/`) + canal explicite
  lecture seule `customers.accessQrSvg` (Zod `clientAccessQrSchema`, SVG N&B
  via lib `qrcode` existante, `""` = repli texte). Carte d'activation affiche
  l'image QR (`img-src data:` déjà autorisé par la CSP).
- APK : `expo-camera` (permission manifeste) + `mobile/src/qr.ts`
  (`parseActivationQr`, miroir du format) + écran scan (caméra montée
  uniquement pendant le scan, anti double-scan, erreurs mappées ar/fr) ;
  le scan pré-remplit puis connecte via `client-sync` inchangé.
- Aucune migration (lecture seule), aucune écriture financière, FR côté POS,
  ar/fr côté APK (nouvelles clés doublées).

## Conséquences

- Triple miroir à maintenir ensemble : use-case POS, repo main, `qr.ts` APK
  (+ tests des trois). Tout changement de format = les trois + `verify` vert.
- Le QR reste valable 7 jours comme le code (règle domaine inchangée).

## Vérification

- `tests/unit/client-access.test.ts` (payload + schéma), `tests/unit/mobile-qr.test.ts`
  (parseur), `bridge-shape` (canal exposé en preload, schéma consommé).
