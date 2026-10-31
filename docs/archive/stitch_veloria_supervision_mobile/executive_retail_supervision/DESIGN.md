---
name: Executive Retail Supervision
colors:
  surface: '#f8f9fb'
  surface-dim: '#d9dadc'
  surface-bright: '#f8f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#edeef0'
  surface-container-high: '#e7e8ea'
  surface-container-highest: '#e1e2e4'
  on-surface: '#191c1e'
  on-surface-variant: '#44474c'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f3'
  outline: '#74777d'
  outline-variant: '#c4c6cd'
  surface-tint: '#515f72'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#0e1c2d'
  on-primary-container: '#778599'
  inverse-primary: '#b9c8de'
  secondary: '#795900'
  on-secondary: '#ffffff'
  secondary-container: '#ffc329'
  on-secondary-container: '#6f5100'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#2c1607'
  on-tertiary-container: '#a07c66'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e4fa'
  primary-fixed-dim: '#b9c8de'
  on-primary-fixed: '#0e1c2d'
  on-primary-fixed-variant: '#3a485a'
  secondary-fixed: '#ffdf9f'
  secondary-fixed-dim: '#f9bd22'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5c4300'
  tertiary-fixed: '#ffdcc7'
  tertiary-fixed-dim: '#e7bea5'
  on-tertiary-fixed: '#2c1607'
  on-tertiary-fixed-variant: '#5d402d'
  background: '#f8f9fb'
  on-background: '#191c1e'
  surface-variant: '#e1e2e4'
typography:
  headline-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  currency-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.02em
  currency-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-timestamp:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-badge:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

Le design system répond aux exigences de supervision décisionnelle mobile pour les propriétaires de points de vente. Conçu selon une philosophie de **lecture seule stricte** (*read-only governance*), il élimine toute ambiguïté opérationnelle, tout risque d'altération accidentelle et toute distraction visuelle.

L'esthétique fusionne un **minimalisme architectural** et une structure **corporate de haute précision** :
- **Atmosphère souveraine et posée :** Le contraste entre la surface nocturne institutionnelle (#051424) et la clarté immaculée des surfaces de consultation (#F7F8FA, #FFFFFF) confère autorité et lisibilité immédiate.
- **Rigueur financière :** La mise en avant de chiffres clés avec espacement tabulaire renforce l'exactitude comptable et l'immédiateté d'évaluation.
- **Zéro friction émotionnelle :** Absence d'effets superflus ou de skeuomorphisme décoratif ; hiérarchie stricte via des filets de 1px et des aplats tonals nets.

## Colors

La palette chromatique est rigoureusement sectorisée pour éviter la dispersion cognitive.

### Fondations chromatiques
- **Bleu nuit primaire (`#051424`) :** Utilisé pour l'en-tête persistant, les cartes héro récapitulatives et l'écran de verrouillage/connexion. Les textes sur cette surface utilisent exclusivement le blanc bleuté (`#E7EEF7`).
- **Accent or réservé (`#fbbf24`) :** Utilisé avec parcimonie pour les métriques de premier ordre (KPI suprêmes), l'indicateur temporel du jour courant et l'unique bouton primaire d'actualisation/authentification. Le texte apposé sur ce fond est obligatoirement bistre sombre (`#3A2A00`).
- **Surfaces claires :**
  - Fond global d'application : `#F7F8FA`
  - Cartes et conteneurs de données : `#FFFFFF`
  - Bandeaux tonals & sous-sections : `#EDF1F6`
  - Filtres passifs de lecture : `#F1F5F9`
- **Séparateurs structurants :** Ligne de démarcation continue 1px en `#E1E7EF`.

### Indicateurs d'état (Pastilles & Typographie teintée)
Les statuts n'utilisent jamais de fond plein agressif, mais un point rond d'état (6px ou 8px) associé à un texte teinté :
- **Succès / Nominal :** `#15803D` (vert forêt profond)
- **Alerte / Seuil d'attention :** `#B45309` (ambre dense)
- **Critique / Rupture :** `#B91C1C` (rouge carmin)

## Typography

La typographie repose sur un sans-serif moderne, optimisé pour les interfaces denses et les tableaux de bord décisionnels.

### Règles d'application
- **Nombres et devises :** Tous les montants financiers et quantités de stock appliquent obligatoirement `font-variant-numeric: tabular-nums` afin d'aligner parfaitement les colonnes numériques.
- **Format monétaire :** Format strict en monnaie locale avec séparateur d'espace pour les milliers et virgule décimale : `1 234,56 DZD`.
- **Format temporel :** Dates longues en français sans abréviation ambiguë (ex. *Mardi 24 octobre 2023*).
- **Hiérarchie de poids :** Titres et KPI monétaires utilisent un poids fort (700 à 800) pour un scan visuel instantané en mobilité. Les libellés d'accompagnement restent discrets en graisse 400 ou 500.

## Layout & Spacing

L'agencement est exclusivement dimensionné pour l'usage sur écran mobile vertical (largeurs cibles 360px à 430px) avec une navigation ergonomique à une main.

### Grille et espacements
- **Marge d'écran latérale :** `16px` fixes sur les bords gauche et droit du canevas mobile.
- **Grille :** 1 colonne modulaire continue ou grille 2 colonnes avec gouttières de `12px` pour la confrontation de KPI (ex. Recettes vs Dépenses).
- **Cibles tactiles :** Hauteur et largeur d'interaction minimales de `48px` pour chaque élément cliquable (onglets, filtres de plage temporelle, bouton d'actualisation).
- **Rythme vertical :** Séparation inter-cartes standardisée à `12px` ou `16px` pour maximiser la densité d'information sans étouffer la lecture.

