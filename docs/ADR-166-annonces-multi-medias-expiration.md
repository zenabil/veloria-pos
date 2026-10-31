# ADR-166 — Annonces magasin multi-médias avec expiration (bandeau hero APK)

- **Date** : 2026-10-31
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : `database/migrations/0057_announcements_media_expiry.sql`,
  `src/domain/customer/client-access.ts`,
  `electron/ipc/handlers/client-access.repo.ts`, `electron/ipc/channels.ts`,
  `electron/ipc/validators.customers.ts`, `electron/ipc/registry.customers.ts`,
  `electron/ipc/staff-gates.ts`, `electron/ipc/license-gates.ts`,
  `electron/database/retention.ts`, `electron/preload/preload.ts`,
  `src/shared/types/ipc-client.ts`, `src/vite-env.d.ts`,
  Paramètres → Annonces du magasin, `mobile/src/{views,i18n}.ts`,
  `mobile/src/ui/announcement-hero.tsx`, `mobile/src/screens/Home.tsx`.
  Aucune donnée financière, aucune écriture cloud nouvelle.

## Contexte

L'annonce magasin (0032) était **une seule ligne de texte** de 120 caractères,
sans image ni échéance, remplacée à chaque enregistrement. Le propriétaire
demande un **bandeau hero en haut de l'accueil de l'application client**,
avec **jusqu'à 4 annonces**, chacune en **texte ou en image** (image hébergée
à l'extérieur, lien collé dans le POS) et un **compte à rebours d'expiration**.
La contrainte réseau impose de ne rien construire qui dépende d'une lecture
temps réel : l'APK reste alimenté par le cliché `customer_snapshot`.

## Décision

### 1. Migration 0057 — reconstruction de `announcements`

SQLite ne sait ni retirer un `NOT NULL` ni ajouter un `CHECK` : la table est
reconstruite (comme 0025/0038) en **préservant toutes les lignes** :

- `text` devient NULLable (borne 1..120 conservée quand présent) ;
- `image_url` NULLable, `CHECK` https et ≤ 500 caractères (jamais de blob) ;
- `ends_at` NULLable (les lignes historiques restent valables sans échéance) ;
- `sort` (0..99) et `updated_at` ajoutés ;
- `CHECK (text IS NOT NULL OR image_url IS NOT NULL)` : une annonce vide est
  refusée au niveau base, pas seulement à l'UI.

### 2. Domaine et repo

- Texte **ou** image obligatoire ; texte ≤ 120 ; image https ≤ 500 ;
  `ends_at` obligatoire pour toute écriture nouvelle et **strictement future**.
- **4 annonces actives non expirées maximum** (expirées ou inactives ne
  comptent pas), vérifié **dans la transaction** du repo (pas seulement UI).
- `saveAnnouncementAtomic` devient un **upsert** (`id` optionnel) idempotent
  par `operationId` ; `removeAnnouncementAtomic` est idempotent par valeur
  (rejouer une suppression déjà faite = succès) ; `listAnnouncements` sert
  l'écran Paramètres.
- Rétention : le préfixe critique devient `announcements.` (couvre save et
  remove — aucune colonne `operation_id` métier dédiée).

### 3. IPC

- `announcements.save` (schéma étendu, `operationId` requis),
  `announcements.list` (lecture), `announcements.remove`
  (`idempotentIdSchema`) ; `announcements.get` (Q1) est **supprimé** — la
  liste complète le remplace.
- Gardes inchangées : staff `settings`, licence `customers`.
- Chaque mutation appelle `enqueueAnnouncementRefresh()` : un cliché par accès
  mobile actif, best-effort (aucune poussée cloud nouvelle).

### 4. Cliché miroir

`buildSnapshotPayload` ajoute `announcements: [{ id, text, imageUrl, endsAt }]`
contenant **uniquement** les annonces actives non expirées, triées `sort` puis
`id DESC`, **bornées à 4**. Le champ historique `announcement` (premier texte
disponible) est **conservé** : les APK ≤ 1.0.4 déjà installés continuent
d'afficher une annonce, sans rien connaître du tableau.

### 5. Application client (APK)

- Bandeau hero sous la carte « dernière facture » (le bandeau dette reste le
  héros de l'écran, ADR-055), avec image (`aspectRatio` 2:1) et/ou texte et
  **compte à rebours recalculé localement** depuis `endsAt` (aucune écriture
  retour, aucune authentification nouvelle).
- Jusqu'à 4 annonces : pastilles tactiles pour passer d'une annonce à l'autre.
- Une image qui ne charge pas (lien mort, hotlink bloqué, hors ligne) retombe
  sur le texte ; sans texte, l'annonce est **masquée** — jamais de carte vide.
- `toHome` est tolérant : entrée corrompue écartée, échéance illisible =
  annonce écartée (fail-closed), repli sur le champ `announcement` historique.
- Clés i18n **ar + fr** (compte à rebours) et RTL via les primitives du kit.

## Conséquences

- Aucun changement Supabase (payload JSONB opaque), aucune dépendance nouvelle
  (`Image` de React Native, `<img>` dans le POS).
- Le nombre affiché est borné par le snapshot (4) **et** par l'APK (4) : une
  donnée cloud altérée ne peut pas allonger la page.
- L'expiration est approximative à la minute et dépend de l'horloge du
  téléphone : sans impact métier (contenu informatif, pas d'argent).
- La fiabilité des images dépend de l'hébergeur choisi ; Supabase Storage
  (bucket public) reste la recommandation, mais tout lien https direct
  fonctionne et un lien mort ne casse pas l'écran.

## Alternatives écartées

- **Écraser l'annonce unique** (comportement 0032) : pas de compte à rebours,
  pas de plafond, pas d'image.
- **Image en base64 dans le cliché** : plafond 200 Ko du cliché miroir et
  quota egress — refusé.
- **Liens Google Drive** : pages HTML, hotlink limité, URL `lh3` temporaires —
  incompatibles avec un `<Image>` stable.
- **Compteur de vues (impressions)** : exigerait une écriture APK → Supabase
  (nouvelle porte d'authentification + RLS) ; hors périmètre. Le compteur
  retenu est **l'échéance**.
- **Stockage des images dans SQLite/le dépôt** : alourdit la base et les
  sauvegardes, contraire à la source unique métier.
