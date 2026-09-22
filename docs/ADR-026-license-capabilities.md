# ADR-026 — License capabilities (pages, features, plans, badge)

- Statut : accepté.
- Date : 2026-09-18.

## Contexte

Le système de licence (ADR-025) prouvait l'activation (signature, hardware,
dates, intégrité) mais n'autorisait qu'un mode « tout ou rien » avec 3
features. Besoin : licences différenciées par client (pages + features),
présélection par plans, révocation/suspension offline, badge d'état, sans
casser les licences existantes ni la sécurité (vérification main uniquement).

## Décision

1. Payload signé étendu (champs optionnels) : identité client, plan, statut
   signé (`active/suspended/revoked`), `deviceBinding`, `maxDevices`, `pages`,
   `features` élargies (14 ids). Absence de `pages` = tout autorisé (legacy).
2. Catalogue central (`electron/licensing/catalog.ts`, zéro dépendance) +
   miroir renderer typé avec test de parité.
3. Plans = presets d'émission uniquement ; les gardes n'utilisent que les
   capabilities signées (jamais `if (plan === "PRO")`).
4. États `REVOKED`/`SUSPENDED` vérifiés dans la chaîne (avant produit/hardware).
5. Gating main : `PAGE_GATED_*` + `FEATURE_GATED_*` dans `handle()`, gardes
   locales dans printing/backup/ocr (canaux directs), ventes à crédit/partielles.
6. Expiré = lecture seule des pages autorisées + sauvegarde toujours permise.
7. Badge header (texte + couleur, seuils 30/7 j configurables) + modal non sensible.
8. Manager : formulaire client/plan/durée/appareils + PAGE/FEATURE ACCESS,
   suspension/réactivation, ré-émission des capabilities.

## Conséquences

- Anciennes licences : toujours valides, plein accès (aucun client bloqué).
- Nouvelles licences : contrôle fin, révocation offline au réimport du `.vlic`.
- Revocation push sans serveur : limite documentée (honorée à l'émission/
  réimport, comme avant).
- Surface IPC POS inchangée côté écriture (aucun `setPermissions`).

## Alternatives rejetées

- Permissions en base SQLite métier : rejeté (source de vérité contournable,
  AGENTS.md).
- Décision dans le renderer : rejeté (contournement trivial).
- Statut de révocation uniquement côté Manager : insuffisant offline → statut
  signé dans le payload.
