# ADR-154 — Tableau de bord : une surface par famille de chiffres

- **Date** : 2026-10-28
- **Statut** : accepté
- **Contexte** : l'ADR-147 (session 52) avait hiérarchisé la page, puis l'ADR-148
  (session 53) a unifié **toutes** les interfaces autour de `StatsStrip` — sauf le
  Tableau de bord, resté sur l'empilement d'avant : bande « Aujourd'hui » (1 carte)
  - 4 cartes `Kpi` + bande `MiniMetric` (1 carte) + carte « Vigilance système »,
    soit **13 surfaces** et ≈250 px d'encadrement avant le premier graphique, pour
    11 chiffres. Vérifié sur capture réelle (`test-results/dashboard.png`, base
    vierge + une vente) : trois bandeaux empilés dont deux répètent le même
    `100,00 DZD`.

## Problèmes constatés (preuves dans le code)

1. **Doublon de primitive** : `MiniMetric` était un `StatsStrip` réécrit à la main,
   avec sa propre surface `bg-[#0f1e30]`… absente des surcharges du thème clair
   (`globals.css`, ADR-072) : quatre pavés navy sur fond blanc en thème clair.
2. **Six chiffres affichés deux fois** : `Ventes nettes`, `Dépenses`, `Dettes
fournisseurs`, `Créances clients`, `Échéances dépassées`, `Ruptures` — les
   onglets Finances/Stock répétaient ce que les bandeaux venaient de dire.
3. **Cartes dans une carte** : les trois onglets enfermaient chacun 2 à 5 `Card`
   dans le `Card` « Détails » (double filet, double fond).
4. **Période dite quatre fois** : sous-titre de page, champs `Du`/`Au`, preset
   surligné, **et** une ligne de rappel sous la barre d'outils.
5. **Défilement interne retrouvé** : `max-h-80 overflow-auto` sur le tableau des
   catégories — exactement le tord que l'ADR-147 avait corrigé ailleurs.
6. **Alertes muettes** : « 12 échéances dépassées », « 3 ruptures », « aucune
   sauvegarde » étaient du texte ; aucun chemin vers le module où l'on agit.
7. **Mur de zéros** : une période sans activité affichait 9 cartes à `0,00 DZD` et
   cinq sections « Aucune activité ».

## Décision 1 — Deux `StatsStrip`, plus de carte KPI individuelle

- **Bandeau principal (4 cellules)** : Ventes nettes · Marge brute · **Bénéfice
  net** · Trésorerie globale.
- **Bandeau secondaire (5 cellules)** : Créances clients · Dettes fournisseurs ·
  Valeur stock · Achats nets · Dépenses caisse.
- `MiniMetric` est supprimé ; `Kpi` ne reste utilisé que par `Rapports`.
- Les tons restent **conditionnels** (ADR-148) : une couleur n'apparaît que si
  elle signifie quelque chose (marge négative = rouge, créances = ambre…).
- Le **coût de revient des ventes** (`ventes − marge`) fait son apparition dans la
  sous-ligne de la marge : seul chiffre dérivé qui n'était nulle part.

## Décision 2 — « Ventes du jour » remonte dans le sous-titre de page

La ligne de période porte désormais le rythme du jour (compteur animé `useCountUp`
conservé, ADR‑147 D2) et disparaît quand aujourd'hui n'est pas dans la période
filtrée — jamais un `0` trompeur.

## Décision 3 — Bandeau « À traiter », conditionnel et cliquable

Une seule surface remplace la carte Vigilance et les deux cellules d'alerte de
« Aujourd'hui » : échéances dépassées, ruptures, articles sous le seuil, sauvegarde
absente, intégrité. Elle **n'est pas rendue** s'il n'y a rien à traiter.

Une puce n'est un bouton que si la coquille admet réellement le module cible :
`canNavigate` (nouvelle prop, câblée sur `moduleAllowed` dans `App.tsx`) tient
compte de la **licence et du rôle staff**. Sans quoi la puce reste du texte — sinon
un caissier sans droit « Dettes » aurait atterri sur `RouteBlocked`, dont le message
« non inclus dans votre licence » aurait été **faux** (ADR-038, zéro mensonge).
`onNavigate` passe donc de `(module: "sell")` à `(module: ModuleId)` ; `HistoryScreen`
suit (il n'appelle qu'avec `"sell"`).

## Décision 4 — Détails : 2 onglets, sections sans carte

L'onglet **Finances** disparaît : ses deux chiffres utiles (bénéfice net, coût) sont
dans les bandeaux, et « 5 meilleures rotations » rejoint le graphique des
catégories. Restent **Stock & dettes** (badge d'alertes) et **Activité récente**,
dont les sections ne sont rendues **que si elles ont des lignes**. Les titres de
section (`DetailSection`) remplacent les `Card` imbriquées.

## Décision 5 — Lecture des parts, pas seulement des montants

Moyens de paiement et catégories gagnent une barre de part relative (max de la
colonne). Piste en `bg-black/25`, seule teinte de piste ayant un équivalent clair.
Le `max-h-80 overflow-auto` du tableau des catégories est supprimé : la page
défile, un seul conteneur (comme l'ADR-147 l'avait décidé).

## Décision 6 — Une période vide le dit une fois

Aucune vente, aucun achat, aucun retour, aucune dépense sur la plage ⇒ un seul
`EmptyState` « Aucune activité sur la période » (le bandeau « À traiter » reste,
lui seul mérite l'attention), au lieu de neuf zéros et cinq sections vides.

## Conséquences

- **13 surfaces → 8** (barre de période, bandeau principal, bandeau secondaire,
  graphique, encaissements, catégories, rotations, détails) dont **zero carte
  dans une carte** ; ≈140 px de vertical récupérés avant le premier graphique.
- La période n'est dite qu'une fois ; aucun chiffre n'apparaît deux fois.
- Thème clair : la surface orpheline `#0f1e30` disparaît, plus de pavé sombre.
- **Aucune** migration, **aucun** canal IPC, **aucun** schéma, **aucune**
  dépendance nouvelle. Les exports PDF/Excel/CSV, l'aperçu A4, les raccourcis
  F4/F5/F8, le filtre par catégorie et le garde anti-course sont inchangés.
- `useCountUp` ne sert plus qu'au tableau de bord (une seule animation, celle du
  chiffre du jour) ; c'est voulu : l'ADR-148 avait déjà réduit le mouvement.
- Tests : `tests/e2e/dashboard-ui.spec.ts` garde ses assertions (libellés
  « Ventes nettes », « Marge brute », « Dettes », « Dernières ventes », presets
  `aria-pressed`, onglets, menu Exporter) et **ajoute** la navigation par puce
  « Aucune sauvegarde » → « Paramètres ».
