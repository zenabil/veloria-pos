-- Veloria PoS — Migration 0063 : commandes clients (réservation et retrait).
--
-- Contexte (ADR-182, tranche C) : l'application client permet de demander des
-- produits (tranche B : commande par WhatsApp). Le commerçant doit pouvoir
-- **enregistrer** la commande qu'il reçoit, la suivre (préparation → prête →
-- livrée) et la **lier à la vente** encaissée au comptoir. Tant que cette
-- table n'existe pas, une commande est un message WhatsApp : rien n'est
-- traçable, rien ne prépare, aucune vente ne se rattache.
--
-- Ce que porte cette table (une LIGNE = une commande d'un client) :
--   - `reference` : `CMD-AAAA-NNNNNN`, générée par le POS (seul master) —
--     la référence locale du téléphone (`W-xxxxxx`) n'est qu'un identifiant
--     d'appareil, jamais une référence métier ;
--   - `customer_id` : la fiche client (la commande est rattachée à un compte,
--     sinon le commerçant ne sait pas à qui l'adresser ni quel solde solde) ;
--   - `status` : la machine d'états, verrouillée par trigger ci-dessous ;
--   - `total_minor` : centimes DZD entiers (la VENTE portera le vrai montant) ;
--   - `sale_id` : la vente encaissée — renseigné DANS la même transaction que
--     la vente (pas de vente orpheline, pas de commande fantôme) ;
--   - `note` : préférence de retrait indiquée par le client (« après 16 h ») ;
--   - `cancel_reason` : motif obligatoire d'une annulation (le client doit
--     pouvoir comprendre pourquoi sa commande a été refusée).
--
-- Garde-fous en base (mêmes règles que le domaine, ADR-182 §8) :
--   - `status` ∈ {nouvelle, preparing, ready, served, cancelled} ;
--   - `served` ⇒ `sale_id` renseignée ; `cancelled` ⇒ `cancel_reason`
--     renseigné ; les autres états ⇒ ni l'un ni l'autre ;
--   - les TRANSITIONS sont interdites par trigger (une commande livrée ne
--     redevient pas « en préparation ») ;
--   - les lignes gardent le NOM et le PRIX du moment de la commande
--     (`product_name_snapshot`, `unit_price_minor`) : le catalogue peut
--     changer, l'historique reste exact ;
--   - `reserved_quantity` : réservation SOUPLE (elle réduit le disponible
--     affiché, elle ne touche NI les couches FIFO NI le stock physique — une
--     réservation n'est pas une consommation, veloria-stock).
--
-- Règle AGENTS §12 : `0001..0062` sont IMMUABLES. Ce fichier est NOUVEAU et
-- purement additif : aucune ligne existante n'est modifiée ni recopiée.

CREATE TABLE IF NOT EXISTS client_orders (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  -- Format unique : PRÉFIXE-ANNÉE-00001 (même forme que les factures).
  reference TEXT NOT NULL UNIQUE CHECK (length(reference) BETWEEN 8 AND 32),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'nouvelle'
    CHECK (status IN ('nouvelle', 'preparing', 'ready', 'served', 'cancelled')),
  -- Argent : centimes DZD entiers (jamais de flottant).
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  -- Origine de la commande : saisie manuelle (message WhatsApp), appli, ou
  -- automatique (transport F). Traçabilité, pas de logique.
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'app', 'auto')),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 200),
  -- La vente encaissée : renseignée DANS la transaction de la vente.
  sale_id INTEGER REFERENCES sales(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  operation_id TEXT UNIQUE,
  -- FORME de l'état : invariants vérifiés par la base, pas seulement par l'UI.
  CHECK (
    (status IN ('nouvelle', 'preparing', 'ready')
      AND sale_id IS NULL AND cancel_reason IS NULL)
    OR (status = 'served' AND sale_id IS NOT NULL AND cancel_reason IS NULL)
    OR (status = 'cancelled' AND cancel_reason IS NOT NULL AND sale_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS client_order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES client_orders(id) ON DELETE CASCADE,
  -- `ON DELETE SET NULL` : la suppression d'un produit ne doit pas être
  -- bloquée par une commande ancienne ; le NOM figé garde l'historique lisible.
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL
    CHECK (length(product_name_snapshot) >= 1 AND length(product_name_snapshot) <= 200),
  unit_code TEXT NOT NULL DEFAULT 'PIECE' CHECK (length(unit_code) BETWEEN 1 AND 24),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  -- Réservation SOUPLE : elle retire la quantité du DISPONIBLE affiché, elle
  -- ne consomme aucune couche de coût et ne bouge pas le stock physique.
  reserved_quantity NUMERIC NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  created_at TEXT NOT NULL
);

-- Lecture par statut (la file « à préparer ») et par client (son historique).
CREATE INDEX IF NOT EXISTS idx_client_orders_status_created
  ON client_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_orders_customer
  ON client_orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_order_lines_order
  ON client_order_lines (order_id);

-- Numéro de commande : séquence propre (le compteur avance DANS la
-- transaction de création, comme les factures).
INSERT INTO number_sequences (sequence_key, prefix, next_value, updated_at)
VALUES ('client_order', 'CMD', 1, '2026-11-11T00:00:00.000Z')
ON CONFLICT(sequence_key) DO NOTHING;

-- Machine d'états : une commande livrée ou annulée est TERMINALE, et l'on ne
-- peut pas remonter dans le flux. Le trigger parle SQL, le domaine parle
-- français : les deux doivent dire la même chose (test de parité).
CREATE TRIGGER IF NOT EXISTS trg_client_orders_status_transition
BEFORE UPDATE OF status ON client_orders
FOR EACH ROW
WHEN NOT (
  OLD.status = NEW.status
  OR (OLD.status = 'nouvelle' AND NEW.status IN ('preparing', 'ready', 'served', 'cancelled'))
  OR (OLD.status = 'preparing' AND NEW.status IN ('ready', 'served', 'cancelled'))
  OR (OLD.status = 'ready' AND NEW.status IN ('served', 'cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'Transition de commande invalide.');
END;
