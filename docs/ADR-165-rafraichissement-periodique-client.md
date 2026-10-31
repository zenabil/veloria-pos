# ADR-165 — Rafraîchissement périodique du client Android selon la cadence POS

- **Date** : 2026-10-31
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : POS main (`buildSnapshotPayload`), mobile (`views.ts`,
  `App.tsx`), tests. Aucune migration SQLite, aucun canal IPC, aucun
  changement Supabase (la fonction Edge renvoie le cliché tel quel).

## Contexte

Le POS pousse ses clichés vers Supabase selon la cadence choisie dans
`Paramètres → Miroir Android` (`intervalMinutes`, 5–1440). L'APK, lui, ne
lisait les clichés qu'à l'ouverture ou au tirer-pour-rafraîchir : une annonce
ou un solde modifié côté POS n'apparaissait qu'après une action manuelle sur
le téléphone. La demande propriétaire : « la synchronisation avec l'app
client doit être automatique selon le temps choisi dans POS ».

## Décision

### 1. La cadence voyage dans le cliché

`buildSnapshotPayload` ajoute `syncIntervalMinutes` à la base commune de tous
les clichés. La valeur est lue dans `app_settings.client_sync` (déjà stockée
côté main), bornée 5–1440, défaut **15** si le réglage est absent/illisible.
Aucune donnée sensible n'est ajoutée (l'intervalle est public).

### 2. L'APK relit la cadence et rafraîchit tout seul

- `toHome` expose `syncIntervalMinutes` (même borne, défaut 15 pour les
  anciens clichés sans le champ).
- `App.tsx` démarre un `setInterval` quand une session existe :
  `syncIntervalMinutes × 60 000`, puis appelle le même `refresh()` que le
  tirer-pour-rafraîchir.
- **Un seul `syncNow` à la fois** (`refreshingRef`) : timer et geste ne se
  doublent pas.
- Le timer est recréé quand la cadence change (nouveau cliché) — pas besoin
  de redémarrer l'APK.
- Retour au premier plan (`AppState = active`) : rafraîchissement immédiat,
  car Android peut suspendre les timers en arrière-plan.
- Aucun service d'arrière-plan, aucune notification push : la lecture se fait
  tant que le processus de l'app vit ; au pire, au retour au premier plan.

### 3. Version et compatibilité

Le client conserve `versionName 1.0.4` mais passe à **`versionCode 6`**
(l'APK précédent était code 5) : Android accepte la mise à jour par-dessus,
même package et même keystore, données SecureStore/SQLite conservées. Le POS
reste 1.0.4 et doit être réinstallé pour envoyer le nouveau champ.

### 4. Comportement en cas d'échec

Inchangé : refus d'accès (PIN changé/révoqué/verrouillé) → session effacée et
écran de connexion ; réseau/serveur indisponible → la copie locale reste
affichée avec l'indicateur « données locales ». Le timer continue à la cadence
suivante, sans boucle de retry agressive.

## Conséquences

- Une annonce ou un solde mis à jour côté POS apparaît sur le téléphone au
  plus tard après la cadence choisie (5 min dans la configuration actuelle),
  sans action de l'utilisateur, tant que l'app est ouverte ou au retour au
  premier plan.
- Coût réseau : un `client-sync` par intervalle et par appareil ; la fonction
  Edge reste en lecture seule.
- Le champ n'arrive qu'avec le prochain `customer_snapshot` : avant cela,
  l'app utilise 15 min par défaut. Un enregistrement d'annonce ou une vente
  suffit à publier le nouveau snapshot.

## Alternatives écartées

- **Intervalle fixe dans l'APK** : ignore le réglage POS, risque de spam ou de
  retard.
- **WorkManager / service Android en arrière-plan** : dépendance native,
  politique batterie, et le client est déjà ouvert au comptoir ; hors
  périmètre.
- **Push FCM** : nécessite un projet Firebase, des jetons et un publieur
  côté POS ; surdimensionné pour un rafraîchissement périodique.
- **Edge Function qui pousse au téléphone** : Supabase n'héberge pas de push
  vers l'APK sans FCM.

## Tests

- `tests/unit/mobile-views.test.ts` : borne 5–1440 et défaut 15.
- `tests/integration/client-sync-queue.test.ts` : le snapshot poussé contient
  `syncIntervalMinutes` (5) et l'annonce.
- Typecheck mobile/electron/racine, ESLint, Prettier, suite complète.
