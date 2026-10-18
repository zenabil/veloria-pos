-- Veloria PoS — Migration 0045: traçabilité du dépassement de plafond (accord vendeur).
-- Contexte : le plafond (customers.credit_limit_minor) devient bloquant
-- (solde + reste > plafond = refus), sauf accord vendeur explicite.
-- Cette colonne fige l'accord sur la vente (audit + reporting) ; le refus
-- lui-même est appliqué dans createSaleAtomic (lecture fraîche + UPDATE gardé).
-- Non-destructive : ADD COLUMN avec défaut (anciennes ventes = 0, rejouable).
-- 0001..0044 immuables.

ALTER TABLE sales ADD COLUMN credit_limit_override INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_override IN (0,1));
