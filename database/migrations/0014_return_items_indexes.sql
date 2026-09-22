-- Veloria PoS - Migration 0014: index des lignes de retours (détail par parent).
-- Contexte : `return_items(return_id)` et
-- `supplier_return_items(supplier_return_id)` sont lus à chaque fiche détail
-- (getReturnDetail) mais n'avaient aucun index dédié — toutes les autres
-- tables filles en ont un (0002/0005). Lecture seule, rejouable.
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_supplier_return_items_return
  ON supplier_return_items(supplier_return_id);
