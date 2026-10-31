# ADR-162 — Application propriétaire (supervision mobile lecture seule)

- **Date** : 2026-10-31
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : nouveau projet `owner/` (Expo), `tests/unit/owner-foundation.test.ts`,
  configuration racine (`eslint.config.mjs`, `.prettierignore`, `config/knip.json`,
  `package.json`). Aucune migration SQLite, aucun canal IPC, aucune donnée
  métier modifiée.

## Contexte

Le propriétaire veut superviser son magasin à distance, depuis son téléphone :
chiffre d'affaires, caisse, stock, créances, santé du système. L'APK existant
(`mobile/`) est l'application **client** (téléphone + PIN, factures, QR) et la
mirror Supabase ne contient que des clichés clients — aucun agrégat métier.

Arbitrages obtenus en discussion (2026-10-30/31) :

- application **séparée**, jamais un mode caché dans l'APK client ;
- **lecture seule stricte** (« يشوف فقط ») — aucune validation de remise, aucune
  clôture de caisse, aucune coupure d'accès depuis le téléphone ;
- **français uniquement**, sans sélecteur de langue ;
- chaque **client débiteur** avec son total, son retard, son ancienneté, son
  téléphone et les actions « Appeler / WhatsApp » ;
- **écran Stock** avec valeur, seuils et **mouvements** par produit ;
- **cadence de publication pilotée par les réglages du POS** (pas par le
  téléphone) ;
- maquettes Stitch fournies : `docs/archive/stitch_veloria_supervision_mobile/`
  (9 écrans + états), identité bleu nuit + or, filets, chiffres tabulaires.

## Décision

### 1. Projet Expo séparé

`owner/` est une application Expo autonome (`package.json`, `app.json`,
`tsconfig.json`, profil EAS `preview`), package Android `dz.veloria.owner`.
Elle reprend les fondations de l'APK client (tokens verrouillés, cache local,
police Ionicons native, kit de composants recopié en LTR) sans importer son
code : aucune porte propriétaire ne doit exister dans un binaire client.

### 2. Écrans

5 onglets + porte de connexion, plus 3 sous-écrans :

| Écran              | Contenu                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connexion          | e-mail + mot de passe, erreur FR, « mot de passe oublié », biométrie annoncée « bientôt »                                                                                                                                                   |
| Aujourd'hui        | CA net, tickets, panier moyen, marge, espèces, encaissements par mode, journal du jour, état de fraîcheur                                                                                                                                   |
| Argent             | session active (attendu/compté/écart), sessions clôturées, dépenses du mois, créances (total, retard critique, par client)                                                                                                                  |
| Stock              | valeur, références, sous seuil, ruptures, recherche + filtres, liste produit                                                                                                                                                                |
| Périodes           | 7/30 jours, CA cumulé, tickets, panier, courbe journalière, marge par catégorie, top 5                                                                                                                                                      |
| Alertes            | compteurs critiques/vigilance/conformes, stock, créances, sauvegarde + intégrité + synchro                                                                                                                                                  |
| Fiche client       | encours, plafond, dernier encaissement, ancienneté 0–30/31–60/+60, factures ouvertes, téléphone, Appeler/WhatsApp                                                                                                                           |
| Fiche produit      | disponibilité vs seuil, valeurs marchandise/PAMP, marge unitaire, dynamique 30 j, mouvements                                                                                                                                                |
| Audit des caisses  | fonds manipulés, écart net, conformité, session active, sessions clôturées filtrables                                                                                                                                                       |
| Détail transaction | vente (pièces, sous-total/remise/total, encaissement, caissier), retour (facture d'origine, motif, remboursement, imputation dette), versement (type, moyen, référence, opérateur), dépense (catégorie, bénéficiaire, règlement, référence) |

Les écrans longs sont **découpés en onglets internes** (2026-10-31) pour rester
courts à l'ouverture : Aujourd'hui (Synthèse / Opérations), Argent (Caisse /
Dépenses / Dettes — le sélecteur filtre réellement, il ne défile plus), Stock
(fiche allégée : valeur + compteurs dans une seule carte), Périodes (Ventes /
Marges / Top), Alertes (Stock / Créances / Système), fiche produit (Synthèse /
Mouvements), fiche client (Encours / Factures), audit des caisses (Synthèse /
Sessions).

Passe design v2 (2026-10-31) : montants rendus en **police système avec chiffres
tabulaires** (fin du monospace), **actualisation portée par l'en-tête global**
(plus de bandeau dédié), titres d'écran dupliqués supprimés (le bandeau porte le
libellé), **liste Stock en lignes groupées compactes** (une seule surface, filets)
et valeurs produit fusionnées en une carte « Économie ». Aucune écriture ajoutée.

Argent, Stock, Périodes et Alertes enrichis (2026-10-31) : Argent affiche la
synthèse caisse (sessions, conformité, écart net), la moyenne et le poste
principal des dépenses, et la part du portefeuille en retard critique. Stock
gagne trois onglets — Aperçu (valeur + compteurs + inventaire), Produits
(catalogue filtrable), Mouvements (flux global trié, chaque ligne ouvre la
fiche produit). Périodes affiche moyenne/jour et meilleur jour, la marge en
valeur par catégorie, et la part du CA de chaque meilleure vente. Alertes
affiche les ruptures/sous-seuil et la perte estimée, les dossiers > 60 jours et
le dernier inventaire dans Système.

