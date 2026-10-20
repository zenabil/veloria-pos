# ADR-123 — Couverture verte, gardes auto-dérivées et tests miroir convertis (vague W4)

## Contexte

Vague **W4** du plan de remédiation de l'audit intégral du 2026-10-19
(`docs/reports/FULL_AUDIT_2026-10-19_PLAN.md`, §« vague W4 »). Objectif :
`npm run test:coverage` **vert** + des gardes **capables d'échouer** + la
porte `test:coverage` **dans le CI** (elle y est depuis W2/G-21 — elle était
donc ROUGE et cassait le CI depuis ce commit).

État mesuré au début de la vague (arbre sale, chantier impression non
commité) : couverture globale 89,3 % des lignes / 82,04 % des branches,
mais **18 dépassements de seuil par fichier** sur 5 fichiers du domaine
(`product-rules`, `return-rules`, `supplier-rules`, `po-rules`,
`csv-import`) + `ocr/parser.ts` + `ocr/types.ts` (fichier de types purs,
0 % par construction) ⇒ `test:coverage` = **EXIT 1**.

## Décision 1 — on ne baisse AUCUN seuil : on couvre le code

Les seuils par fichier (`statements 80 / branches 75 / functions 88 /
lines 80`, `perFile: true`) sont **inchangés**. La correction passe par des
**tests réels** :

