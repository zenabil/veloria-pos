-- Veloria PoS — Migration 0008: supplier file enrichment (page Fournisseurs).
-- Adds the business identity fields shown in the supplier file (code, tax
-- number, commercial register, notes, active switch). `email` already exists
-- since 0001. Existing rows get a stable generated code.
ALTER TABLE suppliers ADD COLUMN code TEXT;
ALTER TABLE suppliers ADD COLUMN tax_number TEXT;
ALTER TABLE suppliers ADD COLUMN commercial_register TEXT;
ALTER TABLE suppliers ADD COLUMN notes TEXT;
ALTER TABLE suppliers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1));

UPDATE suppliers SET code = 'FOU-' || printf('%05d', id) WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);
