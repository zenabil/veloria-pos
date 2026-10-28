# ADR-152 — Client mobile V6 « Connexion développée » (écran de login)

- **Date** : 2026-10-28
- **Statut** : accepté (direction arbitrée par le propriétaire)
- **Contexte** : après ADR-151 (V5, budget tenu), le propriétaire a demandé
  « غير تصميم واجهة login كليا » (changer complètement), puis a cherché une
  référence nommée « lempe login » — **introuvable** (web, Dribbble, Behance,
  Figma, recherche d'images : « Lempe » est un nom de famille germanique, aucun
  écran de connexion ne porte ce nom). Trois maquettes HTML ont été présentées
  (A feuille ancrée en bas / B plein clair / C bandeau or) ; l'arbitrage final a
  été : « طور التصميم الحالي » — **développer le design actuel**, donc garder
  l'identité encre + or et travailler la composition, non l'inverser.
- **Périmètre** : écran 01 + une prop optionnelle sur `Field` + une clé i18n.
  Toujours zéro dépendance, zéro migration, zéro canal, aucun autre écran touché.

## Décision 1 — Un en-tête éditorial sur l'encre, pas une carte de plus

Le lockup V5 (logo + nom + sous-titre sur 60 dp) ne disait rien. Il devient un
vrai en-tête : **salut selon l'heure** (`greeting` / `greetingEvening`, **même
règle D12 que l'accueil** — le login et l'accueil parlent pareil à la même
heure), titre « فضاء الزبون » en 26/900, puis **règle dorée 44×4**. La marque
est à bord de lecture, la langue à bord extérieur, le logo 34 reste dans le
rang du haut. Aucun dégradé (interdit depuis V4), aucune image d'ambiance.

## Décision 2 — Deux textures de saisie au lieu d'une

Le champ téléphone passe en **`skin="outlined"`** (surface blanche + `HAIRLINE`,
focus au filet or) pendant que les cases PIN restent **en creux** (`sunkenBg`).
C'est le vocabulaire des groupes de la caisse (`Group` + filet) qui entre enfin
sur l'écran de connexion, et cela sépare les deux gestes — taper un numéro,
composer un code — sans ajouter de carte imbriquée. La prop est **optionnelle
et par défaut `sunken`** : aucun autre écran de l'APK ne change de rendu.

## Décision 3 — Le QR devient un mode d'emploi, pas un deuxième bouton

Rectangle **en pointillés** (`borderStyle: "dashed"`, 58 dp), pastille d'icône,
titre 14 gras et **caption = clé `help1` déjà publiée** (« خذ رمزك من المحل » /
« Prenez votre code au magasin ») : l'instruction vit dans l'affordance, plus
dans un bloc d'aide qu'il faut déplier. Le titre est descendu de 16 à 14 gras
pour ne rivaliser ni avec l'en-tête ni avec le CTA.

## Décision 4 — Retour arrière, séparé du bouton « afficher »

Une touche `backspace` apparaît dans la rangée du PIN dès qu'un chiffre est
saisi (effacer un caractère plutôt que tout recommencer). Un **filet vertical
de 1 px** (`COLORS.divider`) la sépare du bouton « إظهار الرمز » : posés côte à
côte sans césure, les deux glyphes se lisaient comme un seul contrôle.

## Décision 5 — Du dessin dans l'encre, sans rien animer ni dégrader

Trois cercles de filet (`navyLine`, le plus interne en or à ~18 %) derrière le
rang de marque, rognés hors écran. `View` pures : **aucun nœud `Animated`** (le
pont RN de ce poste a déjà fait tomber l'APK le 2026-10-04), **aucun dégradé**
(`GRADIENTS` supprimé en V4), `pointerEvents="none"` et hors arbre
d'accessibilité.

## Ce qui ne bouge pas

Logique V5 intégralement conservée : verrou local = règle du serveur, envoi
automatique au 6ᵉ chiffre, garde `busyRef`, haptique frappe/refus, téléphone
mémorisé avec focus posé sur le code, cases hors-arbre avec un seul nœud
labellisé, aide repliée, réassurance en pied. Palette, textes et `aria-label`
existants intacts ; **une seule** clé i18n ajoutée (`deleteDigit`, ar + fr).

## Conséquences

- Fichiers : `mobile/src/screens/Login.tsx`, `mobile/src/ui/kit.tsx`
  (`Field.skin`), `mobile/src/i18n.ts` (`deleteDigit`), ce document,
  `docs/INDEX.md`, `mobile/README.md`.
- **Budget tenu** : contenu **731 px** pour un viewport de 553 (V5 : 713 px),
  soit +18 dp **alors que l'en-tête éditorial a été ajouté** — la densité
  gagnée sur le champ à filet et la zone QR a absorbé le reste. Bouton « دخول »
  à **y ≈ 408-462**, zone QR à **488-510** : les deux visibles sans scroller,
  clavier ouvert.
- Portes : `mobile` typecheck **0** · `mobile` lint **0** · vitest
  `mobile-foundation` **18/18** · `prettier` **0**.
- Preuve visuelle : captures **390×844** via Electron offscreen (`capturePage`)
  — le panneau navigateur de Qoder était masqué pendant la session — états
  0 / 5 / 6 chiffres, révélation du code, envoi automatique observé (CTA passé
  en « … »). Script de capture **hors dépôt** (scratch), non versionné.
- **Non vérifié** : rendu natif Android (aucun APK rebâti), `autoFocus` du
  champ PIN, et le `borderStyle: "dashed"` sur device (côté Yoga/Android il est
  rendu par `BorderDrawable` — fidèle sur web, à confirmer à l'œil sur téléphone).
- Hors périmètre : les trois directions A/B/C ne sont **pas** abandonnées, elles
  sont **non retenues** ce jour ; B (inversion plein clair) reste la plus
  éloignée de l'identité POS et contredit la règle « l'or = action principale ».