| Fichier                              | Avant                              | Après     | Ce qui a été ajouté                                                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/product/product-rules.ts`    | 36,36 % lignes · 14,28 % branches  | ≥ 85 %    | `tests/unit/domain-rules-coverage.test.ts` (33 cas) : `normalizeUnitCode`, nom trop court/long, unité inconnue, péremption impossible, quantités, plafond < seuil, codes-barres (vide / trop long / dupliqué / EAN invalide / EAN valide)                 |
| `domain/returns/return-rules.ts`     | 70,07 % lignes · 71,42 % fonctions | ≥ 80 %    | `computeReturnLineTotal` + `validateReturnLines` (vide, > 500 lignes, quantité non éligible, total hors capacité) — ces deux fonctions **n'étaient jamais appelées** par un test                                                                          |
| `domain/suppliers/supplier-rules.ts` | 74,28 % lignes · 60,97 % branches  | ≥ 75 %    | tous les plafonds de champs (code, contact, téléphone, adresse, NIF, RC, notes), email invalide, `formatSupplierCode(0)`, soldes invalides / dépassement de capacité, paiement > dette                                                                    |
| `domain/suppliers/po-rules.ts`       | 62,5 % branches                    | ≥ 75 %    | commande > 200 lignes, nom de produit manquant, transitions interdites, les 5 libellés FR + le repli `—`                                                                                                                                                  |
| `domain/import/csv-import.ts`        | 55,26 % branches                   | ≥ 75 %    | fichier vide, prix/quantité invalides (avec numéro de ligne), code-barres dupliqué, ligne incomplète, nom trop court, en-tête détecté, produit « Nominal » non avalé, prix/quantité vides ⇒ 0, plafond 5 000 lignes (produits + clients), parsing clients |
| `domain/ocr/parser.ts`               | 71,91 % branches                   | ≥ 75 %    | code-barres en tête de ligne, code-barres seul, unité connue (`KG`, `U`→`PIECE`), remise en `%`, total au libellé inconnu, remise globale                                                                                                                 |
| `domain/ocr/types.ts`                | 0 %                                | **exclu** | fichier de TYPES purs : aucune instruction exécutable ⇒ 0 % par construction (faux positif du seuil par fichier)                                                                                                                                          |

Seul l'exclusion est admise : `coverage.exclude = ["src/domain/**/types.ts",
"src/domain/**/*.types.ts"]` — **les seuils ne bougent pas**.

## Décision 2 — le bug OCR trouvé par la couverture

En écrivant le test du chemin « code-barres en tête de ligne », l'extraction
a échoué. Cause : `src/domain/ocr/parser.ts:86`

```ts
/(?:^|\s)(\d{8}|\d{12,13,14})(?:\s|$)/;
```

`{12,13,14}` n'est **pas** un quantifiant JavaScript valide (3 valeurs) :
le moteur le traite comme un MOTIF LITTÉRAL ⇒ **seuls les codes à 8 chiffres
étaient jamais extraits**, les EAN-13/UPC-A (le cas réel des factures
fournisseur) passaient toujours à côté. Corrigé en `{12,14}` (12, 13 ou 14
chiffres), cohérent avec `extractBarcodeCandidates` (matcher.ts, 8→14).
Le test couvre désormais les deux cas (code extrait / code seul conservé).

## Décision 3 — les gardes deviennent auto-dérivées (G-01, G-03, G-04, G-05, G-06, I-02)

| Garde                                          | Avant                                                                                                                  | Après                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validators-inventory` (`FROZEN_SCHEMA_COUNT`) | 113, `validators.staff.ts` **exclu** ⇒ 7 schémas hors comptage                                                         | **121** — les 12 modules de validation sont comptés (`validators.staff.ts` inclus)                                                                                                                                                                                                                                                                           |
| `bridge-shape` — exports                       | ne portait que sur `*Schema` (8 exports Zod de `validators.common.ts` hors contrôle)                                   | **tous** les exports consts des 12 modules (127) : **0 export mort** + les 8 schémas NESTED documentés un par un (avec raison)                                                                                                                                                                                                                               |
| `bridge-shape` — seuil                         | `toBeGreaterThan(10)` (tautologique : le vrai compte est 127)                                                          | `FROZEN_EXPORT_COUNT = 127` (compte gelé, non tautologique)                                                                                                                                                                                                                                                                                                  |
| `raw-guarded-channels` (**nouveau**)           | `RAW_GUARDED_CHANNELS` n'était lu par **rien** (constante décorative, liste périmée : 34 entrées pour 39 canaux bruts) | la constante est **appliquée** : scan complet de `electron/` ⇒ (a) `RAW_GUARDED_CHANNELS` = exactement les canaux qui appellent `enforceRawChannelGates` (34), (b) tout canal brut non gardé doit être listé dans `RAW_UNGUARDED_CHANNELS` **avec une raison écrite** (5 : `backup.list`, `backup.status`, `printer.get`, `recovery.retry`, `recovery.exit`) |
| `operation-id-coverage`                        | 42 schémas classés sur 120 ⇒ 19 schémas financiers « non listés » invisibles                                           | **classification complète** : liste REQUIRED gelée (43 schémas) + liste d'exceptions LWW (20) + assertion complémentaire « tout schéma non listé n'exige PAS operationId » + total gelé (121)                                                                                                                                                                |
| `ipc-channel-inventory`                        | `ocr.progress` absent de `PUSH_ONLY` : le test passait pour la MAUVAISE raison                                         | `ocr.progress` ajouté **et** assertion explicite : un canal push-only n'est jamais enregistré comme handler et est bien émis par `webContents.send`                                                                                                                                                                                                          |
| `a1-p0-boundary` (C-05)                        | test « rejette une date impossible » dont le corps affirmait `.not.toThrow()` sur une date **valide** ⇒ test creux     | les DEUX cas sont vérifiés (date réelle acceptée, dates impossibles refusées)                                                                                                                                                                                                                                                                                |
| `pin-kdf-parity` (I-04)                        | parité prouvée par `expect(src).toContain("PIN_KDF_ITERATIONS = 100_000")` (comparaison de TEXTE)                      | parité **comportementale** : le main, le relais E2E et la fonction Edge sont **exécutés** (webcrypto) et leurs condensats comparés ; les constantes sont comparées **numériquement** ; parité KDF **équipe** ajoutée (elle n'existait pas)                                                                                                                   |

## Décision 4 — les 4 tests « miroir » passent à la production (I-03)

15 fichiers de test reimplementaient la logique de production (« miroirs ») :
ils restaient verts même si la production était supprimée ou inversée.
Les 4 signalés explicitement par l'audit sont convertis (les 11 autres sont
des tests de base ou de invariants SQL, pas des miroirs) :

