# Licensing — SECURITY_TEST_REPORT

Exécuté : `npx vitest run tests/unit/license-*.test.ts` (clés éphémères).

## Red-Team (tests/unit/license-redteam.test.ts — 11 cas)

| Attaque simulée                | Résultat attendu                   | Obtenu |
| ------------------------------ | ---------------------------------- | ------ |
| Expiration prolongée à la main | INVALID_SIGNATURE                  | ✓      |
| Hardware ID substitué          | INVALID_SIGNATURE                  | ✓      |
| Édition / features gonflés     | INVALID_SIGNATURE                  | ✓      |
| Autre produit                  | INVALID_PRODUCT                    | ✓      |
| Copie vers autre poste         | INVALID_HARDWARE (origine intacte) | ✓      |
| État local édité (forme)       | INVALID_SIGNATURE                  | ✓      |
| État local brisé (structure)   | CORRUPTED_STATE                    | ✓      |
| Horloge reculée                | CLOCK_ROLLBACK                     | ✓      |
| Manifeste altéré               | signature détachée invalide        | ✓      |
| Import corrompu                | refus FR, rien persisté            | ✓      |
| .vlic tronqué                  | échec décodage/signature           | ✓      |

## Protocole / service / manager (17 cas)

Roundtrip sign/verify, mutations champ-par-champ, autre clé, lifetime,
EXPIRING_SOON, state machine (UNACTIVATED→ACTIVE→EXPIRED→read-only),
rollback sans destruction, **aucun contournement** (sans état ⇒ shell bloqué

- mutations refusées), durées `addMonths`, validateurs Manager, preuve
  croisée émission→vérification POS.

## Capabilities (tests/unit/license-capabilities.test.ts — 15 cas)

Presets (BASIC restreint / ENTERPRISE tout / PRO copiable), parité
main↔renderer, `REVOKED`/`SUSPENDED` signés (import refusé FR), licence
flottante (`deviceBinding: false` acceptée sur autre poste), toute mutation
pages/features/plan/client ⇒ `INVALID_SIGNATURE`, compatibilité ascendante
(enveloppe legacy sans pages = plein accès), expirée = pages en lecture
seule + features bloquées, `.vlic` corrompu/forgé refusé, roundtrip
capabilities. Total licensing : **46 tests verts** (6 fichiers).

## E2E (`tests/e2e/license-activation.spec.ts`, clé vendor requise) — 4/4 verts

Fenêtre d'activation bloquante sans licence (pas de coquille) ; import
externe + redémarrage ⇒ bascule coquille ; expirée ⇒ lecture seule +
bannière ; activée ⇒ module Licence « Active ». Specs existantes migrées
sur `launchActivatedApp` (licence d'essai réelle importée avant boot) :
restart, sale-flow (5), credit-return, stock-backup, window-chrome verts
(2 sélecteurs « Réduire » désambiguïsés vers la barre de titre).
Non rejoué ici : `installer.spec` (exige `release/*.Setup.exe`).

## Enseignements d'exécution (échecs instructifs corrigés)

- **Concurrence DPAPI** : deux Chromium sur le même userData brisent la
  continuité du trousseau (état chiffré illisible ⇒ CORRUPTED_STATE sain).
  Règle test : boot (profil créé par l'app) → fermeture → import externe →
  reboot. En production, l'import passe par le dialogue natif (même
  processus) : non concerné.
- **Chemins packagés** : `resources/` se résout sous `resourcesPath` en
  packagé, sous la racine en dev (invariant couvert par l'instrumentation
  `integrity.mismatch`, utile au diagnostic sans fuir de secret).
- **`app.quit()` vs code de sortie** : les scripts opérateur utilisent
  `app.exit(code)` (quit sort toujours 0).
- **ESM suspend `app.whenReady()`** sur ce runtime : scripts opérateur en
  CommonJS (documenté dans ACTIVATION.md).

## Régression

Suite complète existante conservée verte (voir rapport final) : aucune
mutation métier modifiée dans sa logique — seule une garde pré-transaction
s'ajoute (inactive en dev, transparente en tests).
