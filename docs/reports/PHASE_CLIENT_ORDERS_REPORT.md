# PHASE_CLIENT_ORDERS_REPORT — Commandes de produits depuis l'application client

Date : 2026-11-11 · Branche : `feat/client-orders` · ADR : `ADR-182`
Objectif commercial : **augmenter le nombre d'utilisateurs** de l'application
client. Objectif technique : faire du téléphone un **outil de commande**,
sans jamais écrire de donnée financière hors de SQLite.

État : **tranche A livrée** (catalogue publié + onglet « Boutique »).
Tranches **B → F** : plan ci-dessous.

---

## 1. Ce qui ne bouge pas (invariants)

| Invariant                                            | Origine          | Conséquence pratique                                                                                                                 |
| ---------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SQLite est le **seul** master                        | ADR-053          | Le cloud ne porte qu'un **transport** (catalogue, intention de commande, état). Jamais une vente, jamais un stock, jamais une dette. |
| Argent = **centimes DZD entiers**                    | règle 4          | Panier, totaux, message WhatsApp : entiers. Aucun `Number()` sur une saisie.                                                         |
| Toute mutation = **une transaction + `operationId`** | règle 4          | Idempotence : un rejeu ne duplique ni une commande ni une vente.                                                                     |
| **Aucune écriture financière depuis le téléphone**   | ADR-182 §1       | Le téléphone ne fait que _demander_. La vente naît au comptoir.                                                                      |
| Le `CHECK` `sync_outbox.kind` est **immuable**       | migration 0032   | Aucun nouveau type de cliché : l'état de commande revient dans `customer_snapshot.orders[]` (champ, pas kind).                       |
| UI **français intégral** côté POS ; APK **ar/fr**    | règle 6, ADR-051 | Le APK est l'exception bilingue assumée.                                                                                             |
| Toute garde doit **pouvoir échouer**                 | ADR-120          | Chaque tranche livre son test rouge **avant** le correctif.                                                                          |

---

## 2. Architecture cible (vue d'ensemble)

```
APK client                         POS (SQLite master)                Supabase (miroir)
┌───────────────────────┐          ┌────────────────────────┐         ┌──────────────────────┐
│ Boutique (catalogue)  │◄─────────│ produits (prix, actif) │────────►│ store_catalog        │
│ Panier (local)        │          │ client_orders (0063)   │         │ client_payloads      │
│ Commande → WhatsApp   │          │ client_order_lines     │         │  └ customer_snapshot │
│ (pas d'écriture)      │          │ + sale_id (vente liée)  │         │     └ orders[]  (D)   │
└───────────────────────┘          │ compteur d'usage (E)   │         │ client_activity (E)  │
                                  └────────────────────────┘         │ order_intents (F)    │
                                                                      └──────────────────────┘
```

Trois Pathways, **dans cet ordre** (chacune est utilisable seule) :

1. **V1 (B)** — commande par **WhatsApp** : aucun écrit cloud, aucune table
   nouvelle côté client, fonctionne sur 100 % des appareils (pas de GMS requis).
   Le POS saisit la commande à la main. _Coût : saisie clavier du commerçant._
2. **V2 (C)** — la commande existe dans **SQLite** (`client_orders`), le
   commerçant la gère (préparation → prête → livrée) et la **lie à une vente**
   au comptoir. _Coût : migration 0063 + une page POS._
3. **V3 (F)** — la commande part **automatiquement** au miroir (`order_intents`),
   le POS la tire et la crée. La saisie manuelle reste en filet.

---

## 3. Les six tranches

### B — Panier + commande WhatsApp (APK) — _prochaine_