Détails de transaction (2026-10-31) : chaque ligne du journal porte un
`TransactionDetail` (vente / retour / versement / dépense) ; la Synthèse affiche
la progression d'objectif et le rappel des retours, et l'onglet Opérations
propose des filtres par type et l'ouverture d'une fiche en lecture seule
(pièces, totaux, encaissement, remboursement, référence). L'état des onglets
Aujourd'hui est porté par `App` pour revenir sur Opérations après consultation.

### 3. Contrat de données

`OwnerSnapshot` v1 est une **liasse agrégée** calculée par le POS (centimes DZD),
jamais par le cloud :

- jour : CA net, retours, tickets, panier, marge, espèces, modes, journal ;
- argent : audit (fonds, écart net, conformité), session active, sessions,
  dépenses, **debtors** (une ligne par client : total, retard, ancienneté,
  dernier paiement, téléphone) ;
- stock : total, références, seuils, ruptures, **catalogue compact** (nom, ref,
  quantité, seuil, prix achat/vente) et **mouvements** (30 jours) ;
- périodes : série journalière, marges par catégorie, top articles ;
- alertes : stock, créances, système.

Les agrégats de la liasse reprennent la forme de `DashboardSummary`
(`src/features/dashboard/types.ts`) tronquée : une seule formule par chiffre,
côté POS. La cadence de publication (intervalle + à la clôture de caisse) est un
réglage POS ; l'app affiche seulement « Mis à jour il y a … ».

### 4. Sécurité et confidentialité

- Authentification **Supabase Auth** (e-mail + mot de passe), compte créé par
  l'éditeur — pas d'auto-inscription, pas de téléphone/PIN client.
- URL et clé publique **gravées dans le build** (`EXPO_PUBLIC_OWNER_*`) : aucun
  champ « endpoint » sur l'écran de connexion (protection anti-hameçonnage).
- Session en `SecureStore`, liasse en `expo-sqlite` (repli mémoire web) ; purge
  de la liasse à la déconnexion.
- Seule donnée personnelle exposée : nom + téléphone du client débiteur, dans le
  but de recouvrement — jamais dans les tables du miroir client.
- Aucun bouton d'écriture : les seules actions sont actualiser, se déconnecter,
  appeler, WhatsApp.

### 5. Aucune donnée fictive

L'application **n'embarque aucune donnée de démonstration** (décision du
2026-10-31). Sans `EXPO_PUBLIC_OWNER_SYNC_URL` / `EXPO_PUBLIC_OWNER_ANON_KEY`,
elle affiche un écran « Supervision non configurée » et n'ouvre aucun accès.
Toutes les sections vides (journal, caisse, dépenses, dettes, stock, périodes,
alertes) affichent un état vide explicite ; aucun libellé ne présente un chiffre
codé en dur (taux, version, conformité, initiales sont calculés ou issus de la
liasse). Le contrat réseau (`auth/v1/token` + `functions/v1/owner-sync`) reste
implémenté et testé avec `fetch` injecté.

### 6. Identité visuelle

Jetons repris tels quels : `#051424` (bandeau/héros), `#fbbf24` (accent unique),
`#F7F8FA`/`#FFFFFF`/`#EDF1F6`/`#F1F5F9` (surfaces), filet 1 px `#E1E7EF`,
rayons 18/14/10, cible tactile 48, chiffres tabulaires, montants
`1 234,56 DZD`. La police Plus Jakarta Sans des maquettes est remplacée par la
police système (aucun téléchargement de police en v1).

## Conséquences

- **Reste à construire** : Edge Function `owner-sync` (RLS, rôle propriétaire) ;
  use case POS `publishOwnerSnapshot` + réglages de cadence + provisionnement du
  compte propriétaire ; APK propriétaire ; déverrouillage biométrique.
- **v1.1** : ventes par vendeur, journal des opérations sensibles (remises,
  annulations, dérogations), stock mort, notifications push.
- **Portes** : `typecheck:owner` 0, eslint owner 0, `owner-foundation` 15/15,
  `typecheck` racine 0 ; bundle web Expo servi et capturé (9 écrans).
- Aucune migration, aucun canal IPC, aucune donnée financière touchée.

## Alternatives écartées

- **Mode propriétaire dans l'APK client** : mélange deux modèles d'authentification
  et exposerait une porte d'administration dans un binaire distribué aux clients.
- **Lecture directe de la base SQLite du POS** : impossible à distance, et
  contraire au principe « SQLite maître, miroir jetable » (ADR-053).
- **Calcul des finances dans le cloud** : casse la règle « une seule formule »
  et ferait diverger téléphone et bureau.
- **Actions à distance (valider une remise, clôturer une caisse)** : refusées
  explicitement par le propriétaire.
