# ADR-151 — Client mobile V5 « Connexion directe » (écran de login)

- **Date** : 2026-10-28
- **Statut** : accepté (périmètre tranché par le propriétaire : « واجهة فقط بدون
  أي مكتبة جديدة » — interface seule, zéro dépendance nouvelle)
- **Contexte** : demande « قم بتطوير واجهة صفحة login الخاصة بتطبيق العملاء »
  avec recherche internet préalable. Les patterns 2026 qui ressortent pour un
  écran de connexion mobile sont : reconnaître l'utilisateur qui revient et le
  mettre en un tap, valider la forme **avant** d'appeler le réseau, envoyer
  automatiquement quand le code est complet, confirmer la frappe par le toucher,
  et ne jamais laisser l'action principale sous la ligne de flottaison.
  L'écran V4 (ADR-150) faisait l'inverse sur trois points : ~800 dp de haut
  (le bouton « دخول » disparaissait dès l'ouverture du clavier), CTA actif alors
  que le miroir rejetait la forme (aller-retour perdu + compteur d'échecs
  poussé par le POS), et un premier venu comme un client connu voyaient la
  même écran.
- **Périmètre** : écran 01 + deux clés i18n + une préférence locale. Aucune
  dépendance ajoutée (`expo-haptics` était déjà au package), aucune migration,
  aucun canal IPC, aucun appel réseau nouveau, aucun autre écran touché.

## Décision 1 — Le budget de l'écran est une hauteur SANS clavier

- Marque en **lockup horizontal** (logo 60 + nom + « فضاء الزبون » sur une
  ligne) au lieu de la pile verticale : −100 dp.
- Aide « première connexion » **repliée** par défaut (range un `Tap` à chevron,
  les 3 étapes ne s'affichent qu'à la demande) : −160 dp.
- La réassurance « سريع ومحمي » descend en **pied de page** ; « طلب رمز عبر
  واتساب » devient un **lien souligné** et non un troisième bouton : le CTA
  doré reste la seule chose dorée de la feuille.
- Mesure dans le Chromium de Qoder (`expo start --web`, viewport 360×553, pire
  cas) : contenu **713 px**, bouton « دخول » à **y ≈ 400-460** → formulaire,
  code et action principale visibles sans scroller, clavier ouvert ou non.

## Décision 2 — Verrou local = règle du serveur, jamais plus strict

`canSubmit` = téléphone d'au moins un chiffre **et** PIN de 6 chiffres :
exactement `assertCredentials` (`mobile/src/api.ts`) et la garde de
`client-sync`. Volontairement, **aucune** règle « numéro algérien = 10 chiffres
» n'est inventée ici : elle bloquerait un numéro pourtant validé au comptoir.

- Ligne de guidage « أكمل الرمز (6 أرقام) » sur un **emplacement réservé** de
  16 dp : le CTA ne saute pas quand le code s'allonge.
- **Envoi automatique au 6ᵉ chiffre**, différé d'un battement (140 ms) pour
  laisser la dernière case se peindre ; timer annulé au démontage ; la garde
  anti double-envoi `busyRef` du V4 est conservée et partagée avec l'envoi
  manuel et l'envoi par QR.
- Jeton léger (`haptic("light")`) à chaque chiffre **ajouté** ; vibration
  d'alerte (`haptic("warning")`) quand le serveur oppose un refus.

## Décision 3 — Le téléphone mémorisé est une préférence d'écran

`veloria.last-phone.v1` dans SecureStore, **conservé à la déconnexion** comme
`veloria.endpoint.v1` (purgeable par `clearCache()` : non, et c'est voulu —
sinon la fonctionnalité disparaît à chaque logout). Le **PIN n'est jamais**
mémorisé de cette façon : `saveLastPhone(phone)` ne prend que le téléphone, et
une valeur vide ou > 30 caractères est refusée sans écraser ce qui est stocké
(test ajouté). Un client qui revient trouve son numéro déjà en place, le
clavier numérique ouvert **sur le code**, et un « × » pour le changer.

## Décision 4 — Vocabulaire V4 conservé, additions seules

Aucun texte, aucun `aria-label`, aucun `testID` existant n'est supprimé ou
renommé ; deux clés seulement sont ajoutées (`pinIncomplete`, `changeNumber`),
avec ar **et** fr (glossaire fermé ADR-051). Surfaces plates, filets, un seul
accent : la V4 n'est pas démentie, elle est resserrée.

- Le champ qui capte le clavier est posé **par-dessus** les cases (`opacity: 0`
  en absolu) au lieu d'être un `Tap` englobant : un tap n'importe où sur la
  rangée le met sous focus, et l'arbre n'a plus qu'un seul nœud labellisé.
- Les cases deviennent hors-arbre (`accessibilityElementsHidden` +
  `importantForAccessibility="no"`) : elles ne sont que du dessin.
- Une case active vide porte un **caret doré** de 2 dp : « où je tape » ne se
  devine plus, il se voit. Chiffres en `FONTS.mono` (jamais de gigue).

## Décision 5 — Alignement au bord de LECTURE, pas au bord extérieur

`farEdge()` pousse vers le bord opposé de l'écran : correct pour une valeur en
bout de ligne `space-between`, faux pour un texte d'aide ou un libellé replié
qui, en arabe, se retrouvaient détachés de l'icône qui les introduit. Une
constante locale `startEdge` (droite en arabe, gauche en français) les recolle
à leur icône.

## Décisions écartées

- **Biométrie en un tap** (`expo-local-authentication`) : nouvelle dépendance
  native + ADR propre + rebuild APK + verrou biométrique posé sur le PIN déjà
  stocké en SecureStore. Le propriétaire a tranché pour l'interface seule.
- **Secousse animée** sur refus : le pont RN de ce poste a déjà fait tomber
  l'APK en 2026-10-04 (`Animated.Value` dans `transform` reçu natif comme
  `ReadableNativeMap`). Haptique + filet + bannière, aucun nœud animé.
