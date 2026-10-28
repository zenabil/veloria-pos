# Mobile — APK clients Veloria (V1, lecture seule, 0 $)

5 onglets max : Accueil / Factures / Paiements / Compte-Magasin + ligne « À propos » (nom, version, support WhatsApp pro, sans photo).

Règles verrouillées :

- Lecture seule. Aucune écriture financière depuis le téléphone.
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
- Kit partagé `src/ui/` : `Tap` (scale + haptics), `Card`, `Group`, `Divider`,
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

## Signature release (#41)

Le keystore de signature (`veloria-release.keystore`) ne vit JAMAIS à côté
du code : domicile `%USERPROFILE%\.veloria-keys\veloria-release.keystore`
(hors repo, ignoré par `*.keystore`, sauvegardé hors ligne par le vendor).
Les builds EAS (`build:apk`) utilisent les credentials EAS ; pour une
signature manuelle locale :
`apksigner sign --ks %USERPROFILE%\.veloria-keys\veloria-release.keystore …`.
Ne jamais committer ni empaqueter un `.keystore`/`.jks`.
