# ADR-NEW — Frontieres d execution : POS master, Manager outil, APK lecture seule, Cloud miroir

## Contexte

Le depot heberge 4 perimetres : POS (`src/`, `electron/`, `database/`),
outil vendor (`license-manager/`), client mobile (`mobile/`), miroir
(`cloud/supabase/`). Sans frontieres explicites, le risque est : second master
SQLite, logique metier dupliquee (money, license, sync), sync bidirectionnelle,
secrets vendor embarques. Regles meres : AGENTS.md 1 (SQLite seule verite),
2 (renderer isole via `window.veloria`), 9 (natif documente, runtime verifie).

## Decision (matrice des frontieres)

| Perimetre    | Role                                              | Donnees                                                                   | Interdits                                                                         |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| POS          | MASTER unique, SQLite `Veloria POS DB.sqlite`     | Ventes, paiements, stock, clients, centimes + `operationId`               | Aucun import depuis `mobile/` ni `license-manager/`                               |
| Manager      | Outil vendor separe (2e app Electron)             | Registre licences `license-manager.sqlite`, jamais la base POS            | Aucune logique vente/stock/money ; ne touche jamais la DB POS                     |
| Mobile (APK) | Client lecture seule (exception bilingue ADR-051) | Cache kv + SecureStore (session, cliches, `syncedAt`) avec bandeau perime | Aucune creation vente/paiement, aucun `better-sqlite3` POS, aucun sync retour     |
| Cloud        | Miroir JETABLE Postgres (ADR-053)                 | Cliches prets (centimes) par `operation_id` UNIQUE, RLS refus total       | Aucun calcul finance, aucune ecriture metier, lecture via Edge `client-sync` seul |

```
[POS SQLite master] --outbox(operation_id)--> [Cloud miroir] --Edge client-sync--> [APK lecture seule]
[POS protocol/hash/fr-map] <--contrat source unique-- [Manager outil vendor]
[Manager .vlic signe] --> [POS verification cle publique seule]
```

## Exceptions tolerees (contrats, pas logique metier)

1. `license-manager/signing.ts:20` importe `electron/licensing/protocol`
   (produit, schema, `signPayload`, `encodeVlic`) : copie unique du contrat
   crypto, pas de duplication.
2. `license-manager/main/integrity-check.ts:12` importe `electron/licensing/hash`
   (`sha256File`) : utilitaire unique, pas de logique metier.
3. `license-manager/renderer/App.tsx:6` importe `src/shared/errors/fr-map`
   (`frError`) : carte FR unique.
4. `mobile/src/format.ts` duplique l affichage centimes : duplication
   volontaire documentee (ADR-051/052, STRUCTURE 2026), toolchain Expo separee.

## Secrets hors build (preuve)

- `private/` gitignore, jamais empaquete (`electron-builder.yml` : seuls
  `dist*`, `node_modules` ciblés, `resources/license/public.key`).
- `npm run license:scan` vert : 1041 fichiers, aucun secret/bypass/map.
- La cle PRIVEE vit en `userData/keys` ou `private/vendor-keys/` (machine
  vendor) ; le POS embarque la PUBLIQUE seule (fail-closed).

## Verifications

- `npm run license:scan` = PASS.
- `grep from.*mobile|license-manager` dans `src` = vide ; dans `electron` = vide.
- Imports inverses limite aux 3 contrats ci-dessus, zero logique metier.
- `npm run typecheck` = PASS (posttypecheck : manifeste signe, 146 fichiers).
- `cloud/supabase/schema.sql` : miroir disposable, CHECK des kinds miroir du
  POS ; `rls.sql` : refus total, lecture Edge `service_role` seul.
