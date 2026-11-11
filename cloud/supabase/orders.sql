-- Veloria PoS — Intentions de commande (ADR-182, tranche F).
--
-- But : en V1, la commande part par WhatsApp et le commerçant la SAISIT à la
-- main. C'est functional mais costly : le magasin doit ressaisir ce que le
-- client a deja envoye. Cette table permet au client d'ecrire sa commande
-- dans le miroir, et au POS de la RECUPERER automatiquement.
--
-- Ce que porte cette table : une INTENTION (une demande), pas une commande.
--   - `operation_id` : UUID fourni par l'APK ; UNIQUE ⇒ le rejeu ne cree
--     jamais une seconde intention (idem de la regle 4) ;
--   - `customer_id` : identifie le client cote miroir (l'Edge l'a authentifie
--     par telephone + PIN, comme `client-sync`) ;
--   - `lines` : les lignes demandees en JSONB (`product_id`, `quantity`,
--     `unit_code`) — le PRIX est RELU par le POS a la creation de la
--     commande (le renderer ne fait jamais foi) ;
--   - `total_minor` : total ESTIME annonce par le client (information, pas
--     unecreance : seule la VENTE portera un montant reel) ;
--   - `status` : `pending` (a traiter) / `taken` (une commande existe) /
--     `rejected` (refusee par le commercant).
--
-- IMPORTANT (ADR-053) : une intention N'EST PAS une donnee metier. Elle est
-- un transport : le POS la transforme en `client_orders` (SQLite, master), et
-- la commande creee est la seule verite. Si le miroir est efface, l'intention
-- disparait — le commercant la ressaisit (la saisie manuelle reste le filet).
--
-- RLS : `anon`/`authenticated` n'ont AUCUN droit (la cle anon est publique,
-- elle voyage dans le QR d'activation). Seul `service_role` ecrit (la fonction
-- Edge `client-order`) et lit (le POS qui tire les intentions).

CREATE TABLE IF NOT EXISTS public.order_intents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Idempotence : le meme UUID envoye deux fois = une seule intention.
  operation_id TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  -- Lignes demandees : JSONB [{ product_id, quantity, unit_code }].
  lines JSONB NOT NULL,
  -- Total ESTIME annonce par le client (information ; jamais une creance).
  total_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'taken', 'rejected')),
  -- Reference de la commande POS issue de l'intention (NULL tant que pending).
  order_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- File de travail du POS : les intentions en attente, les plus anciennes
-- d'abord (une commande ancienne se traite en premier).
CREATE INDEX IF NOT EXISTS idx_order_intents_pending
  ON public.order_intents (created_at ASC)
  WHERE status = 'pending';

ALTER TABLE public.order_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_intents FROM anon, authenticated;
GRANT ALL ON TABLE public.order_intents TO service_role;
