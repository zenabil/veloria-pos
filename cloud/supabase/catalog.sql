-- Veloria Client — catalogue du magasin (ADR-182).
-- Le POS publie le catalogue qu'il expose à l'application client ; l'APK le
-- lit via la fonction Edge `client-sync`. UN projet Supabase = UN magasin
-- (décision opérateur) : aucune colonne `store_key` ici.
--
-- Rappel ADR-053 : le nuage est un MIROIR. Les prix vivent dans SQLite
-- (`products.selling_price_minor`) ; cette table n'est qu'une projection
-- reconstruite à la republication. Aucune donnée d'achat (coût, FIFO,
-- fournisseur) n'y entre, et la quantité exacte n'y entre pas : seul un
-- booléen de disponibilité (un indice, la vérité est à la validation).
--
-- Verrouillage RLS : identique à `client_payloads` (schema.sql) — `anon` et
-- `authenticated` n'ont AUCUN droit ; seul `service_role` (POS via clé de
-- service, Edge Function) lit et écrit. La clé anon est publique (QR
-- d'activation V2) : elle ne doit jamais pouvoir lire un catalogue.

-- 1) Catalogue publié : une ligne par produit exposé à l'APK.
CREATE TABLE IF NOT EXISTS public.store_catalog (
  product_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  category_id INTEGER,
  category_name TEXT,
  -- Argent : centimes DZD entiers, jamais de flottant (veloria-money).
  -- Plafond = MAX_MINOR_SINGLE du domaine (1e9 = 10 M DZD).
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0 AND price_minor <= 1000000000),
  unit_code TEXT NOT NULL DEFAULT 'PIECE' CHECK (length(unit_code) BETWEEN 1 AND 24),
  -- Indice de disponibilité (jamais la quantité, jamais le stock physique).
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  -- Réservé pour plus tard (comme `announcements.image_url`, ADR-166) : V1
  -- ne publie AUCUNE image (pas de bucket de stockage dans le projet).
  image_url TEXT CHECK (image_url IS NULL OR length(image_url) BETWEEN 1 AND 500),
  -- Retrait de la publication = drapeau (pas de DELETE) : la réactivation est
  -- un simple upsert, et l'historique reste lisible côté diagnostic.
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  -- Identifiant de la publication (operationId) : traçabilité + purge des
  -- lignes retirées par lots, best-effort.
  batch_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_catalog_published
  ON public.store_catalog (name COLLATE NOCASE)
  WHERE is_published = 1;

-- 2) Version du catalogue : empreinte de la charge utile canonique.
-- L'APK ne re-télécharge que si la version a changé (cache local).
CREATE TABLE IF NOT EXISTS public.store_catalog_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL CHECK (length(version) BETWEEN 8 AND 128),
  product_count INTEGER NOT NULL CHECK (product_count >= 0),
  published_at TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) RLS radical : personne en dehors de service_role ne voit le catalogue.
ALTER TABLE public.store_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog_meta ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_catalog FROM anon, authenticated;
REVOKE ALL ON TABLE public.store_catalog_meta FROM anon, authenticated;

GRANT ALL ON TABLE public.store_catalog TO service_role;
GRANT ALL ON TABLE public.store_catalog_meta TO service_role;

-- Aucune policy : l'accès passe par la clé de service (POS) ou par la
-- fonction Edge `client-sync` (qui l'emploie en service_role).
