-- Veloria PoS — RLS du miroir V1 : REFUS PAR DÉFAUT.
-- Modèle d'accès V1 (0 $) : AUCUNE lecture directe (ni anon ni authenticated).
-- Seule la fonction Edge `client-sync` (clé service_role côté serveur) lit
-- après vérification téléphone + PIN + révocation + verrou. La clé `anon`
-- intégrée à l'APK est donc inutile à un attaquant même extraite du binaire.
-- Activer RLS sans politique = refus total ; on le verrouille explicitement.

ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_payloads ENABLE ROW LEVEL SECURITY;

-- Aucune politique créée volontairement : tout accès direct est rejeté.
-- La fonction Edge contourne RLS via service_role (bypass intégré).

-- Garde-ceinture : révoquer tout privilège direct au cas où.
REVOKE ALL ON client_access FROM anon, authenticated;
REVOKE ALL ON client_payloads FROM anon, authenticated;
REVOKE ALL ON latest_client_payloads FROM anon, authenticated;
