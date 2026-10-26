# ADR-144 — Formulaires produit/client et saisie code-barres

- **Date** : 2026-10-26
- **Statut** : accepté
- **Contexte** : après la simplification du formulaire produit (session 47) et
  de la réception fournisseur, le propriétaire demande : calcul automatique
  pièce ↔ carton, organisation des champs produit/client, et code-barres
  toujours en majuscules même si Verr. Maj est inactif.

## Décision 1 — Prix pièce ↔ carton avec priorité au prix manuel

Nouvelle règle pure dans `src/domain/packaging/carton-price-sync.ts` :

```
prix carton = prix pièce × facteur
prix pièce  = arrondi(prix carton / facteur)   // centimes
```

Dans le formulaire produit :

- le côté **non saisi** est calculé automatiquement dès que le facteur est
  valide ;
- un prix saisi manuellement n'est **jamais** écrasé par la conversion : un
  carton à 650 DZD avec une pièce à 25 DZD reste un tarif de gros valide
  (ADR-141) ;
- changer la taille du carton recalcule le côté non manuel ;
- vider un côté vide aussi le côté dérivé, jamais un prix manuel ;
- le bouton **Recalculer** réécrit explicitement les deux prix carton depuis
  les prix pièce.

Cela évite le piège du « dernier champ gagné » qui aurait transformé la pièce
25 DZD en 21,67 DZD après saisie du carton 650 DZD, cassant le total 750 DZD
du scénario œufs.

## Décision 2 — Organisation des formulaires

- **Produit** : Identification + Stock & seuils à gauche ; Prix & coût +
  Conditionnement à droite ; options avancées repliées. Le coût d'achat est
  libellé « Coût d'achat » (livraison incluse après réception).
- **Client** : Identité & contact (nom complet, aperçu prénom/nom, téléphone),
  Adresse, Crédit & règlement, Notes repliées. Barre d'enregistrement fixe et
  `Ctrl+Entrée`, comme le produit. Les champs, libellés et `aria-label` existants
  sont conservés.

## Décision 3 — Code-barres ASCII en majuscules

- UI : `src/shared/ui/barcode-input.ts` convertit les lettres ASCII a-z en
  majuscules, sans toucher aux accents (recherche française préservée).
- Champs concernés : ajout de code-barres produit, recherche caisse, recherche
  catalogue, recherche stock, recherche produit de la réception.
- Main : `electron/ipc/handlers/barcode-text.ts` normalise aussi la valeur
  stockée (création produit, mise à jour, import CSV). Les recherches restent
  insensibles à la casse (`COLLATE NOCASE` / `LIKE`), donc les anciennes fiches
  en minuscules restent trouvables.

## Conséquences

- Aucune migration, aucun canal IPC nouveau.
- Tests : `carton-price-sync.test.ts`, `barcode-input.test.ts`,
  `barcode-lookup.test.ts` (stockage majuscule + recherche minuscule), E2E
  `barcode-uppercase.spec.ts`, E2E `carton-sale.spec.ts` rejoué (750 DZD).
- Le formulaire client et le formulaire produit restent compatibles avec les
  E2E existants (`Nom complet`, `Créer le client`, `Créer le produit`).
