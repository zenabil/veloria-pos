# Licensing — TRUST_BOUNDARIES

## Veloria POS (non fiable, côté client)

NE CONTIENT JAMAIS : clé privée, capacité de signature, secrets vendor,
base du Manager, API de génération, credentials, bypass (`license:scan`
l'impose au build). Contient : clé PUBLIQUE (`resources/license/public.key`),
vérification, empreinte locale, état chiffré.

## Veloria License Manager (confiance vendor, machine vendor)

Contient : clé privée (`private/vendor-keys/` ou dossier keys du Manager),
registre SQLite vendor (`%APPDATA%/Veloria License Manager/`), génération.
Ne sort jamais de la machine vendor sauf son propre installeur interne.

## Frontières techniques

- Renderer POS : aucun `fs`/`crypto secret`/SQLite (contextIsolation,
  sandbox, preload typé ; test `bridge-shape`).
- IPC licence : 6 canaux explicites + Zod (`licenseActionSchema` vide —
  l'import passe par dialogue main, jamais de contenu .vlic via IPC ;
  aucune écriture de permissions côté POS).
- Fichier .vlic : lu par le main (taille ≤ 20 Ko), vérifié, jamais exécuté.
- État : `userData/secure/license-state.dat` (DPAPI), jamais localStorage.
- Données POS : intouchables par la licence (pas de suppression/corruption,
  même en cas de tamper détecté).
