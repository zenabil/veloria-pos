# ADR-027 — Politique de révocation du crédit client (M-5)

## Statut

Accepté — 2026-09-19 (phase RADICAL REPAIR).

## Contexte

`customers.credit_allowed` est opt-in (ADR-008) : une vente à crédit
(`remaining > 0`) exige `customer_id` non nul **et** `credit_allowed = 1`,
défense en 4 couches (domaine → application → main → trigger SQL 0007/0023).

Cas non spécifié : un client avec une dette en cours (`outstanding > 0`)
dont on révoque l'autorisation (`credit_allowed` 1 → 0). L'état résultant
— dette existante + permission retirée — n'avait aucune politique écrite :
comportement indéfini.

## Décision

**La révocation est REFUSÉE tant que le solde impayé est > 0 : encaisser
d'abord, révoquer ensuite.** Garde-fou base de données (migration 0026) :

```sql
trg_customers_credit_revoke_guard BEFORE UPDATE OF credit_allowed
WHEN OLD.credit_allowed = 1 AND NEW.credit_allowed = 0
 AND OLD.outstanding_balance_minor > 0 → ABORT (message FR).
```

## Pourquoi pas l'alternative (révocation libre) ?

- Une révocation libre créerait l'état indéfini visé : l'opérateur croit
  « couper le crédit » alors que la dette reste — puis s'étonne qu'aucune
  vente à crédit ne passe (trigger 0007/0023) sans comprendre le lien.
- Le refus explicite force le workflow sûr : **règlement → révocation**,
  traçable dans l'audit.

## Ce qui n'est PAS bloqué

- **Encaisser la dette existante** : les paiements (`sale_payments`,
  `customers.recordPayment`) ne consultent jamais `credit_allowed`.
- **Accorder de nouveau** : 0 → 1 toujours libre.
- **Vente au comptant** : libre pour tous (règle ADR-008 inchangée).

## Conséquences

- `customers.repo.updateCustomer` : aucun changement de code — le trigger
  remonte un message FR clair, propagé tel quel à l'UI.
- Tests : `verify-migrations.mjs` (révocation refusée avec dette, autorisée
  soldée) + `tests/integration/atomic-slices.test.ts` à étendre si besoin.
- Risque régression : faible — seul le chemin révocation-avec-dette change
  (d'erreur silencieuse/état flou vers refus explicite FR).
