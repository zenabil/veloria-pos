# ADR-085 — Rôles internes gérant / utilisateur (0041)

Date : 2026-10-13
Statut : accepté (implémenté, slice verticale)

## Contexte

Aucune table d'utilisateurs internes avant : seul `customer_access` (clients externes,
téléphone + PIN) et les gates licence (affichage). Demande produit : deux rôles
(managers + utilisateurs), login `nom + code 6 chiffres` à chaque ouverture, le
gérant distribue les permissions depuis les Paramètres. Bootstrap : `admin/admin`
avec changement forcé.

## Décision

- Migration `0041_staff_roles.sql` uniquement (ADD, rejouable) : `staff_users`,
  `staff_user_permissions` (union 10 clés), `audit_log.actor_user_id`, triggers FR
  conservant au moins un gérant actif.
- Dérivation PBKDF2-HMAC-SHA256 100k + sel par utilisateur (miroir `#39` clients) ;
  verrou 5 échecs / 5 min ; messages génériques `Identifiants invalides.`
- Bootstrap `admin/admin` en `legacy-admin` + `must_change_code=1` créé au premier
  démarrage si table vide, jamais seedé en clair en migration ; tout IPC sensible
  bloqué jusqu'au changement (code 6 chiffres).
- Session en mémoire main (`staff-session.ts`) ; le renderer filtre l'affichage,
  le main décide à chaque IPC (`staff.*` + `registry.staff.ts`, Zod strict,
  `operationId` requis sur mutations).
- UI FR uniquement : `StaffGate` bloquant, `ChangeCodeCard` forcé/volontaire,
  rubrique Paramètres `Équipe`, barre de session + `Changer d'utilisateur`.

## Alternatives écartées

- Seed admin dans la migration : hash visible dans le repo + recréation au restore.
- PIN 4 chiffres / sans verrou : devinette triviale sur fichier SQLite volé.
- Session stockée en localStorage : contournable, contraire règle 2.

## Conséquences

- 8 canaux `staff.*` (snapshot + preload + validateurs à jour) ; contrats
  `bridge-shape` / `ipc-channel-inventory` étendus ; arête `settings>staff`
  en liste blanche A3 (même sens que `settings>license`, zéro cycle).
- `DomainError` += `STAFF_ERROR` ; tests `staff-domain` + `staff-roles`.
- Reste dû : matrice d'autorisation fine par IPC métier (aujourd'hui : gestion
  staff + affichage filtré), récupération gérant oublié (décision produit requise).
