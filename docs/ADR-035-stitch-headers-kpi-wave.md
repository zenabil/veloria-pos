# ADR-035 — Vague Stitch : en-têtes + KPI + caisse littéraux sur 17 modules

Date : 2026-09-28 (prolonge ADR-033 coquille + ADR-034 licence/base).

## Périmètre

Conversion des 16 écrans au composant `PageHeader` Stitch (pastille + H1 +
badge `Poste Principal` + tag module + période analytique + actions) et des
grilles KPI aux libellés/accents littéraux du `code.html` correspondant :

| Module    | Titre Stitch                                      | Tag module                                                                            |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| dashboard | Tableau de bord                                   | Poste Principal (8 KPI à accents)                                                     |
| sell      | Vente (sans H1, écran caisse)                     | —                                                                                     |
| products  | Catalogue des Produits                            | INDEX v2.4                                                                            |
| customers | Gestion des Clients                               | Registre Fédéré DZD                                                                   |
| suppliers | Fournisseurs & Approvisionnements                 | REGISTRE ACHATS DZD (+CTA Bon de commande)                                            |
| stock     | Gestion des Stocks & Réceptions                   | Dépôt Central · Blida (+CTA Scanner/OCR IA explicite)                                 |
| history   | Historique des Ventes & Transactions              | JOURNAL FISCAL EN TEMPS RÉEL · SHA-256 SCELLÉ                                         |
| returns   | Retours & Avoirs Clients                          | MODULE 09 · FISCAL V3.2 (+Nouveau Retour [F2])                                        |
| expenses  | Dépenses & Charges d'Exploitation                 | Module 10 · JOURNAL SCELLÉ WAL                                                        |
| debts     | Dettes & Créances Globales                        | Registre Consolidé (cartes héros créances/recouvrement)                               |
| reports   | Rapports & Statistiques                           | Module 12 · v3.8 · DONNÉES EN TEMPS RÉEL (+Marge Brute Globale en tête, Générer [F9]) |
| bread     | Pain & Commandes Boulangerie                      | MODULE 14 · PRIX SUBVENTIONNÉ RÉGLEMENTÉ (DZD)                                        |
| proformas | Factures Proforma & Devis                         | Mode Émission Ouvert (recherche `N° Proforma PRF-… [F3]`)                             |
| templates | Modèles & Formats d'Impression (NOUVEAU, ADR-033) | Zones ESC/POS 01-04, aperçu 80mm/A4 [F7]                                              |
| zakat     | Zakat El-Mal & Décharge Annuelle                  | MODULE 15 · CONFORMITÉ SHARIA · LEDGER SCELLÉ WAL (Nisab 85g / Assiette / 2,5 %)      |
| settings  | Paramètres Système & Matériel PoS                 | MODULE 16 · POSTE DE TRAVAIL & SYSTÈME SÉCURISÉ                                       |
| license   | Licence & Activation Machine                      | MODULE 17 · AIR-GAP OFFLINE VALIDE                                                    |

Caisse (sell) : badge `Scanner prêt`, hint `Entrée ↵`, compteur
`Affichage : N produit(s) filtré(s)`, barre `Paniers en attente :`, libellé
`Bip caisse actif` — logique métier inchangée (paniers, crédit, idempotence).

Coquille : barre fine enrichie (`Session Active`, `POSTE 04 · OPÉRATEUR
PRINCIPAL`, `Aide [?]`, notifications, caissier) conforme aux pages neuves.

## Règles tenues

- Aucune donnée métier ajoutée/retirée : seuls libellés, accents et
  composition changent ; les stats affichées restent celles calculées par l'IPC.
- Écarts volontaires : icônes `lucide-react` (pas de CDN Material Symbols —
  offline/CSP), sidebar réduite conservée, libellés KPI inchangés quand la
  donnée exacte Stitch n'existe pas (pas de chiffres inventés).

## Vérification

- `format` + `typecheck` verts, `vitest` 65 fichiers / 409 tests verts,
  `vite build` vert + `build:electron` (re-signature integrity-manifest
  obligatoire après tout `build` — sinon verdict `tampered` → `license.required`).
