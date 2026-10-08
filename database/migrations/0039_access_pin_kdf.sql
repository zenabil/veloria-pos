-- Veloria PoS — Migration 0039 : condensat PIN lent (PBKDF2, anti-devinette).
-- 0032 stockait pin_hash = SHA-256(PIN) nu : un PIN à 6 chiffres (10^6
-- combinaisons) se devine en millisecondes si les condensats du miroir
-- fuient. Désormais chaque client a son sel (pin_salt, 16 octets hex) et
-- pin_algo identifie la dérivation (lignes historiques : 'sha256', vérifiées
-- par l'ancien chemin transitoire côté Edge — jamais de réactivation forcée).
-- phone_hash RESTE déterministe (clé de recherche avant sel connu) et
-- qr_secret_hash reste SHA-256 (secret 128 bits, pas un mot de passe).
-- Paramètres canoniques : src/domain/customer/client-access.ts
-- (PIN_KDF_*). ADD COLUMN uniquement : 0001..0038 immuables, rejouable.
ALTER TABLE customer_access ADD COLUMN pin_salt TEXT NULL;
ALTER TABLE customer_access ADD COLUMN pin_algo TEXT NOT NULL DEFAULT 'sha256';
