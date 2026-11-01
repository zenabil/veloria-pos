# ADR-167 — Purge ciblée post-audit : copies mortes (V2, coûts), `formatDelta`, clés i18n et icônes maîtresses

## Contexte

Demande opérateur : « قم بفحص المشروع من الأكواد الميتة » (audit du code mort),
puis approbation explicite de la seule **défense A + déplacement des icônes**
(les 11 classes CSS mortes restent hors périmètre).

L'audit du 2026-11-01 ne repart pas de zéro : `knip` 6.43 est **vert**
(0 fichier, export, type ou dépendance), ADR-153 a déjà purgé les gros
gisements, et W6 a trié la surface publique des documents d'impression.
Méthode : fermeture transitive depuis les **11 points d'entrée d'exécution**
(`index.html`, `electron/main`, `electron/preload`, License Manager main/preload
et renderer, `mobile/src/App.tsx`, `owner/src/App.tsx`, fonction Edge
`client-sync`), puis **index d'imports** (pas une simple correspondance de
noms : les collisions d'identifiants et les barrels `export *` sont résolus)
sur 392 fichiers de production et ≈ 1 890 exports, enfin carte IPC à trois
niveaux (186 canaux, 192 wrappers) et greps de niveau chaîne (i18n, assets,
scripts, dépendances, gates licence/staff).

Résultat brut : **0 fichier sans importateur**, **0 export sans aucun
référent**, **0 canal IPC mort**, **0 dépendance npm inutilisée**, **0 script
sans référence**. Le gisement réel est plus étroit que lors d'ADR-153.

## Décision

### 1. Charge d'activation V2 : la copie applicative est supprimée

`src/application/customers/client-access.ts` exportait
`buildActivationQrPayloadV2` + `ACTIVATION_QR_PREFIX_V2`, **sans aucun
importateur de production**. La version réellement exécutée est le miroir main
`electron/ipc/handlers/client-access.repo.ts:143`, appelé par
`registry.customers.ts:175`. Le test `client-access.test.ts` testait donc la
**copie morte**, pas la fonction exécutée (même signature que le constat
ADR-153 sur `buildClientSnapshot`).

Décision : suppression de la copie applicative et de ses imports de
validation ; le test cible désormais `ClientAccess.buildActivationQrPayloadV2`
(version main) et conserve les cas URL piégée / anon courte / `service_role` /
téléphone `|`. La règle exécutée est désormais couverte.

### 2. `allocateUnitCosts` : deux wrappers sans appelant retirés

`allocateUnitCosts` existait en double (`src/domain/packaging/packaging-rules.ts`
et `electron/ipc/handlers/cost-allocation.ts`) et n'était consommé que par des
tests. La fonction **exécutée** est `allocateUnitCostLayers` (importée par
`inventory.repo.ts`) ; le test de parité comparait deux copies mortes.

Décision : suppression des deux wrappers ; la parité porte sur
`allocateUnitCostLayers` (domaine ↔ main), qui reste verrouillée par
`tests/unit/packaging-allocation-parity.test.ts`. Les cas d'invalidité du
domaine sont rejoués sur la fonction restante.

### 3. `formatDelta` retiré de l'app propriétaire

`owner/src/format.ts` exportait `formatDelta` sans appelant (les écrans
utilisent `formatPercent` + flèche). Suppression avec ses deux assertions ;
`formatPercent` reste couvert.

### 4. Trois clés i18n mortes retirées de l'APK client

`invoiceNo`, `status`, `invoiceLabel` n'étaient référencées nulle part
(124 clés → 121, ar/fr toujours symétriques). Le test de fondation `allKeys`
reste vert.

### 5. Icônes maîtresses sorties de `public/`

`icon-1024x1024.png` (834 Ko) et `icon-512x512.png` (253 Ko) n'ont **aucune
référence d'exécution** : seules `icon-192x192.png` (favicon / WindowChrome /
sidebar) et `icon.ico` + BMP d'installeur + `manager-icon.ico` sont utilisés.
Ils étaient pourtant copiés **deux fois** dans l'installeur : par Vite
(`dist/icons`, `publicDir` par défaut) et par `extraResources`
(`public/icons` → `icons`).

Décision : déplacement (pas suppression) vers `resources/icons-src/`, non
empaqueté. Les maîtres restent versionnés pour régénérer les tailles
livrées ; l'installeur économise ≈ 2,2 Mo. Les installeurs déjà présents dans
`release/` ne sont pas reconstruits par cette tranche.