## Elevation & Depth

Le design system rejette toute ombre portée classique (`box-shadow: none`) au profit d'un modèle **architectural flat structuré par la surface et la bordure**.

### Principes de profondeur
- **Zéro ombre :** Aucun flou ni diffusion sous les cartes, modales ou boutons.
- **Bordures de découpe :** La délimitation spatiale est assurée exclusivement par un filet périmétrique continu de `1px` en `#E1E7EF`.
- **Superposition de plans tonals :**
  - *Niveau 0 (Toile de fond) :* `#F7F8FA`.
  - *Niveau 1 (Cartes de données) :* `#FFFFFF` avec bordure `1px solid #E1E7EF`.
  - *Niveau 2 (Bandeaux d'analyse / sous-groupes) :* Encarts internes posés sur fond `#EDF1F6` sans bordure additionnelle.
  - *Niveau 3 (En-tête et Héro) :* Bloc sombre plein `#051424` offrant un contraste absolu d'ancrage en haut d'écran.

## Shapes

La géométrie des angles suit une échelle hiérarchique proportionnelle stricte :
- **Grand conteneur & Cartes principales :** Rayon fixe de `18px`.
- **Composants interactifs & Boutons de rafraîchissement :** Rayon fixe de `14px`.
- **Éléments internes, tags, puces et sous-blocs :** Rayon fixe de `10px`.
- **Indicateurs d'état :** Formes circulaires parfaites (`rounded-full`, 50%).

## Components

L'ensemble des composants respecte la directive stricte : **aucune saisie de données, aucune édition, affichage informatif et décisionnel uniquement**.

### 1. En-tête de supervision (Persistent Hero Header)
- **Fond :** `#051424` avec texte `#E7EEF7`.
- **Contenu :** Nom du magasin en `headline-md`, suivi de la date du jour en toutes lettres françaises.
- **Puce de fraîcheur des données :** Pastille circulaire verte `#15803D` de 8px accompagnée du texte `Mis à jour il y a 12 min` en typographie `label-timestamp` avec fond translucide sombre (`rgba(231, 238, 247, 0.1)`), rayon `10px`.

### 2. Cartes de KPI (Metric Cards)
- **Fond :** `#FFFFFF`, bordure `1px solid #E1E7EF`, rayon `18px`, padding `16px`.
- **Structure :** Libellé supérieur discret en `body-sm`, montant mis en exergue en `currency-hero` ou `currency-md` avec chiffres tabulaires.
- **Badge d'évolution :** Indicateur d'état (vert ou rouge) positionné à droite de la valeur, encapsulé dans un fond doux avec bordure tonale.

### 3. Boutons d'action passive
- **Bouton d'actualisation / Reconnexion :** Fond or `#fbbf24`, texte bistre sombre `#3A2A00` en graisse 700, rayon `14px`, hauteur minimale `48px`. 
- **Sélecteurs de période passifs (Chips de lecture) :** Fond `#EDF1F6` (inactif) ou `#051424` (sélectionné avec texte blanc), rayon `10px`, hauteur tactile `48px`.

### 4. Listes d'opérations & Journaux de vente
- **Fond :** Cartes segmentées avec séparateur interne `1px solid #E1E7EF`.
- **Ligne de transaction :** Heure, libellé de vente ou référence d'article à gauche ; montant au format `1 234,56 DZD` en graisse 700 à droite.
- **Interdiction :** Aucun bouton de suppression, d'édition ou de glisser pour supprimer (*swipe to delete*).

### 5. Indicateurs de statut & Alertes de stock
- **Composant StatusDot :** Cercle de 8px de diamètre (`#15803D`, `#B45309`, `#B91C1C`).
- **Composant AlertBanner :** Bandeau tonal `#EDF1F6` bordé à gauche par une ligne de 4px reprenant la couleur critique du statut, texte descriptif en lecture seule.

### 6. Barre de navigation inférieure (Tab Bar 5 onglets)
- **Fond :** `#FFFFFF` surmonté d'un filet supérieur de `1px solid #E1E7EF`.
- **Onglets (5) :** *Aujourd'hui*, *Argent*, *Stock*, *Périodes*, *Alertes*.
- **État actif :** Pictogramme et libellé teintés en or `#fbbf24` (ou bleu nuit `#051424` surligné d'un point or).
- **État inactif :** Teinte neutre atténuée `#64748B`. Hauteur globale 64px avec zone tactile garantie supérieure à `48px`.