| #   | Livrable                                                                                                                                                       | Fichiers                                                   | Tests             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------- |
| B1  | Modèle de panier **pur** (lignes, fusion, totaux centimes, bornes : 50 lignes, qté ≤ 1 000)                                                                    | `mobile/src/cart.ts`                                       | unitaire          |
| B2  | Persistance panier `expo-sqlite` (même style paresseux que `cache.ts`, repli mémoire)                                                                          | `mobile/src/cart-store.ts`                                 | unitaire          |
| B3  | Message de commande **pur** : nom + téléphone du client, lignes, total **estimé** explicitement, préférence de retrait, référence locale `W-xxxxxx`            | `mobile/src/order.ts`                                      | unitaire          |
| B4  | Écran « السلة » (lignes, ± quantité, total, champ « وقت الاستلام », bouton d'envoi)                                                                            | `mobile/src/screens/Cart.tsx`                              | unitaire (mapper) |
| B5  | Branchement : bouton « أضف إلى السلة » sur chaque carte produit, **badge** sur l'onglet Boutique, écran « الطلبات المرسلة » + « أعد إرسال آخر طلب »            | `mobile/src/screens/Boutique.tsx`, `App.tsx`, `ui/nav.tsx` | unitaire          |
| B6  | Envoi : `Linking.openURL(wa.me/<shopPhone>?text=…)` — le numéro du magasin vient du snapshot (`shop.phone`) ; **aucun échec n'est silencieux** (message ar/fr) | `mobile/src/App.tsx`                                       | —                 |

**Règles** : la référence locale `W-xxxxxx` n'est **pas** la référence officielle
(`CMD-…`) : celle-ci est générée par le POS (le master). Le total du panier est
**estimé** (prix catalogue) et le dit dans le message — le prix final est celui
de la vente au comptoir.

### C — Commandes dans le POS (SQLite)

| #   | Livrable                                                  | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **migration 0063** `client_orders` + `client_order_lines` | `reference` UNIQUE (`CMD-AAAA-NNNNNN`), `customer_id` → `customers`, `status` CHECK (`nouvelle`/`preparing`/`ready`/`served`/`cancelled`), `total_minor` CHECK ≥ 0, `sale_id` → `sales` (SET NULL), `note` (préférence de retrait), `cancel_reason`, `operation_id`. Lignes : `product_id`, `product_name_snapshot`, `unit_code`, `quantity` > 0, `unit_price_minor`, `line_total_minor`, `reserved_quantity` (réservation **souple**). Index `(status, created_at)`, `(customer_id, created_at)`. |
| C2  | Domaine **pur**                                           | `src/domain/order/client-order.ts` : génération de référence, **machine d'états** (transitions autorisées + motifs de refus en français), calcul du total depuis les lignes, disponibilité (stock − réservé).                                                                                                                                                                                                                                                                                      |
| C3  | Repo                                                      | `electron/ipc/handlers/client-order.repo.ts` : `createOrderAtomic` (transaction, `operationId`), `listOrders`, `setOrderStatusAtomic`, `cancelOrderAtomic`, `serveOrderAtomic` (voir ci-dessous).                                                                                                                                                                                                                                                                                                  |
| C4  | IPC                                                       | 5 canaux `orders.*` + schémas Zod (`operationId` exigé sur les mutations) + portes licence/staff.                                                                                                                                                                                                                                                                                                                                                                                                  |
| C5  | UI POS                                                    | `src/features/orders/` (nouvelle section ; **liste blanche `a3-organisation.test.ts` mise à jour dans le même commit**) : liste par statut, création (depuis le message WhatsApp : client par téléphone + produits + quantités), fiche commande (état, dette du client, « servir »).                                                                                                                                                                                                               |
| C6  | « Servir la commande »                                    | **Une** transaction : vente (lignes, stock FIFO, paiement, solde client) **+** `sale_id` sur la commande. La vente naît au comptoir, la commande est soldée ⇒ pas de vente orpheline ni de commande fantôme.                                                                                                                                                                                                                                                                                       |

**Hors verrou de clôture** (0048/0058) : une commande n'est pas une écriture
financière ; elle peut être créée un jour de clôture, mais la **vente** liée
sera refusée par les triggers existants — le comportement correct.

### D — Retour d'état vers l'APK

| #   | Livrable                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `buildSnapshotPayload` ajoute `orders[]` (5 dernières commandes du client : référence, statut, total, date, `sale_id`) — **champ** dans un cliché existant, aucun `kind` nouveau. |
| D2  | APK : onglet « النشاط » segmenté (الفواتير \| المدفوعات \| الطلبات) + statut + « أظهر هذا في الصندوق ».                                                                           |
| D3  | Rafraîchissement : le client tire l'état au retour au premier plan + `pull-to-refresh` (pas de push : contrainte GMS).                                                            |

### E — Mesure (l'objectif doit être démontrable)

| #   | Livrable                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `client_activity` (cloud) : `client_id`, `kind`, `at` — écrit par l'Edge à chaque appel **authentifié** (déjà `service_role`).                            |
| E2  | Lecture agrégée par le POS (clé de service) → panneau « Utilisation de l'application : N visites · M clients actifs (30 j) » dans la page Miroir Android. |
| E3  | Le chiffre devient l'argument de vente du commerçant : « vos clients consultent l'app » ⇒ il la fait connaître.                                           |

### F — Transport automatique (V3)

| #   | Livrable                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Edge `client-order` (écriture) : téléphone + PIN (**même** vérification que `client-sync` — une seule implémentation), `order_intents` (RLS verrouillée, `service_role` seul), `operationId` pour l'idempotence. |
| F2  | Le POS **tire** les intentions (cadence propre, 30–60 s) et crée `client_orders` automatiquement ; la saisie manuelle reste en filet.                                                                            |
| F3  | L'APK envoie **les deux** (WhatsApp toujours + cloud pour le suivi) : le client garde le canal qui marche partout, le marchand gagne la saisie automatique.                                                      |
| F4  | Notifications : ligne de base = scrap + bandeau ; push FCM **uniquement** si GMS existe (dégradation gracieuse testée).                                                                                          |

---

## 4. Le contrat de données (invariant à ne jamais faire dériver)

| Élément               | Origine                  | Destination                        | Clé                                        |
| --------------------- | ------------------------ | ---------------------------------- | ------------------------------------------ |
| Catalogue             | `products` (SQLite)      | `store_catalog` (cloud)            | `product_id` + `catalog_version` (SHA-256) |
| Intention de commande | APK                      | `order_intents` (cloud)            | `operation_id` (UUID)                      |
| Commande              | `client_orders` (SQLite) | `customer_snapshot.orders[]`       | `reference` `CMD-…`                        |
| Vente                 | `sales` (SQLite)         | `client_payloads` (`invoice_list`) | `sale_id`                                  |

Un test de **contrat à trois parties** (SQL ↔ Edge ↔ APK) verrouille les noms de
colonnes : il a déjà été livré pour le catalogue (`tests/unit/client-catalog.test.ts`),
il sera étendu aux commandes.

---

## 5. Plan de tests (niveaux, par tranche)

| Niveau      | Preuve                                                 | Exemple (catalogue, déjà fait)                               |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Unitaire    | règles pures, bornes, messages FR                      | exclusion des produits non publiables, empreinte stable      |
| Intégration | transaction, rollback, idempotence, DB migrée réelle   | publication : retrait par drapeau, rejeu sans second POST    |
| Base        | CHECK / trigger : le refus SQL brut est levé           | `client_orders.status` : transition interdite refusée en SQL |
| Contrat     | SQL ↔ Edge ↔ APK                                       | colonnes servies ⊇ colonnes lues                             |
| E2E         | parcours réel (Electron pour le POS, relay pour l'APK) | commande saisie → servir → vente liée                        |

**Règle** : le test rouge s'écrit **avant** le correctif, et la porte doit
pouvoir échouer (une garde qui passe toujours ne prouve rien).

---

## 6. Risques et parades

| Risque                                            | Impact                      | Parade                                                                                   |
| ------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| Le commerçant ne valide jamais les commandes      | l'app devient inutile       | Saisie manuelle + « Publier maintenant » ; la mesure (E) montre le flux                  |
| Le prix a changé entre la commande et le comptoir | promesse non tenue          | Le message dit « prix estimés » ; la vente porte le vrai prix ; l'écart est visible      |
| GMS absent (appareils algériens)                  | pas de notification         | Ligne de base = WhatsApp + scrap interne ; push = amélioration                           |
| Le miroir est effacé (il est jetable)             | catalogue/intentions perdus | SQLite reste le master ; le catalogue se republie ; la commande vit dans `client_orders` |
| Le téléphone est volé                             | commande frauduleuse        | La commande est une **demande** : pas de stock, pas de dette ; le commerçant refuse      |
| Un client bloque la commande (stock parti)        | client déçu                 | La commande est refusée **avec motif**, visible côté client (D)                          |
| Le quotas Edge du plan gratuit                    | coupure                     | 1 appel par client qui synchronise (≈ 1 200/mois) ; le catalogue ne coûte qu'une lecture |
| La pause après 7 j d'inactivité                   | miroir endormi              | La publication du catalogue et la synchronisation POS comptent comme activité            |

---

## 7. Ordre d'exécution et indépendances

```
B (panier + WhatsApp)      → autonome, aucun backend
C (commandes POS)          → autonome, migration 0063
D (retour d'état)           → dépend de C (les commandes existent)
E (mesure)                 → autonome
F (transport auto)          → dépend de C (la commande existe), remplace la saisie manuelle
```

`B`, `C` et `E` peuvent avancer **en parallèle** (agents isolés, scratch
séparé, une branche par agent). `D` et `F` attendent `C`.

---

## 8. Ce qui reste hors machine (opérateur)

1. Appliquer `cloud/supabase/catalog.sql` + `client_activity` (E) + `order_intents` (F) sur le projet du magasin.
2. Déployer `client-sync` (A), puis `client-order` (F).
3. Activer la publication du catalogue et vérifier l'onglet « Boutique » sur l'appareil réel.
4. Tester la commande complète : APK → WhatsApp → saisie POS → vente → retour d'état dans l'app.

---

## 9. Compteurs de la phase (à jour à chaque tranche)

| Tranche               | Statut    | Test                                               | Preuve      |
| --------------------- | --------- | -------------------------------------------------- | ----------- |
| A — catalogue         | **livré** | 16 (contrat) + 5 (intégration)                     | `e4d416b`   |
| B — panier + WhatsApp | **livré** | 17 (unitaire)                                      | session 121 |
| C — commandes POS     | **livré** | 7 (base, parité domaine↔trigger) + 9 (intégration) | session 122 |
| D — retour d'état     | **livré** | 4 (unitaire APK) + 1 (intégration)                 | session 123 |
| E — mesure            | à faire   | —                                                  | —           |
| F — transport auto    | à faire   | —                                                  | —           |

## 10. Ce que la tranche C a figé (décisions prises pendant l'exécution)

1. **La vente lie la commande DANS SA TRANSACTION.** `sales.create` porte un
   `clientOrderId` optionnel ; le main écrit `client_orders.sale_id` et
   `status='served'` avant le COMMIT de la vente. Conséquence : pas de vente
   orpheline, pas de commande fantôme, et un échec de liaison **annule la
   vente entière** (fail-closed).
2. **L'état est verrouillé par la BASE, pas par l'UI.** Le trigger
   `trg_client_orders_status_transition` refuse les transitions interdites ;
   le domaine (`src/domain/order/client-order.ts`) et son jumeau main
   déclarent la même matrice, et un test de base compare les **25 couples**
   (état × état) entre le domaine et le trigger. Le commerçant ne voit donc
   jamais une transition annoncée possible puis refusée.
3. **« Servie » n'est atteignable que par la vente.** Le canal
   `orders.setStatus` n'accepte que `preparing`, `ready`, `cancelled` :
   l'encaissement reste le SEUL chemin qui livre une commande.
4. **Le prix de la commande est un ESTIMÉ, celui de la vente est le réel.**
   La commande fige le prix du jour de la demande ; l'écran affiche le
   **prix du jour** (relu par jointure) et signale l'écart ; la caisse est
   ouverte avec le prix du jour, et le caissier valide.
5. **La réservation est SOUPLE.** `reserved_quantity` réduit le disponible
   affiché ; elle ne touche ni les couches FIFO ni le stock physique (une
   réservation n'est pas une consommation). Le moteur de stock est resté
   intact.
6. **Le prix est RELU par le main à la création** : la commande captée par
   WhatsApp ne porte qu'un produit + une quantité ; un prix nul ou un produit
   archivé sont refusés en français.

## 11. Ce que la tranche D a figé

1. **Les commandes remontent dans le cliché EXISTANT** (`customer_snapshot`,
   champ `orders`, 5 dernières) : **aucun nouveau `kind`**, le `CHECK`
   immuable de `sync_outbox` n'est pas touché, et le client reçoit l'état de
   sa réservation sans nouveau coût de synchronisation.
2. **La référence affichée est celle du POS** (`CMD-…`) : c'est elle que le
   client montre au comptoir. La référence locale de l'appareil (`W-xxxxxx`)
   ne sort jamais de l'appareil.
3. **Le regroupement « Activité »** (Factures | Paiements | Commandes) libère
   une place dans la barre : c'est ce qui permet au **panier** d'être un
   onglet à part entière. L'IA finale est donc : **الرئيسية · المتجر ·
   السلة · النشاط · حسابي** (5 onglets).
4. **Le client ne voit que l'ESTIMÉ** : la commande porte son total estimé ;
   la vente portera le vrai montant. L'écart est visible côté commerçant
   (prix du jour affiché dans la fiche commande).