### 6. `knip` : les trois ignores sont vivants (réfutation par la porte)

L'audit initial les classait morts (`net` introuvable, `expo-updates` absent
des deux `package.json`). La porte `npm run knip` a contredit ce constat :
`expo-updates` est requis par le bloc `updates` de `mobile/app.json` et
`owner/app.json` (dépendance non listée), et `net` est utilisé par
`tests/e2e/helpers.ts` (contrôle d'élévation). **Aucune modification** de
`config/knip.json` n'est retenue : les trois ignores restent en place.

## Conservés — décisions antérieures non rouvertes

- **3 modules de domaine non exécutés au runtime** (215 lignes) :
  `closings/closing-rules.ts`, `inventory/intake-rules.ts`,
  `proforma/proforma-rules.ts` ne sont importés que par
  `scripts/quality/verify-domain.ts` et les tests. Ce sont les **références de
  vérification** de la formule exécutée côté main, explicitement conservées
  par ADR-153 (voir son constat sur `computeClosingBalance`).
- **35 exports test-only** restants : `PIN_KDF_*` (parité KDF),
  `signDetached` / `planPreset` / `hasFeatureAccess` / `hasPageAccess`
  (primitives vendeur, ADR-153), `RAW_GUARDED_CHANNELS`,
  `memorySecretBackend`, politiques `client-access` (`isQrExpired`,
  `isSessionExpired`, `isLocked`, `nextFailedState`), `convertQuantity`,
  `formatCustomerCode` / `formatProductRef` (W6), `allocateGlobalDiscount` et
  `computeReturnStatus` (parité), constantes `LICENSE_*` (parité renderer),
  `allKeys` (fondation mobile), `fromDzd` + fonctions de `verify-domain`.
- `pain` / `breadOrders` (ADR-109, compatibilité des licences émises),
  `multi-printer` (legacy documenté `docs/licensing/CAPABILITIES.md`).
- Objets SQLite morts (ADR-153 lot D) : 1 table, 12 colonnes, 2 vues,
  8 index — **aucune migration destructive** n'est rouverte.
- 11 classes CSS mortes (~90 lignes) : constatées, **non supprimées** dans
  cette tranche (décision design séparée).

## Impact

- **9 fichiers** de code/tests modifiés : +32 / −90 lignes ; 2 icônes
  déplacées (1,09 Mo) ; `config/knip.json` **inchangé** (voir §6).
- **Aucun changement de comportement** : pas de canal, pas de calcul métier,
  pas de texte affiché modifié ; seule la couverture de la fonction V2
  exécutée change (le test regarde enfin la bonne copie).
- Installeur : ≈ 2,2 Mo de moins (deux copies évitées).
- Les installateurs et APK existants dans `release/` restent inchangés.

## Portes qualité

- `npm run check` : format + lint + typechecks (root, electron, manager,
  mobile, owner) — **vert**.
- `npm test` : **173 fichiers / 1 194 tests**, 0 échec.
- `npm run test:coverage` : **93,81 %** statements, **89,11 %** branches,
  **98,48 %** functions, **96,30 %** lines.
- `npm run test:coverage:features` : **164 fichiers / 1 132 tests**,
  **74,62 %** functions (plancher 65 %).
- `npm run build` : **vert** ; `dist/icons` ne contient plus que les 5
  fichiers utilisés (452 Ko au lieu de 1,6 Mo).
- `npm run build:electron` : **vert**, manifeste d'intégrité re-signé
  (**235 fichiers**).
- `npm run knip` : **vert** après rétablissement des ignores (§6).
- `npm run verify` : migrations, domaine, FR, encodage, perf, version,
  secret-scan — **vert**.

## Fichiers touchés

- `src/application/customers/client-access.ts`
- `tests/unit/client-access.test.ts`
- `src/domain/packaging/packaging-rules.ts`
- `electron/ipc/handlers/cost-allocation.ts`
- `tests/unit/packaging-allocation-parity.test.ts`
- `tests/unit/packaging-rules.test.ts`
- `owner/src/format.ts`
- `tests/unit/owner-foundation.test.ts`
- `mobile/src/i18n.ts`
- `public/icons/icon-1024x1024.png` → `resources/icons-src/`
- `public/icons/icon-512x512.png` → `resources/icons-src/`
- `docs/ADR-167-purge-ciblee-post-audit.md` + `handoff.md` (documentation)
