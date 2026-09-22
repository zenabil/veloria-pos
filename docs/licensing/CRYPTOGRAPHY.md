# Licensing — CRYPTOGRAPHY

## Primitive : Ed25519 (node:crypto, aucune dépendance)

- Signature seule (authenticité/intégrité), PAS de chiffrement : le .vlic
  n'est pas confidentiel, il est **infalsifiable sans la clé privée**.
- Clés : `generateKeyPairSync("ed25519")`, privée PKCS#8 PEM, publique SPKI PEM.
- Signature : `sign(null, canonicalBytes, privateKey)` ; vérification :
  `verify(null, canonicalBytes, publicKey, sig)`.

## Canonicalisation (`canonicalJson`)

Clés triées récursivement, sans espaces, `undefined` ignorés : deux
sérialisations du même payload donnent les mêmes octets à signer, quel que
soit l'ordre des champs. Sans elle, un réordonnancement JSON casserait la
vérification (faux négatif) ou exigerait un format fragile.

## Enveloppe .vlic

`base64url(canonicalJSON({payload, signature}))`, ≤ 20 Ko.
Tout champ signé modifié (expiration, hardware, édition, plan, statut signé,
identité client, deviceBinding, pages, features, dates, licenseId, productId,
schemaVersion) ⇒ `INVALID_SIGNATURE`.

## Limites honnêtes

- Ed25519 ne protège pas contre le rejeu sur la MÊME machine (état + horloge
  s'en chargent) ni contre un admin local re-signant tout avec SA clé
  (il devrait aussi substituer la clé publique embarquée : risque résiduel
  documenté dans THREAT_MODEL).
- Pas de chiffrement du .vlic : l'ID matériel complet n'y figure qu'en hash
  (empreinte SHA-256), aucune donnée hardware brute.
