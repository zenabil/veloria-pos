-- Veloria PoS — Comptage d'usage de l'application client (ADR-182, tranche E).
--
-- But : l'objectif de la phase est « AUGMENTER LE NOMBRE D'UTILISATEURS ».
-- Sans compteur, cette phrase n'est pas démontrable — ni pour le commerçant
-- (qui doit voir l'effet de l'application), ni pour l'exploitant (qui doit
-- savoir où il en est).
--
-- Ce que porte cette table : UNE LIGNE PAR APPEL AUTHENTIFIÉ de l'application
-- client (connexion, synchronisation, consultation d'une facture). Elle est
-- écrite par la fonction Edge `client-sync` (qui l'authentifie déjà), donc
-- **aucun nouveau canal d'écriture** côté téléphone : le client ne demande
-- rien, il est compté.
--
-- Rappel ADR-053 : le nuage est un MIROIR. Ce compteur est une PROJECTION
-- d'usage (elle se reconstruit, elle n'est pas une donnée métier) ; la
-- source reste l'appel authentifié lui-même.
--
-- La clé `service_role` contourne la RLS : elle ne doit jamais quitter le
-- poste. Le `anon` (public : il voyage dans le QR d'activation) n'a AUCUN
-- droit : un compteur d'usage n'a rien à faire dans une clé publique.

CREATE TABLE IF NOT EXISTS public.client_activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Client concerné (clé de lecture pour l'agrégat ; pas de nom, pas de
  -- téléphone : on ne compte que des identifiants techniques).
  customer_id INTEGER NOT NULL,
  -- Nature de l'appel : « sync », « invoice_detail », …
  kind TEXT NOT NULL DEFAULT 'sync' CHECK (length(kind) BETWEEN 1 AND 40),
  -- Instant de l'appel (ISO UTC).
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agrégat « 30 derniers jours » : la requête du POS filtre sur `at`.
CREATE INDEX IF NOT EXISTS idx_client_activity_at
  ON public.client_activity (at DESC);
CREATE INDEX IF NOT EXISTS idx_client_activity_customer_at
  ON public.client_activity (customer_id, at DESC);

-- RLS radical : `anon`/`authenticated` n'ont AUCUN droit (la clé anon est
-- publique) ; seul `service_role` (POS + fonction Edge) lit et écrit.
ALTER TABLE public.client_activity ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_activity FROM anon, authenticated;
GRANT ALL ON TABLE public.client_activity TO service_role;

-- Agrégat des 30 derniers jours : UNE ligne pour le POS (le compteur
-- journalier peut grossir : 40 clients × 30 jours de lignes).
CREATE OR REPLACE VIEW public.client_activity_30d AS
SELECT
  COUNT(*)::bigint AS calls,
  COUNT(DISTINCT customer_id)::bigint AS customers,
  MAX(at) AS last_at
FROM public.client_activity
WHERE at >= now() - interval '30 days';

-- Le `service_role` est le seul lecteur (la clé anon est publique : un
-- compteur d'usage n'a rien à faire dans une clé publique).
REVOKE ALL ON public.client_activity_30d FROM anon, authenticated;
GRANT SELECT ON public.client_activity_30d TO service_role;
