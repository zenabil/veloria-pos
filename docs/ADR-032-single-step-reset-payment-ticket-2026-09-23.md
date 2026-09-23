# ADR-032 — Encaissement 1 étape, reset usine, ticket de règlement, Enter universel, clé manager importable (2026-09-23)

## Contexte

Demandes opérateur : caisse plus rapide (1 étape), remise à zéro sécurisée,
« Document d'impression invalide. » sur l'aperçu factures, ticket de
règlement de dette, Entrée partout, clé vendor sans erreur bloquante,
listes déroulantes illisibles dans le Manager.

## Décisions

1. **PayDialog 1 étape** : montant + moyen + échéance (si crédit) + Valider
   sur un seul écran. E2E `settlePayment` aligné (plus de « Continuer »).
2. **P04 impression** : le garde arithmétique acceptait une seule sémantique
   (sous-total === Σ lignes) et rejetait TOUTES les ventes remisées
   (sous-total = Σ origines) et aurait rejeté les devis remisés après
   correction naïve (remise globale). Les DEUX formes cohérentes sont
   acceptées ; le reste est rejeté. Tests de non-régression
   (documents.test.ts : vente remisée, devis global, lignes incohérentes).
3. **Reset usine** (`database.reset`) : fichier + compagnons supprimés,
   migrations rejouées (base vierge), sauvegardes \*.vposdb conservées.
   Triple verrou : confirmation tapée REINITIALISER (renderer) + littéral
   Zod (main) + garde licence/paramètres. Redémarrage après reset.
4. **Ticket de règlement** (placement تسديد الدين) : builders purs
   (80mm/A4) + `paymentTicketSchema` (nouveau = ancien − montant) +
   canaux `printing.previewPayment/printPayment` (garde receipt-80mm +
   pages dettes) + `PaymentTicketModal` partagée, branchée aux 4
   encaissements (dettes client/fournisseur, fiche client, fournisseur, pain).
5. **Entrée universel** : `Button[data-primary]` + Modal/Drawer activent le
   primaire sur Entrée dans un champ SANS formulaire (les formulaires
   soumettent nativement — jamais de double déclenchement). Échap inchangé.
6. **Clé vendor : REFUS de la cuire dans l'installeur** — un .exe se
   désassemble, la clé extraite = forge illimitée de licences = mort du
   modèle Ed25519. À la place : import guidé premier lancement
   (`manager.keyImport` : dialogue main → validation Ed25519 stricte →
   copie userData/keys, jamais via le renderer) + message d'accueil
   actionnable. Documenté dans KEY_MANAGEMENT.md.
7. **Listes blanches** : `:root { color-scheme: dark }` + `select option`
   nuit/texte clair (Manager styles.css + POS globals.css + Select déjà
   durci côté POS).

## Conséquences

- E2E : +1 spec `factory-reset.spec.ts` (bouton réel → base vierge) ;
  `settlePayment` réécrit pour 1 étape.
- Tests : `payment-ticket.test.ts` (builders + schéma + validation clé),
  `factory-reset.test.ts` (protocole miroir node:sqlite — le natif
  better-sqlite3/Electron est couvert par E2E + smoke packagé).
- `bridge-shape` couvre les 3 nouveaux canaux + 2 nouveaux schémas.
