# PHASE 4 — Licences par client : pages, fonctions, plans, badge (2026-09-18)

Suite de PHASE_3. Le socle de licence (ADR-025 : activation tout-ou-rien,
3 fonctions) devient un système d'autorisation par capabilities : 17 pages +
14 fonctions par licence, plans comme presets, suspension/révocation offline,
badge d'état. Aucune fonction métier existante modifiée dans sa logique ;
aucune migration POS (schéma toujours v20).

## Completed

### Protocole & catalogue

- **`electron/licensing/catalog.ts`** (nouveau, zéro dépendance) : 17 pages,
  14 fonctions (+ `multi-printer` legacy), `PLAN_PRESETS`
  (BASIC/STANDARD/PRO/ENTERPRISE/CUSTOM), seuils 30/7 j, `normalizeFeatures`,
  `planPreset` (deep-copy).
- **`protocol.ts`** : payload étendu optionnel (identité client, `plan`,
  `licenseStatus` signé, `deviceBinding`, `maxDevices`, `pages`) ;
  `edition` élargie (compatibilité) ; états `REVOKED`/`SUSPENDED` vérifiés
  avant produit/hardware ; `EXPIRING_SOON_DAYS` 15 → 30 (seuil centralisé) ;
  helpers `licensedPages`/`hasLicensedPage`/`hasLicensedFeature`/
  `isDeviceBinding`. Enveloppes legacy sans `pages` = plein accès.

### LicenseService & IPC (main = décision)

- `getLicenseStatus` expose pages/features/identité ; `EXPIRED` conserve ses
  capabilities (lecture seule des pages autorisées).
- `requireLicensedPage` / `requireLicensedFeature` (double source : état +
  payload signé), `hasPageAccess` / `hasFeatureAccess` (confort).
- `registry.ts` : `PAGE_GATED_CHANNELS` (une page suffit, ex. breadOrders OU
  pain) + `FEATURE_GATED_CHANNELS` + `debt-management` (paiements) + détection
  crédit/partiel dans `sales.create` ; nouveau canal lecture seule
  `license.getPermissions` ; codes `PAGE_NOT_LICENSED` / `FEATURE_NOT_LICENSED`.
- Gardes locales : printing (80mm→`receipt-80mm`, A4→`invoice-a4`,
  rapports→`advanced-reports`, étiquettes→`barcode-scanner`), backup
  (create/export→`automatic-backup`, restore→`restore-backup`, expiré =
  sauvegarde toujours permise), OCR (select+analyze→`ocr`).

### License Manager (outil vendor)

- Signature étendue (client, plan→édition, statut, binding, pages/features) ;
  DB migrée (8 colonnes, best effort) ; validateurs Zod étendus ; canaux
  `licenseCapabilities` (ré-émission) + `licenseStanding`
  (suspendre/réactiver, statut signé) ; renouvellement/transfert conservent
  les capabilities ; UI : identité client, plan→preset modifiable, **PAGE
  ACCESS** / **FEATURE ACCESS**, liaison appareil on/off, appareils max,
  suspendre/réactiver/ré-émettre.

### Renderer POS (confort, jamais sécurité)

- `catalog.ts` miroir FR (parité testée), `useLicense`
  (`hasPageAccess`/`hasFeature`), sidebar filtrée + Route Guard (« Fonction
  non disponible »), `LicenseBadge` (header, texte+couleur, seuils 30/7,
  modal non sensible), `LicenseScreen` enrichi (client, plan, modules).

### Tests & docs

- `tests/unit/license-capabilities.test.ts` : 15 cas (presets, parité,
  REVOKED/SUSPENDED, flottante, mutations⇒signature, legacy, expirée,
  forgée/corrompue, roundtrip).
- `docs/licensing/CAPABILITIES.md` (référence complète + procédure
  ajout page/feature) + `ADR-026` ; 11 docs licensing + README +
  RELEASE_NOTES mis à jour (voir Phase 4 docs).

## Vérification

- `tsc -b` + `tsconfig.electron` + `tsconfig.manager` : verts.
- Suite complète : **42 fichiers / 269 tests verts** (licensing : 46/46,
  dont 15 nouveaux).
- Builds : renderer + `build:electron` (manifeste d'intégrité 111 fichiers
  re-signé) + `build:manager` + `build:manager-client` : verts.
- `license:scan` (261 fichiers, aucun secret) + `verify:migrations`
  (schéma v20 intact) : OK.
- ESLint : aucune erreur ajoutée (restes pré-existants : service projet
  sur `license-manager/`, motifs historiques inchangés).

## Limites assumées

- Révocation/suspension à distance = effet au **réimport** du `.vlic`
  (offline-first, documenté dans REVOCATION.md).
- `invoices`/`pain` sans écran dédié : `invoices` garde l'A4, `bread` =
  breadOrders OU pain.
- Expiré : rapports/dettes consultables (lecture seule), printing/OCR/
  restauration bloqués.
