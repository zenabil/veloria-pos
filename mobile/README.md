# Mobile — APK clients Veloria (V1, lecture seule, 0 $)

5 onglets : Accueil / Factures / Paiements / **Boutique** / Compte-Magasin +
ligne « À propos » (nom, version, support WhatsApp pro, sans photo).

> ADR-182 (2026-11-11) : la règle « 5 onglets max » est levée par l'opérateur.
> L'application passe à **5 onglets** — la **Boutique** (catalogue du magasin
> publié par le POS) est le motif d'installation et le motif de retour
> hebdomadaire. Le catalogue est une **projection** : les prix viennent du
> POS, la disponibilité est un indice, la commande se valide au comptoir
> (aucune écriture financière depuis le téléphone).

Règles verrouillées :

- Lecture seule. Aucune écriture financière depuis le téléphone.
- **Catalogue (ADR-182)** : lu dans la table miroir `store_catalog` (une copie
  par magasin), mis en cache local (`expo-sqlite`) avec sa **version** — l'APK
  ne re-télécharge que si l'empreinte a changé ; une entrée corrompue est
  **écartée** (fail-closed), jamais affichée au prix faux.
- Bilingue ar/fr dès le premier écran, bascule RTL/LTR complète (voir ADR-051).
- Identité figée par les tests : encre `#051424`, primaire `#fbbf24`, cible
  tactile 48 dp, page de 20 (`tests/unit/mobile-foundation.test.ts`).
- **UI V4 « Daylight plat » (ADR-150)**, alignée sur la refonte du POS
  (ADR-148) : on sépare par un **filet** (`HAIRLINE`) et non par une ombre, une
  seule surface élevée (la feuille de reçu), un seul accent (l'or = action
  principale), statuts en point + texte teinté, listes en lignes denses
  (`Group` + `Row` + `Divider`). Les dégradés (`GRADIENTS`) et l'`expo-linear-gradient`
  sont **sortis de l'app** ; les rares élévations utilisent `boxShadow` (les
  props `shadow*` sont dépréciées depuis RN 0.76).
- **Écran de connexion V5 « Connexion directe » (ADR-151)** : toute l'action
  tient dans un écran **sans clavier** (marque en lockup, aide repliée), le
  bouton « دخول » est verrouillé tant que le code n'a pas 6 chiffres — même
  règle que le serveur, jamais plus stricte —, l'envoi se déclenche **au 6ᵉ
  chiffre**, la frappe et le refus se **ressentent** (haptique), et le dernier
  téléphone saisi est retrouvé à l'ouverture (`veloria.last-phone.v1`, jamais
  le PIN) avec le focus posé sur le code.
- **Écran de connexion V6 « Connexion développée » (ADR-152)** — identité
  conservée, composition travaillée : en-tête éditorial sur encre (salut selon
  l'**même règle que l'accueil**, titre 26, règle dorée), champ téléphone
  **à filet** (`Field skin="outlined"`) pendant que les cases PIN restent en
  creux, zone QR en **pointillés qui porte le mode d'emploi**, touche
  **retour arrière** césurée du bouton « afficher », cercles de filet dans
  l'encre (`View` pures : rien d'animé, rien de dégradé).
- Kit partagé `src/ui/` : `Tap` (scale + haptics), `haptic()`, `Card`, `Group`,
  `Divider`,
  `Row`, `Button` (`gold|ink|quiet|outline|ghost|danger|success`), `Chip`,
  `Badge`, `IconBubble`, `SectionHead`, `Amount` (Mono tabulaire), `Field`,
  `Dashed` ; `ui/nav.tsx` (dock **ancré** + `PageBar`), `ui/states.tsx`
  (`Skeleton*`, `EmptyState`). Garde type : `npm run typecheck` dans `mobile/`.
- Cache local expo-sqlite + session en SecureStore + `FlatList` paginée 20/20 +
  délai 10 s + anti-double-clic + bandeau « données du ... » quand le PC est éteint.

Dossiers réels : `src/tokens.ts`, `src/i18n.ts`, `src/screens/`, `src/ui/`,
`src/cache.ts`. Domaine pur réutilisé du POS (centimes, formatters), jamais réécrit.

## Vérification visuelle (sans émulateur)

```powershell
node scripts/demo-client-sync-server.mjs              # miroir faux : 0550123456 / 123456
# Le bundle ne grave AUCUN repli (#29) : sans ces variables, l'APK affiche le
# bandeau « non configuré » au lieu de mimer une panne réseau.
$env:EXPO_PUBLIC_SYNC_URL="http://127.0.0.1:8099"; $env:EXPO_PUBLIC_ANON_KEY="demo"
cd mobile && npx expo start --web --port 8083         # rendu react-native-web
PHONE=0550123456 PIN=123456 node scripts/e2e-mobile-shots.mjs   # test-results/e2e-loop/m-*.png
```

Pièges mesurés sur ce poste (session 59) : Metro **ne surveille pas** les
fichiers ici — il faut redémarrer le serveur après chaque modification, sinon
le bundle servi reste ancien ; et le script de captures ciblait des ancres
`phone`/`pin` qui n'existaient plus (le login rend des `aria-label` du
glossaire arabe) — corrigé en expressions insensibles à la langue.

## Fondations livrées (testées)

- `src/tokens.ts` — couleurs, Mono des montants, tailles tactiles 48 dp,
  `TYPE`/`SPACE`/`RADIUS`/`HAIRLINE`/`SIZES.dockInset`.
- `src/i18n.ts` — glossaire fermé ar (défaut, RTL) + fr (LTR).
- `src/format.ts` — centimes → groupés + دج/DZD, dates → JJ/MM/AAAA, texte WhatsApp « erreur ».
- `src/api.ts` — appel `client-sync` (fetch injecté, timeout 10 s, codes stables).
- Tests : `tests/unit/mobile-foundation.test.ts` (17) + `tests/unit/mobile-views.test.ts` (10)
  = **27 verts** (identité verrouillée, phrases complètes ar/fr, cache `kv.*`,
  en-têtes `Authorization`, `num()`/`numQty()` sécurisés).
- `package.json` + `app.json` : manifeste Expo (installation sur machine de build uniquement).

## Icônes — police embarquée (correctif 2026-10-30)

`@expo/vector-icons` charge Ionicons à l'exécution via `expo-asset` ; sur
certains Android ce chemin échoue silencieusement (toutes les icônes vides
dans l'APK release). La police est donc livrée dans les assets natifs :
`android/app/src/main/assets/fonts/Ionicons.ttf` (source `assets/fonts/Ionicons.ttf`,
déclarée dans `app.json` via le plugin `expo-font`), et `src/ui/Icon.tsx`
dessine le glyphe directement avec `fontFamily: "Ionicons"` (résolu par
`ReactFontManager`, sans `Font.loadAsync`). Ne pas les supprimer.

## Signature release (#41)

Le keystore de signature (`veloria-release.keystore`) ne vit JAMAIS à côté
du code : domicile `%USERPROFILE%\.veloria-keys\veloria-release.keystore`
(hors repo, ignoré par `*.keystore`, sauvegardé hors ligne par le vendor).
Les builds EAS (`build:apk`) utilisent les credentials EAS ; pour une
signature manuelle locale :
`apksigner sign --ks %USERPROFILE%\.veloria-keys\veloria-release.keystore …`.
Ne jamais committer ni empaqueter un `.keystore`/`.jks`.
