# PHASE 6 — Réparation radicale P0–P5 (2026-09-21)

Exécution du prompt strict : zéro TODO/console/`as T` nouveau/message brut.
Branche : `chore/root-layout`. TVA refusée (jamais implémentée).

## P0 — critique (7/7)

| ID   | Correctif                                                                                           | Preuve                                             |
| ---- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P0-1 | pain update/status/transfer : 1 tx + operationId obligatoire (schémas + UI)                         | `bread-atomic.test.ts` (rollback + replay)         |
| P0-2 | `reopenWithRetry` (restore + relocate), échec FORT FR                                               | `restore-rollback.test.ts` (miroir + fail-loud)    |
| P0-3 | empreinte : 3 tentatives backoff, échec TTL 30 s (jamais figé)                                      | `license-fingerprint.test.ts`                      |
| P0-4 | manifeste vide/incomplet = refus (POS + Manager) + échec build                                      | `license-tamper.test.ts` (garde pure)              |
| P0-5 | seuil FIFO 1e11 → 1e14                                                                              | `fifo-rules.test.ts` (1e9×5 passe, 1e9×101 rejeté) |
| P0-6 | normalisation arabe préservée (U+0600–06FF, tachkîl, chiffres arabes) + exact-avant-filtre          | `ocr-matcher.test.ts` (خبز/حليب)                   |
| P0-7 | remise par prix unitaire : dialogue P.U. + alerte sous-coût + audit + migration 0027 + use-case pur | `sale-rules/cart-tabs/create-sale/root-repair`     |

## P1 — haute/moyenne (8/8)

1. Reports : snapshot explicite + hook `useLoadSeq` unifié.
2. `loadSeq` sur Dépenses/Retours/Proformas/Fournisseurs/Reports.
3. Total archivés réel (filtre serveur `archivedOnly`) + `setQty` arrondi unifié + 1→0 confirmé.
4. Parser OCR : `multiplyMinorByQuantity` + dates calendaires strictes (+ tests).
5. `parseDzdInputStrict` partout (28 sites) + `strictOrNeg` partagé + `dzdInputToMinor` SUPPRIMÉ + CSV court = rejet.
6. operationId : produits/clients/zakat + couche centrale + test double-clic.
7. `frError` central (renderer+main) : ~135 sites migrés, 0 `e.message` brut restant.
8. Tests : reset cart-tabs, version dynamique installer, NaN interdit, "À régler", migration 0028 (index perdu).

## P2 — nettoyage + 11 mises à jour

Hash partagé (`licensing/hash.ts` ×3) ; parité main/domaine testée + 6 schémas
quantité unifiés ; labels uniques (paiement/mouvements/caisse) ; `num()`/dates
ticket sûrs ; contrats IPC bornés + 6 chemins `callChecked` ; `tsconfig`
référence manager ; Node ≥22.5 ; `builtAt` hors signature ; `--out/--months/
--features` + pré-contrôles ; bypass EXPIRED isolé + gate `VELORIA_E2E=1` ;
`integrity.js` (seuils dynamiques + checksums) ; `suppliers` en DEFAULTS +
RC documenté. Suppressions : alias identité, `toProformaData`,
`computeBreadSaleMapping`, `tests/types.d.ts`.

## P3 — fonctionnalités (hors TVA)

Zakat→domaine (+code ZAKAT_ERROR) ; return-policy/stock-alerts/audit-rules ;
price/credit/units/barcode/cash-count (+validation draft + confirm marge +
audit) ; **bons de commande** (migration 0029 + repo + 6 canaux IPC + UI
fournisseurs) ; péremption UI ; bouton import CSV ; P&L net ; backup Manager ;
rétention (90/365 j) ; CI + seuils coverage (84/79/94/84).

## P4 — pages

Brouillons SQLite (migration 0030 + IPC + hydrate) ; `sell/` (CartPanel,
PayDialog stepper 3, SettleDialog, CustomItemDialog, useSellShortcuts —
SellScreen 1864→~1300) ; splits stock/produits/retours/fournisseurs (4 barils,
21 fichiers) ; menu Actions stock ; onglets Rapports ; overflow Proformas ;
période repliable Pain ; déduplication Dettes/Historique/Dépenses ; forage
Dashboard (Stock/Dettes/Pain).

## P5 — sons

Moteur WebAudio zéro-asset (`shared/sound`) + `sound.enabled` (SQLite + UI +
tête de caisse) + unlock 1er geste + hook global `notify(err)` + 25 points
(success/cash/blip/clear/print/warning/click) + test `sound.test.ts`.

## Vérification finale (porte d'acceptation)

| Contrôle                                | Résultat                                        |
| --------------------------------------- | ----------------------------------------------- |
| `prettier` (fichiers touchés)           | OK (dérive préexistante hors périmètre intacte) |
| `typecheck` / `:electron` / `:manager`  | 0 erreur ×3                                     |
| `npm test`                              | 63 fichiers, **394 tests, 0 échec**             |
| `test:coverage` (seuils 80/75/88/80)    | 84/79/94/84 OK                                  |
| `verify:migrations` (0030)              | VERIFIED                                        |
| `verify:domain`                         | VERIFIED                                        |
| builds ×4 (renderer/electron/manager×2) | OK (manifeste 129 fichiers)                     |
| `license:scan`                          | 463 fichiers, aucun secret                      |

## Reste connu (suivi, hors prompt)

- E2E non rejoué ici (machine : clé vendor + élévation) — helpers mis à jour
  (`VELORIA_E2E=1`, version dynamique).
- `format:check` global encore rouge sur la dérive préexistante (24 fichiers
  antérieurs non touchés).
- Rollback : suppression de la branche (aucun commit imposé).
