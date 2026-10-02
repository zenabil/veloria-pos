# ADR-037 — Audit profond 20 zones : zéro mensonge UI + Impression 5 documents

Date : 2026-09-28. Méthode : 6 sous-agents d'audit (lecture seule) + vérification
manuelle des points critiques (Modal Entrée confirmé présent, `accessSync`
Windows non fiable, prix pain 0 = pricing à la facturation).

## Règle d'or appliquée : étiquette sans handler = bug

- **Footer contextuel** (`App.tsx` `FOOTER_HINTS`) : l'ancien bandeau F1…F8
  statique mentait (6/8 décoratifs, F4/F5/F6/F8 en conflit de sens avec la
  caisse). Chaque module affiche désormais uniquement ses raccourcis réels et
  vérifiés ; repli `F2 / Échap / Entrée` (tous globaux et réels). Aide `[?]`
  = modale des vrais raccourcis du module ; cloche = accusé honnête.
- **Handlers ajoutés** : dashboard F4(dates)/F5(actualiser)/F8(export CSV réel),
  reports F4/F8, history F6 (garde tri `date_desc`), returns F2/F8 (+export CSV),
  expenses F8 (+export CSV). Modal `Entrée→primaire` vérifié : le libellé
  `Valider & Encaisser [Entrée]` est honnête.

## Chasse aux données fictives / libellés mensongers

- Suppliers : `Bon de commande` → `Nouveau Fournisseur` (ouvrait le formulaire).
- Stock : pastille `[IA]` supprimée (pas une touche).
- Reports : presets dynamiques (`Trimestre T1-T4`, `Exercice AAAA` courants) ;
  `OK` → `Rechercher` ; `Top …` → `Principaux …`.
- History : `Export…` → `Exportation…` ; colonne/CSV `Utilisateur` → `Poste`
  (`Caisse 01`) ; `Session active #01` → `Session active`.
- Dettes : `SYNCHRONISATION TERMINÉE` → `Registre consolidé local` ; reçu
  `Utilisateur` → `Poste`.
- Dépenses : sous-KPI `Loyer + Sonelgaz < 5j` → `À régler`.
- Pain : `Exercice 2025` → année dynamique ; `100% conformes` → `Terminées`
  (prix 0 à la commande = pricing à la facturation/transfert, par conception).
- Zakat : taux affiché dynamique, `DZD · Alger` → `DZD`, tag
  `CONFORMITÉ CHARIA · REGISTRE SCELLÉ`.
- Licence : badge éditions en FR (cohérent avec l'écran).
- EmptyStates alignés sur les vrais boutons (4 écrans) ; `Moyen` → `Moyen de
paiement` ; `Rotation (top 5)` → `5 meilleures rotations`.
- Caisse : `Total Net à Payer`, `Montant Donné`, `Espèces (Caisse locale)`,
  `Dernière Vente Validée`, champ Qté article libre (strict, hors stock).

## Impression : 5 documents personnalisables + prévisualisation

`PrintTemplatesScreen` réécrit : onglets Facture A4 / Ticket 80mm / Ticket 58mm /
Reçu Paiement / Bon Commande, drapeaux par document (persistés séparément),
aperçus dédiés avec **fiche entreprise réelle** (`useCompany`) et mention
`Exemple`. Corrigé : aperçu A4 titré `DEVIS PROFORMA` → `FACTURE`, texte EN
d'aperçu, NIF/RC `123456789` fictifs supprimés (vrais ou `—`).

## Non-faits volontaires (pas de données/domaine sous-jacent)

Multi-caisses #02, TVA/G50/SCF, pilotage ESC-POS natif, VFD/balance, SMS/WA,
clôture X, sessions d'inventaire persistées, statut zakat `payée` (aucun canal),
IntakesDrawer sans détail, `PIECE` (code domaine). Inventer = interdit.

## Vérification

- `format` + `typecheck` verts, `vite build` + `build:electron` (integrity
  130 fichiers re-signé), démarrage nominal, `vitest` 65 fichiers / 409 verts.
