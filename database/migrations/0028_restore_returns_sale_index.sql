-- Veloria PoS — Migration 0028: restaure l'index perdu par 0025 (P1-8).
-- Contexte : la reconstruction de `returns` en 0025 (table DROP) a fait perdre
-- `idx_returns_original_sale` (créé en 0002:25) — seule la recréation partielle
-- (`idx_returns_number`, `idx_returns_customer`) a été rejouée. Les requêtes
-- "retours d'une vente" retombaient en scan complet.
-- 0001..0027 immuables (jamais modifiées) : cette migration AJOUTE ce qui manque.
-- Déterministe : IF NOT EXISTS — passe sur base fraîche/vide/legacy, rejouable
-- sans effet (version suivie dans schema_migrations comme les précédentes).
-- Note collision 0010/0025 : les deux remblais utilisent RET-C-%05d PAR id —
-- un même id donne le même numéro des deux côtés, donc aucune collision
-- possible entre les deux remblais (UNIQUE tient, vérifié par verify-migrations).

CREATE INDEX IF NOT EXISTS idx_returns_original_sale ON returns(original_sale_id);
