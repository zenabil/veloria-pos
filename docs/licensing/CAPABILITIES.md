# Veloria POS — License Capabilities (pages, features, plans, badge)

> Couche d'autorisation réelle (§2) : `UI → Authorization applicative →
règles domaine → main → vérification`. Le renderer n'accorde jamais de
> permission : chaque IPC sensible est revérifié dans le main sur le payload
> **signé** (Ed25519). Modifier le React State, le localStorage ou appeler un
> canal IPC directement ne donne accès à rien sans capability signée.

## 1. Chaîne de confiance

```text
LICENSE MANAGER (clé PRIVÉE, jamais distribuée)
  │ Client · Plan · Expiration · DeviceBinding · Pages · Features
  │ signature Ed25519 du JSON canonique
  ▼
FICHIER .vlic  (base64url(canonicalJSON({payload, signature})))
  ▼
VELORIA POS (clé PUBLIQUE resources/license/public.key)
  │ LicenseService : signature → statut signé → produit → hardware → dates
  │ → horloge anti-rollback → intégrité binaire
  ▼
Pages · Features → Route Guard + Feature Guards (main + UI)
  └── Badge licence (header) + modal d'information
```

## 2. Payload signé (`electron/licensing/protocol.ts`)

Champs historiques conservés (compatibilité ascendante) + extensions :

| Champ                                     | Rôle                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `schemaVersion`, `licenseId`, `productId` | Protocole (inchangés)                                                                       |
| `edition`                                 | legacy (`basic/standard/professional/pro/enterprise/custom`)                                |
| `plan`                                    | `BASIC/STANDARD/PRO/ENTERPRISE/CUSTOM` (preset d'émission, informatif)                      |
| `licenseType`                             | `term` (+`expiresAt`) ou `lifetime`                                                         |
| `licenseStatus`                           | `active` (défaut) / `suspended` / `revoked` — révocation **offline**                        |
| `clientId`, `clientName`, `storeName`     | Identité client affichée (badge/modal)                                                      |
| `deviceBinding`                           | `false` = licence flottante (hardware ignoré) ; défaut `true`                               |
| `maxDevices`                              | Informatif — **non appliqué** (ni à l'émission, ni au POS) : mention contractuelle, ADR-172 |
| `pages`                                   | `Record<page, boolean>` — partiel = refus ; **absent = tout autorisé (legacy)**             |
| `features`                                | Liste signée (anciennes licences à 3 ids toujours valides)                                  |

Toute mutation d'un champ signé invalide la signature (`INVALID_SIGNATURE`).

## 3. États (`LicenseState`)

`UNACTIVATED (=PENDING)` · `ACTIVE` · `EXPIRING_SOON` · `EXPIRED` ·
`REVOKED` · `SUSPENDED` · `INVALID_SIGNATURE (=INVALID)` ·
`INVALID_HARDWARE (=DEVICE NOT AUTHORIZED)` · `INVALID_PRODUCT` ·
`TAMPER_DETECTED` · `CLOCK_ROLLBACK` · `CORRUPTED_STATE`.

Bloquants (fenêtre d'activation) : tous sauf `ACTIVE`, `EXPIRING_SOON`,
`EXPIRED` (coquille lecture seule).

## 4. Pages & features (`electron/licensing/catalog.ts`)

17 pages : dashboard, sales, products, stock, customers, suppliers, debts,
expenses, returns, history, reports, pain, breadOrders, proformas, invoices,
zakat, settings. 14 features : receipt-80mm, invoice-a4, automatic-backup,
restore-backup, barcode-scanner, ocr, excel-export, pdf-export,
debt-management, partial-payments, returns, proformas, advanced-reports,
multi-printer (legacy).

Le plan n'est qu'un **preset** (`PLAN_PRESETS`) copié puis ajusté avant
signature — les gardes n'utilisent que les capabilities, jamais le nom du plan.

## 5. Vérification (`LicenseService`, main uniquement)

- `getLicenseStatus()` : horloge anti-rollback (`lastSeenUtc`) → chaîne
  (`verifyLicenseChain`) → intégrité binaire → capabilities.
- `requireLicensedPage(page)` / `requireLicensedFeature(feature)` :
  état + payload signé (double source).
- `requireLicensedMutation(feature?)` : inchangé, + messages
  révoquée/suspendue.
- `hasPageAccess()` / `hasFeatureAccess()` : lecture confort (jamais une décision).
- Poste **expiré** : pages autorisées en lecture seule ; features et
  mutations bloquées ; **sauvegarde toujours permise** (sécurité des données).

## 6. Enforcement IPC (main)

- `electron/ipc/registry.ts` : `handle()` applique `LICENSE_PROTECTED_*`
  (état) puis `PAGE_GATED_CHANNELS` (une page suffit, ex. breadOrders OU pain)
  puis `FEATURE_GATED_CHANNELS` + `debt-management` (paiements) +
  `sales.create` (crédit → debt-management, partiel → partial-payments).
- Modules directs : `printing` (ticket→receipt-80mm, A4→invoice-a4,
  rapports→advanced-reports, étiquettes→barcode-scanner),
  `backup` (create/export→automatic-backup, restore→restore-backup),
  `ocr` (select+analyze→ocr).
- Nouveau canal lecture seule `license.getPermissions` (pages+features).
  **Aucun** canal d'écriture de permissions n'existe côté POS (§23).

## 7. UI POS (confort, pas sécurité)

- `useLicense()` : `hasPageAccess(page)` / `hasFeature(feature)`.
- `App.tsx` : sidebar filtrée + `Route Guard` (« Fonction non disponible »).
  Accès direct à une route refusée = même écran, jamais la page.
- `LicenseBadge` (header) : `LICENCE ACTIVE` 🟢 · `EXPIRATION BIENTÔT` /
  `EXPIRATION DANS X J` 🟠 (seuils 30/7 j, `catalog.ts`, jamais hardcodés) ·
  `EXPIRÉE/RÉVOQUÉE/SUSPENDUE/INVALIDE` 🔴 · `ACTIVATION REQUISE` ⚪.
  Clic → modal (statut, type, licence, client, expiration, appareil — aucun secret).

## 8. Offline & horloge

100 % offline : signature + dates vérifiées localement. Anti-rollback :
`lastSeenUtc` persisté chiffré (DPAPI) ; recul > 5 min → `CLOCK_ROLLBACK`
sans détruire l'état. Pas d'horodatage réseau requis par vente.

## 9. Device binding

Empreinte SHA-256 (MachineGuid + SystemUUID + CPU + disque, ≥ 2 sources).
`deviceBinding=false` → contrôle sauté (flottante). Mismatch →
`INVALID_HARDWARE` (« autre ordinateur »).

`maxDevices` n'est **pas** une garde : aucune machine ne compte un parc (un POS
hors ligne ne voit pas les autres postes). C'est une mention contractuelle — voir
ADR-172. Un client de N postes reçoit N licences liées à N empreintes, pas une
licence flottante à `maxDevices = N`.

## 10. License Manager (outil vendor séparé)

Formulaire : identité client → plan (charge le preset, modifiable) → durée →
appareils (binding on/off, max) → **PAGE ACCESS** → **FEATURE ACCESS** →
`GÉNÉRER LA LICENCE` (signature clé privée, jamais dans le POS).
Cycle de vie : renouveler (nouvelles dates), transférer (nouvelle empreinte,
ancien poste invalidé), suspendre/réactiver (statut signé, effet au réimport),
révoquer (export/renouvellement refusés), ré-émettre (pages/features modifiées),
exporter `.vlic`.

## 11. Ajouter une page / feature (sans redesign)

1. `electron/licensing/catalog.ts` : ajouter l'id (+ preset par défaut).
2. `src/features/license/catalog.ts` : miroir + libellé FR (test de parité).
3. `protocol.ts` : rien (pages génériques, features normalisées).
4. `registry.ts` (+ module direct si IPC dédié) : entrée de gating.
5. `App.tsx` (`MODULE_PAGES`) si route UI.
6. Manager `App.tsx` : cases cochées (listes locales).
7. Tests + cette doc.

## 12. Fichiers créés / modifiés

Créés : `electron/licensing/catalog.ts`,
`src/features/license/catalog.ts`, `src/features/license/LicenseBadge.tsx`,
`tests/unit/license-capabilities.test.ts`, `docs/licensing/CAPABILITIES.md`.
Modifiés : `protocol.ts` (payload, REVOKED/SUSPENDED, seuils 30/7),
`license-service.ts` (capabilities, gardes), `registry.ts` + `channels.ts`
(gating, `license.getPermissions`), `printing.service.ts`, `backup.service.ts`,
`ocr.service.ts` (gardes), `preload.ts` + `vite-env.d.ts` + `ipc-client.ts`
(bridge), `signing.ts` + `manager-db.ts` + `licenses.ts` + `validators.ts` +
`registry.ts` + `channels.ts` + `preload.ts` + `ipc-client.ts` + `manager-env.d.ts` +
`App.tsx` (Manager), `types.ts` + `use-license.ts` + `LicenseScreen.tsx` +
`App.tsx` (POS), `tsconfig.manager.json`.
