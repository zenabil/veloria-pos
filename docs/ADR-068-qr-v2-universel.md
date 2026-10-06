# ADR-068 — QR V2 universel : un seul APK pour tous les magasins

Date : 2026-10-04
Statut : accepté (V1 lecture seule)

## Contexte

Chaque magasin possède son projet Supabase (`supabaseUrl + serviceKey` dans
`app_settings`, clé `client_sync`). L'APK avait une seule URL gravée au build
(`mobile/src/config.ts` via `mobile/eas.json` → `EXPO_PUBLIC_*`) : chaque
nouveau magasin exigeait un rebuild — coûteux et source d'erreurs.

## Décision

- Nouveau format versionné `VELORIA2|<supabaseUrl>|<anonKey>|<phone>|<pin>|<code>`
  (6 segments, `|` interdit partout ailleurs).
- Le POS embarque l'endpoint depuis sa config sync (`getShopEndpoint`,
  `electron/sync/sync.service.ts`) : nouvelle zone `anonKey` (publique)
  dans Réglages → Miroir Android. Sans endpoint configuré, `customers.accessQrSvg`
  rend une erreur FR guidant vers les réglages (jamais de QR V1 silencieux).
- L'APK universel parse V1 (repli : endpoint gravé) + V2 (endpoint du QR,
  `mobile/src/qr.ts`) et lie l'endpoint à la session (`SecureStore`,
  `supabaseUrl/anonKey` persistés, `null` = V1). Login/refresh/détail
  utilisent l'endpoint de session, jamais un mélange.
- Sécurité : whitelist stricte `https://*.supabase.co` (+ loopback `http`
  pour démo/tests, même règle que `validateSyncConfig`) ; la clé
  `service_role` est refusée côté POS (domaine + main) et côté APK
  (décodage `role` du JWT sans vérification de signature — garde anti
  copie de la mauvaise clé dans un QR imprimé). L'`anon` est publique
  par conception (RLS).
- QR plus dense (~350 caractères) : plafond SVG `300 → 800`
  (`buildActivationQrSvg`, contrat `accessQrSvgResultSchema`), niveau
  de correction inchangé.

## Conséquences

- Un seul build APK pour tous les magasins ; nouveau magasin = renseigner
  URL + `anon` dans le POS, zéro rebuild.
- Triple miroir maintenu : use-case POS, repo main, parseur APK (+ tests
  des trois). Tout changement de format = les trois + `verify` vert.
- Sessions V1 existantes (sans endpoint) continuent sur l'endpoint gravé.

## Vérification

- `tests/unit/client-access.test.ts` (builder V2 + whitelist + garde anon),
  `tests/unit/mobile-qr.test.ts` (V1 + V2 + rejets phishing/service),
  `tests/unit/sync-protocol.test.ts` (config `anonKey` + masquage).
- `verify-migrations` vert (aucune migration : `anonKey` vit dans le JSON
  `app_settings`, pas de colonne nouvelle).
