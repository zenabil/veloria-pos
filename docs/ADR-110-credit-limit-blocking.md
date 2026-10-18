# ADR-110 — Plafond de crédit bloquant avec accord vendeur

Date : 2026-10-16. Statut : accepté.

## Contexte

Le plafond (`customers.credit_limit_minor`, ADR-008) était informatif : `computeDebtStatus`
détectait `over_limit`, mais aucun chemin (domaine, use-case, main, trigger, UI) ne
refusait `solde + reste > plafond`. Toute vente à crédit autorisée franchissait le
plafond (constat d'audit : V1). De plus le contrôle `credit_allowed` était lu
AVANT la transaction (TOCTOU théorique).

## Décision

- Règle : `remaining > 0` + `plafond > 0` + `solde + reste > plafond` = **refus FR**,
  sauf `limitOverrideApproved = true` (accord vendeur explicite, case à cocher
  « Dépassement de plafond — accord vendeur » dans l'encaissement).
- `plafond = 0` reste « sans plafond explicite » (comportement historique conservé).
- Défense en profondeur : `assertCreditLimitNotExceeded` (domaine, testé) →
  `buildSalePayload` (application, solde + plafond relus avant commit) →
  `createSaleAtomic` **dans** la transaction (lecture fraîche + `UPDATE … WHERE`
  gardé anti-course : `changes ≠ 1` = refus) → trigger 0007 inchangé
  (dernier ressort sur `credit_allowed`).
- Traçabilité : migration **0045** (`sales.credit_limit_override`, défaut 0) +
  `audit_log` (`sale.created` porte `limitOverride: 0/1`). Conversions devis :
  jamais de dépassement implicite (`false`).
- UI 100 % FR : panneau client (Solde + Plafond + Projeté + badge « Dépassement
  de plafond »), encaissement (soldes + case accord vendeur ; « Valider »
  bloqué sans accord). Comptant (`reste = 0`) : jamais de contrôle plafond.

## Conséquences

- Nouveau champ IPC `sales.create.limitOverrideApproved` (Zod `boolean`,
  défaut `false` ; anciens appelants compatibles).
- Schéma 0001-0044 immuable (règle AGENTS.md n° 11) ; `verify-migrations` vert,
  tests adaptés (compte 45) + `tests/unit/credit-limit.test.ts` (8) +
  `tests/integration/sale-credit-limit.test.ts` (4 : refus, accord tracé,
  sous-plafond, idempotence).
- Vérifié : format → typecheck (renderer + electron) → 751 tests verts →
  `verify:domain` vert → build vert.