- **Cases PIN en LTR forcé** : un code chiffré est une suite LTR au sens bidi,
  donc « 123456 » révélé se lit « 654321 » de gauche à droite quand les cases
  se remplissent depuis la droite. Comportement V4 **conservé** (déjà livré et
  approuvé), question posée au propriétaire plutôt que tranchée en silence.
- **Compte à rebours de verrouillage** à même l'écran : `client-sync` ne
  renvoie pas `locked_until` (lecture seule, les compteurs sont poussés par le
  POS). Afficher un temps restant serait le mentir.

## Conséquences

- Fichiers : `mobile/src/screens/Login.tsx` (réécrit), `mobile/src/ui/kit.tsx`
  (`haptic` exporté, `buzz` inchangé de comportement), `mobile/src/cache.ts`
  (`loadLastPhone`/`saveLastPhone`), `mobile/src/i18n.ts` (2 clés),
  `mobile/src/App.tsx` (chargement au boot, écriture après succès, prop
  `rememberedPhone`), `tests/unit/mobile-foundation.test.ts` (+1 test).
- Portes : `mobile` typecheck **0** · `mobile` lint **0** · vitest mobile
  **29/29** · `prettier --check` **0** sur les six fichiers.
- Preuve visuelle : `expo start --web` + Chromium 360×553 — états arabe et
  français, code vide / 4 chiffres / 6 chiffres, cases révélées, aide dépliée,
  et erreur « hors connexion » **déclenchée par l'envoi automatique** (POST
  réel vers le miroir local `:8099` refusé, seul message console de la page).
- **Non vérifié** : rendu natif Android (aucun APK rebâti dans cette session) —
  en particulier `autoFocus` du champ PIN, le clavier ne s'ouvre pas sur web.
- Hors périmètre : aucun autre écran, aucun changement de flux (PIN, QR,
  WhatsApp), aucune règle métier, aucune migration.
