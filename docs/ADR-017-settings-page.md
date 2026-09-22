# ADR-017 — Page Paramètres (17 rubriques, réglages explicites)

Date : 2026-09-16. Statut : accepté.

## Contexte

Aucun écran de réglages : constantes dispersées (préfixe factures, stock
négatif, imprimante) sans UI, confirmations de suppression non débrayables,
contenu factures figé, base non optimisable depuis l'app.

## Décision

- Clés explicites en base (`inventory`, `sales`, `invoice`, `printing`,
  `products`, `customers`, `suppliers`), une par schéma Zod, jamais de get/set
  générique (règle n° 3 étendue). Fiche société enrichie (commercial, email,
  site, NIF, RC + migration 0013).
- Appliqués réellement : défauts caisse/clients/produits/paiements (pré-remplis
  sans écraser la saisie), interrupteur crédit global (refus serveur),
  impression auto, confirmations débrayables (23 sites, défaut ON), contenu
  factures central (logo, soldes, pied de page — service d'impression),
  stock négatif (première UI), imprimante + silence, sauvegardes, déplacement/
  vérification/optimisation (VACUUM, nouveau canal) de la base.
- Honnêtement informatifs (aucun faux contrôle) : Général figé (français, DZD,
  sombre), Utilisateur mono-poste, Achats (numéros fournisseurs externes),
  Notifications (digest temps réel), Appareils (imprimante + test douchette
  clavier ; balance/tiroir non pris en charge), Sécurité (sans comptes :
  confirmation + intégrité), À propos (diagnostics existants).
- Écartés : langue/devise/thème modifiables, remises par défaut (pas de remise
  en caisse), verrouillage auto (sans auth), mise à jour auto (sans serveur),
  coupe papier/tiroir (pas d'ESC/POS), aperçu désactivable, préfixes de codes
  (CL-/FOU- dérivés stables).

## Conséquences

- Dernier module sidebar prêt : 16/16 écrans construits. 5 tests ajoutés.
