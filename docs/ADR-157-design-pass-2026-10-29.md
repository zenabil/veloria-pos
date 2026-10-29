# ADR-157 — Développement des interfaces 2026-10-29 : hiérarchie, densité et cohérence

- **Date** : 2026-10-29
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : renderer uniquement (`src/`). Aucun changement de domaine, de
  canal IPC, de migration SQLite ni de règle métier. Toutes les étiquettes,
  rôles ARIA et textes utilisés par les tests E2E sont conservés.

## Contexte

Le propriétaire a demandé de développer le design de 19 surfaces, dans un ordre
strict (navigation → tableau de bord → caisse → catalogue et formulaire →
clients et formulaire → stock et réception → fournisseurs et formulaire →
historique → rapports → zakat → dettes → retours et nouveau retour → paramètres
→ licence). Le choix retenu est d'**approfondir l'identité existante**
(Stitch Industrial Dark, ADR-033/035/036) plutôt que de la remplacer.

La base était fonctionnelle mais hétérogène : cartes très plates, en-têtes de
pages de tailles différentes, barres de filtres sans repère, registres sans
repères visuels de tiers, formulaires à largeur fixe 680 px, plusieurs
`bg-black/20` incompatibles avec le thème clair (ADR-072).

## Décisions

### 1. Socle visuel partagé (une seule fois pour toutes les pages)

- **Cartes** : profondeur discrète (`inset` haut + ombre basse) sans changer le
  fond `#101f31` (déjà couvert par le thème clair).
- **`PageHeader`** : sur-titre avec point ambre, H1 24 px semi-gras, période
  en 12 px ; actions toujours à droite.
- **`StatsStrip`** : filet de teinte supérieur par cellule (ambre/vert/rouge/
  bleu), chiffres mono 19 px, sous-titre aligné.
- **`Kpi`** : rail latéral coloré, valeur 22 px.
- **`FormSection`** : icône cerclée 28 px, titre 11 px, `hint` à droite,
  support d'une action (réutilisé par produit/client/fournisseur/réception/
  zakat/retours), fond `bg-black/25` compatible thème clair.
- **Survol des registres** : règle globale `main table tbody tr:hover`
  (sombre + clair) au lieu de 11 variantes locales.
- **Mouvement** : entrée de module 180 ms (`veloria-page-in`), déjà neutralisée
  par `prefers-reduced-motion`.

### 2. Motifs par type de page

- **Registres** (catalogue, clients, stock, fournisseurs, historique, dettes,
  retours) : barre de filtres groupée avec repère « Filtres », exports séparés,
  sélection multiple unifiée (jeton + action + désélection), en-tête de table
  collant avec filet, jeton de tiers (initiale), information secondaire
  (unité/seuil, réceptions, facture d'origine), jauge de recouvrement/retour.
- **Formulaires** : modales 960 px (`extraWide`) pour les fiches produit,
  client, fournisseur, réception, retour, zakat ; en-tête avec icône ; rappel
  « seul le nom est obligatoire » ; pied collant avec `Ctrl+Entrée`.
- **Caisse** : recherche et client à hauteur égale (52 px), scanner vivant,
  résultat actif à rail ambre, fiche client condensée (avatar, solde, plafond,
  actions), onglets paniers hiérarchisés, panier vide avec raccourcis réels,
  total en chiffre héros et encaissement explicite (F10).
- **Rapports / zakat / licence** : lecture analytique en deux volets, périodes
  et rubriques en segments avec état actif, résultat net en chiffre héros,
  référentiel Nisab/Taux/Hawl en trois repères, page licence en deux volets
  (poste + certificat) avec guide d'activation en trois étapes.

### 3. Navigation

- Barre latérale : bloc de marque, recherche, groupes avec filet, tuiles
  d'icônes, rail ambre sur l'élément actif, dégradé de fin de liste.
- Bandeau : licence, santé SQLite, horloge empilée, avatar opérateur,
  déconnexion compacte.
- Paramètres : navigation locale avec rail actif, en-tête collant compatible
  thème clair, puces de sous-navigation.

## Contraintes respectées

- Règle 2 : aucun import Electron/Node/SQLite ajouté côté renderer.
- Règle 6 : interface 100 % française ; aucun message technique brut ajouté.
- Thème clair : les nouveaux fonds utilisent `bg-black/25` ou des couleurs
  déjà surchargées ; `bg-[#122131]/95` et `bg-[#0b1a2b]/95` reçoivent une
  surcharge claire.
- Tests : libellés, rôles et noms accessibles conservés. Deux libellés de
  données corrigés : « Fournisseurs actifs » (la requête compte `is_active`,
  pas les comptes endettés) et suppression d'un « Client #id » erroné sur les
  retours (`entity_id` y est l'identifiant du retour).

## Portes

`npm run format:check` · `npm run lint` · `npm run check` (renderer, main,
manager, mobile) · `npm test` (**169 fichiers / 1 146 tests**) · `npm run
verify` (migrations, domaine, FR, encodage, perf, secret-scan) · E2E : vente
comptant, retour client comptant, retour client crédit, navigation paramètres.

## Limites

- Les captures de vérification ont été prises sur base vierge (données de
  démonstration créées par l'interface) ; aucun jeu de données de production
  n'a été utilisé.
- Les tiroirs de détail non listés (produit, client, fournisseur, stock,
  dette, retour, historique) héritent des primitives mais n'ont pas été
  restructurés en profondeur.
- `npm run package:win` reste à rejouer (dette session 65, scanner EBUSY).
