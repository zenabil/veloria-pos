# Mobile — APK clients Veloria (V1, lecture seule, 0 $)

5 onglets max : Accueil / Factures / Paiements / Compte-Magasin + ligne « À propos » (nom, version, support WhatsApp pro, sans photo).

Règles verrouillées :

- Lecture seule. Aucune écriture financière depuis le téléphone.
- Bilingue ar/fr dès le premier écran, bascule RTL/LTR complète (voir ADR-051).
- Header sombre `#051424` + contenu clair `#F6F7F9`, cartes blanches, primaire `#fbbf24`, montants en Mono comme le ticket.
- UI V3 « Veloria Fintech » (ADR-055) : design tokens (`TYPE`/`SPACE`/`GRADIENTS`/`SHADOW`), kit partagé `src/ui/` (Tap animé + haptics, Card, Button, Chip, Badge, Skeleton, EmptyState, TabBar, PageBar), icônes `@expo/vector-icons`, dégradés `expo-linear-gradient`. Garde type : `npx tsc -p mobile/tsconfig.json --noEmit`.
- Cache local expo-sqlite + token en SecureStore + listes FlashList paginées 20/20 + délai 10 s + anti-double-clic + bandeau « données du ... » quand le PC est éteint.

Dossiers prévus : `tokens/`, `i18n/`, `screens/`, `cache/`.
Domaine pur réutilisé tel quel depuis le POS (`money`, `debt-rules`, formatters), jamais réécrit.

## Fondations livrées (testées, sans émulateur)

- `src/tokens.ts` — couleurs, police Mono des montants, tailles tactiles 48dp.
- `src/i18n.ts` — glossaire fermé ar (défaut, RTL) + fr (LTR).
- `src/format.ts` — centimes → groupés + دج/DZD, dates → JJ/MM/AAAA, texte WhatsApp « erreur ».
- `src/api.ts` — appel `client-sync` (fetch injecté, timeout 10 s, codes stables).
- Tests : `tests/unit/mobile-foundation.test.ts` (17 tests verts) + `tests/unit/mobile-views.test.ts` (8 tests verts) — soit 25 tests verts (tokens V3, i18n phrases complètes ar/fr, cache `kv.*`, en-têtes `Authorization`, `num()` sécurisé).
- `package.json` + `app.json` : manifeste Expo (installation sur machine de build uniquement).

Prochaine tranche : `src/screens/` (5 onglets) + cache SecureStore/expo-sqlite.
