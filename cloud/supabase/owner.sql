-- Veloria Owner — liasse de supervision (lecture propriétaire, ADR-163).
-- Le POS publie les liasses (service_role) ; l'app propriétaire lit la plus
-- récente via PostgREST avec son jeton Supabase Auth (RLS `authenticated`).
-- SQLite du POS = seul master : aucune donnée calculée ici, uniquement stockée.

-- 1) Publications : une ligne par liasse, la plus récente gagne.
CREATE TABLE IF NOT EXISTS public.owner_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_key TEXT NOT NULL DEFAULT 'veloria',
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_snapshots_shop_recent
  ON public.owner_snapshots (shop_key, generated_at DESC);

-- 2) RLS radical : anon ne lit rien, authenticated lit, service_role écrit.
ALTER TABLE public.owner_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.owner_snapshots FROM anon, authenticated;
GRANT SELECT ON TABLE public.owner_snapshots TO authenticated;
GRANT ALL ON TABLE public.owner_snapshots TO service_role;

-- Un seul compte propriétaire, créé dans Auth (inscriptions désactivées).
-- L'écriture reste réservée au POS (service_role) : aucune policy INSERT.
DROP POLICY IF EXISTS owner_snapshots_read ON public.owner_snapshots;
CREATE POLICY owner_snapshots_read ON public.owner_snapshots
  FOR SELECT TO authenticated
  USING (true);
