# ADR-116 — Caisse : scan douchette sans Entrée (idle court sur rafale machine)

## Contexte

Demande produit : un scan de code-barres doit être ajouté au panier **sans
presser Entrée** (douchette configurée sans suffixe). Le flux existant
(`onQueryChange → debounce 220 ms → runSearch`, ADR-114 pour le dialogue
poids) ajoutait déjà le produit sans Entrée — l'Entrée en fin de rafale est un
no-op quand aucune ligne n'est sélectionnable (résultats vidés à la frappe).

Deux limites réelles en revanche :

1. **Latence fixe de 220 ms** après la dernière frappe, identique à la frappe
   humaine : le scan sans Entrée attend le même délai que la saisie manuelle.
2. **Deux scans rapprochés (< 220 ms d'écart) se concatènent** : le second
   reschedule le minuteur du premier (`schedule` annule puis replanifie) →
   recherche sur `CODE1CODE2` → aucun hit → toast « Code-barres inconnu » et
   **aucun** des deux produits n'est ajouté. Cadence opérateur réaliste en
   caisse pour des articles scannés à la suite.

## Décisions

- **Détection de cadence machine** (`sell-search.ts`) : une frappe à ≤ 60 ms
  de la précédente est une rafale douchette (`SCAN_BURST_GAP_MS`) — aucun
  humain ne tape à 1 000 caractères/minute. Horodatage porté par
  `lastKeyAtRef` + drapeau `scanBurstRef` (`useSellState`), donc par frappes
  réelles, pas par heuristique de contenu.
- **Idle conditionnel** (`searchIdleMs(machineBurst, barcodeLike)`, pur et
  testé) : rafale machine **ET** texte code-barres → **90 ms** (`SCAN_IDLE_MS`) ;
  tout le reste → **220 ms** (`TEXT_IDLE_MS`, comportement historique).
  - Le scan sans Entrée s'ajoute ~90 ms après la dernière frappe.
  - Deux scans à cadence opérateur (> 90 ms d'écart) ne se concatènent plus :
    le premier est ajouté avant que le second ne commence.
- **Frappe humaine inchangée** : jamais d'idle court sur saisie lente —
  aucun risque d'ajout par préfixe pendant la frappe manuelle d'un nom ou
  d'un code (le texte non code-barres reste à 220 ms même en rafale, ex.
  « huile de »).
- **Sans Entrée, sans suffixe** : aucune configuration douchette requise —
  l'idle fait office de terminator, l'Entrée éventuelle reste un no-op.

## Conséquences

- Fichiers : `src/features/sales/sell/sell-search.ts`,
  `src/features/sales/sell/useSellState.ts` (deux refs).
- Tests unitaires (`tests/unit/sales/sell-split.test.ts`) : `searchIdleMs`
  (90/220), rafale machine sur code-barres → 90 ms, frappe humaine → 220 ms,
  rafale machine sur texte → 220 ms.
- Tests E2E (`tests/e2e/scan-flow.spec.ts`) : scan sans Entrée (focus champ),
  scan sans Entrée (focus perdu → refocus douchette, ADR-104),
  deux scans rapprochés (180 ms) → deux lignes.
- Fenêtre résiduelle : deux scans à < 90 ms d'écart (physiquement improbable,
  il faut repositionner la douchette) se concatènent encore — le toast
  « Code-barres inconnu » reste le filet de sécurité.
- Codes-barres « poids intégré » (EAN balance) toujours hors périmètre
  (cf. ADR-114).
