# ADR-013 — Maquettes documents : facture A4, ticket 80mm, proforma

Date : 2026-09-16. Statut : accepté.

## Contexte

Les documents imprimés étaient minimaux (en-tête + lignes + totaux) : ni bloc
client complet, ni références lignes, ni montant en lettres, ni signatures,
ni proforma différencié. Maquettes wireframes A4 / 80mm / proforma fournies.

## Décision

- Moteurs purs dans `receipt-documents.ts` (déterministes, testés) :
  facture A4 (logo, société, cartouche N°/Date/Échéance, bloc CLIENT,
  tableau avec Réf., Sous-total/Remise/TOTAL TTC/Payé/RESTE, montant en
  lettres, mode, notes conditionnelles, signatures, pied légal, Page 1/1),
  ticket 80mm compact (soldes + mode + Veloria POS), proforma A4
  (DESTINATAIRE, validité, conditions, « Document non comptabilisé »).
- `amountInWordsFr` : français standard (70-99, cents, mille invariable,
  millions/milliards accordés) + centimes ; `formatCustomerCode` (`CL-00001`,
  dérivé de l'id, aucune colonne) ; `formatProductRef` (id paddé, « — » libre).
- `due_date` des ventes désormais persisté (canal existant, transmis à la
  conversion proforma→vente) ; Échéance affichée si renseignée.
- Logo : data URL injectée côté main (meilleur effort, ≤ 400 Ko), aperçu +
  impression ; aucun faux bloc logo. Email/RC/NIF société (colonnes
  existantes) et notes/conditions : rendus conditionnels.
- Charges utiles enrichies aux 4 points d'appel (caisse, devis, historique,
  retours) : coordonnées client, code client, moyen de paiement, refs lignes.
- Validité proforma : 30 jours (au lieu de 15).

## Conséquences

- Tests documents réécrits sur les maquettes (22 assertions de mots français).
- Précision conservée à 2 décimales même sur 80mm (exactitude comptable).
- Paramètres société (email, RC, logo) modifiables quand l'écran Paramètres
  existera ; champs conditionnels en attendant.

## Addendum 16/09 — Code-barres factures (recherche par scan)

- Code 39 en SVG pur (zéro dépendance) dans le cartouche A4 facture +
  proforma : le scan saisit le N° dans la recherche Historique (filtre Réf.),
  qui retrouve la pièce. Pas de Code 39 sur le 80mm (flux texte thermique).
- Table ISO 16388 vérifiée caractère par caractère contre JsBarcode (MIT) +
  équations 2-barres-larges/1-espace-large ; écarts de mémoire corrigés
  (lettres C–T, ponctuation). Tests : 44 motifs valides + références 0/A/P/-/​\*.
- Proforma scannable aussi (`PRO-…`) ; retours (`RET-…`) via la même facture A4.
