# ADR-146 — Studio d'impression : espace de travail unifié

- **Date** : 2026-10-27
- **Statut** : accepté
- **Contexte** : la page Impression empilait trois cartes concurrentes —
  imprimante, gestion des modèles, réglages — puis l'aperçu. Les actions de
  modèle occupaient deux rangées de boutons, les réglages formaient une longue
  liste de cases à cocher, et l'aperçu n'indiquait pas son état de mise à jour.
  Le propriétaire demande de simplifier et développer cette page.

## Décision 1 — Tabs document en haut, résumé du modèle actif

Six onglets (ticket 58/80, devis A4, bon de livraison, reçu, bon de retour,
étiquettes) deviennent une barre de tabs avec icônes et indicateur actif. La
barre affiche à droite le **modèle actif** et sa version (ou « À créer »). Le
changement de document recharge les modèles et l'aperçu.

## Décision 2 — Gestion des modèles dans une colonne dédiée

La carte « Modèles du document » devient un panneau de gestion :

- liste scrollable des modèles avec badges **Actif**, **usine** et version ;
- nom du modèle, statut **À jour / Modifié** ;
- Enregistrer (primaire), Activer, Dupliquer, Supprimer, Restaurer l'usine ;
- Import/Export JSON ;
- carte imprimante conservée sous le panneau.

Les actions destructives restent désactivées pour le modèle actif ou d'usine.

## Décision 3 — Réglages en groupes repliables

`TemplateSettingsPanel` conserve la matrice de capacités du domaine mais
présente les réglages en cinq groupes :

1. Papier & exemplaires ;
2. En-tête & identité ;
3. Montants ;
4. Codes & étiquettes (replié par défaut) ;
5. Signatures & mentions (replié par défaut).

Chaque en-tête affiche un résumé (papier, exemplaires, états activé/désactivé).
Les cases à cocher brutes sont remplacées par le `Switch` du produit et les
libellés/`aria-label` existants sont conservés.

## Décision 4 — Aperçu avec état explicite

L'aperçu devient une carte collante :

- badge **Mise à jour… / À jour** (séquence anti-réponse périmée) ;
- note de format (A4 devis, thermique ticket/étiquettes) ;
- iframe ou texte 80 mm ;
- bouton **Impression test** séparé de l'enregistrement du modèle.

## Conséquences

- Aucune migration, aucun canal IPC, aucun schéma.
- Les capacités du domaine et les canaux `templates.*` restent la source de
  vérité ; l'UI ne fait que les présenter.
- Tests : nouveau E2E `print-studio.spec.ts` (tabs, papier A4, groupe replié,
  renommage + sauvegarde, aperçu) ; `component-smoke` et `navigation-smoke`
  couvrent le rendu du module ; `c6-studio` reste vert.
- Capture de contrôle : `test-results/print-studio.png`.
