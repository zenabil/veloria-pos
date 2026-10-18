# ADR-086 — Autorisations équipe par IPC + code de secours (0042)

Date : 2026-10-13
Statut : accepté (implémenté)

## Contexte

ADR-085 livrait les rôles avec filtrage d'affichage uniquement : un appel IPC
direct contournait les permissions. Restaient dus : la matrice d'autorisation
fine par IPC métier et la récupération du gérant en cas d'oubli (poste offline,
aucun tiers de confiance).

## Décision

- `electron/ipc/staff-gates.ts` appelé par `handle()` après les gardes licence :
  carte canal → permission (ventes, stock, dettes, dépenses, retours, clôture,
  paramètres, utilisateurs, annulation) ; session main exigée ; gérant = tout.
- Remise (P0-7, dans les lignes `original > facturé`) : permission `discount`
  exigée en plus de `sales` sur `sales.create`.
- Canaux non mappés (catalogue, fournisseurs, devis, pain, historique, impression…)
  inchangés et ouverts comme avant ; login/logout/session/recover jamais
  verrouillés par une session.
- Migration `0042_staff_recovery.sql` : table `staff_recovery` (id = 1, hash
  PBKDF2 + sel, 5 échecs → 15 min). Code 8 chiffres généré au bootstrap,
  affiché UNE fois (`RecoveryCodeOnce`, mémoire uniquement), vérifié par
  `staff.recover` (sans session, `operationId` idempotent, audité).

## Alternatives écartées

- Session stockée côté renderer : contournable, contraire règle 2.
- Reset par réinstallation : perte de données, inacceptable en production.
- Secours en clair en base : vol du fichier = prise de contrôle immédiate.

## Conséquences

- Canal `staff.recover` (+ `staff.regenRecovery` gérant) ; snapshot + preload +
  validateurs ; E2E `staff-session` : porte, verrouillage, secours capturé puis
  récupération (connexion auto par le harnais pour les autres specs).
- Tests : parité KDF secours, schémas Zod, carte des gardes (scan texte, même
  convention que `#39`), table `staff_recovery`.

## Suivi (re-revues db-guardian PASS / ui-fr → corrigé)

- Course bootstrap : `staffList` avalait le code unique avant le login —
  `listStaffUsers` propage désormais `recoveryCode`, la porte le transmet au
  login, la soumission attend la liste (`loaded`).
- `Toasts` rendus aussi sur la porte et l'écran forcé (erreurs visibles).
- E2E réel : `staff-session.spec.ts` 3/3 vert, `sale-flow.spec.ts` 4/4 vert.
  Rappel : tout `build` renderer invalide le manifeste — re-signer via
  `build:electron` avant `test:e2e`.