| Fichier                                     | Miroir                                  | Devenu                                                                                                                                           |
| ------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/integration/payment-receipt.test.ts` | réécriture de `ledgerBalances`          | appel de `getCustomerPaymentReceipt` (production) — et le cas « reçu incohérent » est désormais vérifié (refus), ce que le miroir ne testait pas |
| `tests/unit/operation-id.test.ts`           | algorithme d'idempotence réécrit        | appel de `saveZakatCalculation` (production) : même `operationId` ⇒ **une seule ligne**, montant = 8 250 (2,5 % de 330 000)                      |
| `tests/integration/carts-drafts.test.ts`    | filtre de lignes réécrit                | appels `saveCartDraftsAtomic` / `loadCartDrafts` / `clearCartDraftsAtomic` (production)                                                          |
| `tests/integration/atomic-slices.test.ts`   | transaction d'entrée réécrite à la main | appel de `receiveStockAtomic` (production) : succès + rollback total sur ligne invalide                                                          |

## Décision 5 — timeouts et CI

- `hookTimeout` : 10 s (défaut) → **60 s**. Chaque `beforeEach` de
  `tests/database|integration` rejoue **49 migrations** ⇒ 12 « Hook timed out »
  quand la suite tournait en parallèle d'autres outils lourds (piège connu).
- `testTimeout` : 15 s → **60 s**. La porte `test:coverage` instrumente tout
  le code (v8) : les tests d'intégration lourds (`client-loop`,
  `repair-hardening`) dépassaient 15 s ⇒ **faux négatifs** en couverture.
- CI : `npm run test:coverage` était déjà présent (W2/G-21) mais ROUGE ;
  il devient vert avec cette vague. `npm run verify:licensing` **n'est pas**
  ajouté : il vérifie l'état local du Manager (clé privée, `.vlic` importé)
  qui n'existe pas sur un runner ⇒ il resterait rouge. Il reste une porte
  **post-release vendor**, comme `package*`.

## Conséquences

- `npm run test:coverage` passe (EXIT 0) ⇒ le CI est vert sur cette étape.
- **Contrats gelés modifiés** : `FROZEN_SCHEMA_COUNT` 114 → **121** (ADR-123 ;
  la cible de W4 était 120, elle devient 121 à cause du schéma `closingReopenSchema`
  ajouté en W3) · nouvel invariant `FROZEN_EXPORT_COUNT = 127` (bridge-shape) ·
  liste `REQUIRED_NAMES` de `operationId` complétée (23 → 43 schémas).
- **Un bug de production corrigé** : extraction des codes-barres EAN-13/14
  dans l'analyseur OCR (`src/domain/ocr/parser.ts`).
- **Aucune migration**, **aucun changement de schéma**, **aucun changement de
  comportement métier** : la vague ne touche que les tests, les portes et un
  bug OCR.
- Point de retour arrière : `git revert` du commit.

## Non traité (reporté)

1. Les 11 autres fichiers « miroir » de l'audit (I-03) : à auditer vague par
   vague — la conversion des 4 signalés donne le patron.
2. **Q11** (seuil de couverture de `src/features`) : le périmètre reste
   `src/domain` + `src/application` avec 80/75/88/80 par fichier (valeur
   par défaut proposée au plan pour le domaine). L'extension à
   `src/features` (119 fichiers d'UI) reste une décision de couverture
   progressive à arbitrer par le propriétaire.
3. `verify:licensing` dans le CI (bloqué par l'absence d'état local runner).

## Vérification

Toutes les portes vertes (arbre sale, chantier impression non commité) :

| Porte                                                         | Avant                        | Après                        |
| ------------------------------------------------------------- | ---------------------------- | ---------------------------- |
| `npm run test:coverage`                                       | **EXIT 1** (18 dépassements) | **EXIT 0**                   |
| `npm test`                                                    | 130 fichiers / 857 tests     | **131 fichiers / 903 tests** |
| `npm run test:db`                                             | 36 fichiers / 162 tests      | **36 fichiers / 165 tests**  |
| `npm run typecheck` / `typecheck:electron`                    | 0                            | **0**                        |
| `npm run lint`                                                | exit 0                       | **exit 0**                   |
| `npm run format:check`                                        | 0                            | **0**                        |
| `npm run verify:migrations` / `verify:domain` / `verify:perf` | VERIFIED                     | **VERIFIED**                 |
| `npm run build` + `build:electron`                            | ✓                            | **✓**                        |

## Fichiers affectés

- Tests : `tests/unit/domain-rules-coverage.test.ts` (**nouveau**),
  `tests/unit/raw-guarded-channels.test.ts` (**nouveau**),
  `tests/unit/pin-kdf-parity.test.ts` (réécrit), `tests/unit/bridge-shape.test.ts`
  (réécrit), `tests/unit/operation-id-coverage.test.ts` (réécrit),
  `tests/unit/ipc-channel-inventory.test.ts`, `tests/unit/validators-inventory.test.ts`,
  `tests/unit/a1-p0-boundary.test.ts`, `tests/unit/ocr-parser.test.ts` (+6 cas),
  `tests/integration/payment-receipt.test.ts`, `tests/integration/carts-drafts.test.ts`,
  `tests/integration/atomic-slices.test.ts`, `tests/unit/operation-id.test.ts`.
- Production : `src/domain/ocr/parser.ts` (bug EAN-13/14),
  `electron/ipc/raw-guards.ts` (constante rendue applicable + exceptions
  documentées), `vitest.config.ts` (seuils de temps + exclusion des fichiers
  de types).
