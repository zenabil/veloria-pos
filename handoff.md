# Handoff — Veloria POS (état au 2026-10-26)

> Document de continuité : tout ce qui a été fait, fichiers modifiés,
> erreurs (fermées/ouvertes), en-attente, commandes. Sessions 2026-10-07
> (§9), 2026-10-11 (§1-8) et 2026-10-12 (§10) archivées ci-dessous.
> §11 = session scan sans Entrée (2026-10-18). §12 = session politique
> opération→format d'impression (2026-10-18 bis). §13 = lancement POS
> opérateur (2026-10-18 ter). §14 = préparation du prompt d'audit
> dead-code (2026-10-18 quater). §15 = audit dead-code Phase A + lot 1
> (2026-10-18 quinquies). §16 = lot 2 (canaux IPC) + `knip.json` (2026-10-19).
> §17 = prompt d'audit intégral (2026-10-19 quinquies) — audit-first, 16 axes.
> §18 = **audit intégral EXÉCUTÉ** (2026-10-19 sexies) — 228 findings, 0
> correction de code, 3 livrables + ADR-120 proposé.
> Répondre à l'utilisateur en arabe.

## 1) État courant

- Branche : `chore/root-layout` — tête commitée `9b7c564` (session 53, refonte visuelle). **Sessions 41 (retours dette d'abord) et 45 (carton devis/retours fournisseur) sont dans l'arbre de travail, NON COMMITÉES** (attente de validation propriétaire). **Arbre propre au départ** (hors `release/`, `graphify-out/` et artefacts de navigateur, non versionnés).
- **Session 53 (2026-10-27)** : **Refonte visuelle transversale** — `PageHeader` plat (sur-titre module + H1 + période + actions), suppression du badge « Poste Principal » et des pastilles de module ; une seule recherche par écran (doublons en-tête/barre retirés), `Toolbar` compacte toujours visible (fin du bouton « Filtres »), exports/imports déplacés dans la barre ; `StatsStrip` unique (4 ou 5 cellules) avec tons sémantiques **conditionnels** ; coquille fusionnée (session dans `TopBar`, libellé module retiré), sidebar active plus calme, toasts en bas à droite ; thème clair aligné (surfaces, bordures, textes, en-têtes de tableaux). Aucun backend/canal/migration. Portes : typecheck 0 · electron 0 · eslint 0 · prettier 0 · verify:fr 340 · verify:encoding 947 · **vitest 169 fichiers / 1 171 tests 0** · build ✓ · build:electron ✓ · **E2E 6/6** (`navigation-smoke`, `component-smoke`, `barcode-uppercase`, `catalogue-labels`, `settings-navigation`, `dashboard-ui`). ADR-148. Commits `9b7c564` (20 fichiers UI/tests/ADR) + `2707f41` (Devis). `handoff.md`, `docs/INDEX.md` et les sessions 41/45 restent dans l'arbre ; seule l'addition de type de `ProformasScreen.tsx` (session 45) reste non commitée.
- **Session 52 (2026-10-27)** : **Tableau de bord reconstruit** — barre de période avec presets actifs + menu Exporter (PDF/Excel/CSV), 4 KPI principaux + bande compacte secondaire, ventes/jour + encaissements, catégories avec filtre/total, et détails répartis en onglets **Finances / Stock & dettes / Activité récente** ; vigilance seulement si nécessaire. Suppression du défilement imbriqué qui interceptait les clics. Aucun backend/canal/migration. Portes : typecheck 0 · eslint 0 · prettier 0 · verify:fr 340 fichiers 0 · **vitest 169 fichiers / 1 171 tests 0** · build ✓ · build:electron ✓ · **E2E dashboard-ui 1/1 + component-smoke 1/1**, captures `test-results/dashboard*.png`. ADR-147. Commit `08a3ba1`. Détails §52.
- **Session 50 (2026-10-26)** : **Paramètres — sections et composants** — `Section` commune avec icône, badge d'état, repli et pied `SaveBar` unifié ; `SettingsGroup`, `Segmented` (paiement) et `SwitchRow` compacté. Regroupement **Vente + Sons**, **Produits + Stock**, **Clients + Fournisseurs** (Commerce 5 → 3 cartes, Catalogue 2 → 1) ; recherche/ancres mises à jour. Les actions immédiates (sauvegarde, base, miroir, dossiers) utilisent des `Button` explicites et non plus `SaveBar` ; blocs avancés repliables. Aucun canal/schéma/migration. Portes : typecheck 0 · eslint 0 · prettier 0 · **vitest 169 fichiers / 1 171 tests 0** · build ✓ · build:electron ✓ · verify:fr 340 fichiers ✓ · **E2E settings-navigation 1/1 · stock-backup 4/4 · full-loop-client 1/1** (7 clichés poussés, 1 accès). ADR-145. Commit `71fbc77`. Détails §50.
- **Session 49 (2026-10-26)** : **coût rendu, prix carton auto, paramètres et formulaires** — la livraison d'une réception est répartie au prorata exact sur chaque produit et `products.purchase_price_minor` reçoit le **coût rendu** (fret inclus), y compris pour un produit créé par nom ; le formulaire produit calcule automatiquement pièce ↔ carton **sans écraser un prix saisi** (œufs 25 DZD pièce / 650 DZD carton conservés) ; Paramètres reconstruits (groupes, icônes, recherche indexée, sous-navigation, fiscalité repliée) ; formulaire client en sections avec notes repliées et barre fixe ; codes-barres ASCII en majuscules à la saisie et au stockage. 3 ADR (142/143/144), 3 migrations inchangées. Portes : typecheck/electron 0 · eslint 0 · **vitest 169 fichiers / 1 170 tests 0** · build ✓ · build:electron ✓ · verify:migrations/domain/fr/encoding ✓ · **E2E 6 specs / 7 tests ciblés verts** (smokes, carton 750 DZD, client, paramètres, barcode). Commits `bfef912` + `5f33cac`. Détails §49.
- **Session 48 (2026-10-26)** : **réception fournisseur simplifiée** — modale élargie (960 px, `Modal extraWide`), saisie en sections **Facture fournisseur / Articles reçus / Notes**, fournisseur replié avec recherche à la demande, lignes compactes (produit existant ou nouveau produit par nom, unité d'achat pièce/carton, quantités, prix, coût rendu), **total + validation fixes** en bas. Une ligne commencée mais incomplète **bloque désormais la validation** (message FR + défilement automatique vers la ligne) au lieu d'être ignorée en silence ; « Changer » réinitialise les données produit/tarif du produit précédent ; **Entrée ne valide plus implicitement** (`Ctrl+Entrée` explicite). Aucun canal, schéma, migration ni ADR. Portes : `tsc` 0 · eslint 0 · **vitest 165 fichiers / 1156 tests 0** (suite complète finale) · `build` ✓ · `build:electron` ✓ (manifeste **233**) · `verify:fr` 0 (336) · **E2E stock 4/4** (dont garde Entrée + ligne incomplète). Commits `c4a4208` (refonte) + `ebbd5c3` (garde Entrée). Détails §48.
- **Session 47 (2026-10-26)** : **formulaire produit simplifié** — saisie réorganisée en 2 colonnes (Identification, Prix, Stock & seuils, Conditionnement) + « Options avancées » repliées (fournisseurs avec filtre, stock maximum, produit actif) ; aperçu de marge en direct (vert/rouge, vente à perte), codes-barres en puces avec bouton d'ajout, création de catégorie à la demande, barre d'enregistrement fixe + `Ctrl+Entrée`, et le code scanné non validé est conservé au clic sur « Créer ». Libellés/aria-labels existants conservés. Aucun canal, schéma, migration ni ADR. Portes : `tsc` 0 · eslint 0 · **vitest 165 fichiers / 1156 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **233**) · `verify:fr` 0 (336) · **E2E carton + scan 7/7** ; vérification visuelle réelle création + édition. Commit `4a993c2`. Détails §47.
- **Session 46 (2026-10-26)** : **test réel du tarif de gros carton** — produit **œufs** : 1 carton = 30 pièces, achat carton 540 DZD, vente carton 650 DZD, vente pièce 25 DZD. L'E2E réel a révélé que le plancher ADR-136 `(facteur−1) × prix pièce` (29 × 25 = 725) refusait le tarif 650 : le panier affichait « 1 carton + 4 pièces » mais **sans badge Tarif carton** et facturait **850 DZD** au lieu de **750 DZD**. Plancher supprimé (ADR-141) : seul reste `prix carton < facteur × prix pièce` ; la baisse au seuil (29 = 725 → 30 = 650) est le tarif de gros voulu. Après correctif, E2E réel : badge Tarif carton, économie 100 DZD, ticket `1 × Carton de 30 @650` + `4 × 25` = **750 DZD**, stock **34 → 0**, lignes `unit_factor` 30/1. Portes : typecheck/electron 0 · eslint 0 · **vitest 165 fichiers / 1156 tests 0** · `build` ✓ · **E2E carton 1/1** (à lancer avec `env -u ELECTRON_RUN_AS_NODE`). ADR-141. Détails §46.
- **Session 45 (2026-10-26)** : **conditionnement carton — devis et retours fournisseur corrigés** — un devis enregistre désormais les lignes éclatées (carton + reste) avec **snapshot** `packaging_id`/`unit_factor`/`unit_code` : total stocké = total imprimé = total converti ; la conversion honore le prix/conditionnement du devis (même si le tarif a changé depuis) et déduit le stock en unités de base (`trustedPackagingSnapshot` interne au main, migration **0056**). Le retour fournisseur sépare `quantity_stock` et `quantity_damaged` : stock 34 + 2 abîmées = 36 retournables, la sortie de stock n'est que de 34 ; l'`intakeItemId` valorise chaque ligne à son propre prix ; l'annulation restaure le stock et le journal une seule fois. Correctif latent : l'annulation de retour avait un placeholder SQL de trop (échec systématique client/fournisseur). Portes : typecheck/electron 0 · eslint 0 · **vitest 165 fichiers / 1156 tests 0** · build ✓ · verify:migrations **56** ✓. ADR-140. Détails §45.
- **Session 44 (2026-10-26)** : **étiquettes multi-pages** — la sélection du Catalogue porte désormais les fiches (`Map<number, Product>`) et non plus seulement leurs identifiants : « Étiquettes » imprime les produits cochés sur **toutes les pages**, plus uniquement la page affichée. Helper pur `labelTargets` (types.ts) + régression unitaire et **E2E réel** (`catalogue-labels.spec.ts` : 21 produits, 1 coché sur chaque page ⇒ 2 étiquettes dans l'aperçu). Licence E2E complétée (`excel-export`, `barcode-scanner`) pour couvrir import CSV + aperçu. Aucune migration, aucun canal IPC, aucun ADR. Portes : typecheck/electron 0 · eslint 0 · **vitest 165 fichiers / 1150 tests 0** · build ✓ · build:electron ✓ (manifeste **232**) · verify:fr 0 · E2E ciblé 1/1. Détails §44.
- **Session 43 (2026-10-26)** : **annulation / correction des factures** — **vente** : nouveau canal `sales.reopen` (annuler puis recharger les lignes dans la caisse, nouveau numéro ; bouton « Modifier la vente » dans l'Historique), refus avant annulation si retours ou produit archivé ; **achat** : détail + `stock.intakeCancel` d'une facture fournisseur **intacte** (stock, couches FIFO et dette restaurés ; refus si stock consommé, retour fournisseur, facture réglée ou réception liée à un bon de commande), correction = formulaire de réception prérempli. Correctif associé : l'annulation d'une vente **sans client** violait le garde crédit 0051 (vente annulée désormais soldée). ADR-139, **aucune migration**, permissions existantes (`cancel` / `stock`). Portes : typecheck/electron 0 · eslint 0 · **vitest 165 fichiers / 1149 tests 0** · build ✓ · verify:migrations (55) ✓. Détails §43.
- **Session 42 (2026-10-25)** : **caisse — codes-barres alphanumériques** — la recherche/scan accepte lettres, symboles et codes courts (jeton unique ≥ 2 car.), la correspondance code-barres ignore la casse (étiquettes Code 39 imprimées en majuscules / fiche parfois en minuscules ; casse exacte prioritaire), le jeton complet gagne sur le préfixe quantité (`2X500G` reste un code) et un scan machine inconnu à lettres affiche le message FR puis vide le champ (plus de concaténation avec le scan suivant). Aucune migration, aucun canal IPC. Portes : typecheck/electron 0 · eslint 0 · **vitest 162 fichiers / 1132 tests 0** · build ✓ · verify:migrations (55) ✓. Détails §42.
- **Session 41 (2026-10-25)** : **retours clients — la dette d'abord** (ADR-138, migration **0055**) : imputation automatique `min(valeur nette, solde)`, allocation vente d'origine puis ventes ouvertes les plus anciennes, jour clos ⇒ crédit non affecté (aucun ABORT 0048), espèces plafonnées à l'excédent (refus FR au-delà), `sales.credit_applied_minor` exclu du Z/zakat, valeur nette `line_total` et `sale_item_id` par ligne, UI dette/avoir calculés. Portes : typecheck/electron 0 · eslint 0 · **vitest 161 fichiers / 1121 tests 0** · build ✓ · build:electron ✓ (manifeste **232**) · verify:migrations (55)/domain/fr/encoding ✓ · knip 0 · **E2E credit-return 3/3** (dont retour sur vente à crédit). Détails §41.
- **Session 35 (2026-10-23/24)** : skills alignés (migration **0051**, ADR-135), lint **0** (casts `any` des tickets HTML supprimés), `knip` **0** (`PrintingSection` mort + ré-export `TicketCodes` retirés), E2E **45 tests** (2 smokes ajoutés : navigation 16 modules + composants/dialogues) — **42 réussis / 3 ignorés / 0 échec**, 5 échecs E2E corrigés (aria-label iframe ticket ADR-134, noms réels des dialogues, attente iframe historique), `full-loop-client` rejoué avec relais `:8100`, packaging ADR-023 refait. Détails §35.
- **Session 37 (2026-10-25)** : **migration 0052** (lignes de vente/retour : catégorie figée + COGS retour ; `supplier_returns.staff_user_id` ; index Dashboard) · Dashboard reconstruit sur le **NET des retours/remboursements** (`dashboard.repo.ts`), carte **Ventes/marge par catégorie** avec sélecteur, `formatDzdTotal(±)`, compteurs Top 5 non tronqués, séries journalières complètes, intégrité mise en cache avec horodatage · gardes : annulation refusée avec retours, retour refusé sur vente annulée, refresh APK après annulation/retour, pagination miroir >500 clients, **RLS/revoke/security_invoker** Supabase, clé service liée à l'hôte, opérations destructives **gérant-only** · portes : typecheck 0, electron 0, eslint 0, **vitest 153 fichiers / 1063 tests 0**, build ✓, build:electron ✓, verify:migrations/domain/fr/encoding ✓. Détails §37. **Reste ouvert** : verrou PIN côté Edge (RPC atomique), jour métier `Africa/Algiers` (E-35), chiffrement sauvegardes/QR PIN, `maxDevices`, TTL payloads cloud.
- **Session 38 (2026-10-25)** : caisse durcie de bout en bout — **migration 0053** (`cart_drafts.sale_operation_id`), paiements jusqu'à `MAX_MINOR_TOTAL`, rejet des montants invalides (plus de 0 silencieux), `formatDzdTotal(±)` sur les totaux, limites **500 lignes / 20 paniers**, stock négatif **toujours** interdit (toggle trompeur retiré), produits/clients archivés refusés, livraison synchronisée, échéance réelle imprimée, moyen de paiement masqué si versement 0, actions filtrées par permissions staff, operationId **persisté avec le brouillon** et panier vidé avant impression. Portes : typecheck/electron 0, eslint 0, **vitest 156 fichiers / 1075 tests 0**, build ✓, build:electron ✓ (manifeste **227**), verify:migrations (53)/domain/fr/encoding ✓. Détails §38. **Reste ouvert** : navigation clavier des résultats clients/onglets, `dueDate`/onglet actif non persistés dans le brouillon, aperçu d'un replay après édition d'un brouillon ambigu, verrou PIN Edge, jour métier Algiers, sauvegardes/QR.
- **Session 40 (2026-10-25)** : **coût FIFO en caisse** — après une réception à un nouveau prix, la caisse utilisait le dernier prix d'achat comme coût de référence : fausse alerte « sous coût » sur l'ancien stock et coût erroné dans l'audit. La recherche produit expose désormais la prochaine couche FIFO (`fifo_next_unit_cost_minor`), le dialogue prix et l'alerte l'utilisent, et `createSaleAtomic` audite le sous-coût sur le **COGS FIFO réel** (après consommation) en figeant `sale_items.purchase_price_minor` sur ce coût moyen. ADR-137. Portes : typecheck/electron 0 · eslint 0 · **vitest 160 fichiers / 1106 tests 0** · build ✓ · build:electron ✓ (manifeste **230**) · verify:migrations (54)/domain/fr/encoding ✓.
- **Session 39 (2026-10-25)** : **conditionnement carton** — **migration 0054** (`product_packagings`, `packaging_id`/`unit_factor` sur ventes/achats/retours, `line_total_minor` achat, backfills historiques), domaine pur (`splitQuantityByCarton`, `priceSaleLine`, `allocateUnitCosts`, `toBaseQuantity`), tarif carton **monotone** (jamais de total qui baisse), stock/FIFO/mouvements **en unités de base**, vérification stock **agrégée par produit**, revalidation main du facteur/prix carton, achat carton→pièces avec couches FIFO exactes (1–2 paliers), retours dans l'unité vendue (carton complet ou pièces), UI Produit « Conditionnement », caisse (découpage + badges Tarif carton/Économie/Prix manuel), achat (unité d'achat + résumé pièces/coût), ticket (lignes carton/pièce). Portes : typecheck/electron 0, eslint 0, **vitest 159 fichiers / 1103 tests 0**, build ✓, build:electron ✓ (manifeste **230**), verify:migrations (54)/domain/fr/encoding ✓, knip **0**. Détails §39 et ADR-136.
- **Audit intégral EXÉCUTÉ (§18, 2026-10-19)** : 3 livrables — `docs/reports/FULL_AUDIT_2026-10-19.md` (rapport, 16 axes A→P, **228 findings** : 0 Critical · 23 High · 95 Medium · 110 Low) · `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` (plan en **11 vagues W0→W10**, ~11-13 j, 20 décisions owner) · `docs/ADR-120-*.md` (**proposé**, en attente d'approbation). Preuves brutes : `docs/reports/maintenance/audit-raw/`.
- **Remédiation : vagues W1 → W10 EXÉCUTÉES et commitées** : `0e900f1` **W1** (logique financière) · `cd43aa2` **W2** (sécurité) · `833cea1` **W3** (base) · **W4** (couverture verte + gardes auto-dérivées) · `1e56547` **W5** (rendu/UI caissier + atelier impression) · **W6** (code mort trié — ADR-127) · `4a96938` **W9** (encodage + chiffres à jour) · `7086954` **W8** (chemins chauds indexés, N+1, bundle) · **W7** (règles uniques — ADR-128) · **W10** (état d'erreur persistant — ADR-129). **Plan d'audit : TERMINÉ** (les 11 vagues sont exécutées).
- **Baseline gelé 2026-10-21 (mesuré, arbre propre)** : `tsc -b` **0** · `typecheck:electron` **0** · `eslint . --max-warnings 0` **exit 0** · `vitest` **142 fichiers / 976 tests** **0** · `test:db` **39 fichiers / 183 tests** **0** (isolé) · **`test:coverage` = EXIT 0 (VERT — 95,83 % lignes · 87,19 % branches · 100 % fonctions, seuils 80/75/88/80 par fichier ; aucun seuil abaissé)** · `knip` **0** (0 fichier, 0 export, 0 type, 0 dépendance) · `verify:migrations` **VERIFIED** · `verify:domain` **VERIFIED** · `verify:perf` **VERIFIED** · `verify:fr` **0** (322 fichiers, **plus de liste d'attente**) · `verify:encoding` **0** (868 fichiers) · `license:scan` **0** (1420 fichiers) · `format:check` **0** · `build` ✓ (12,1 s) · `build:electron` ✓ (manifeste signé **216 fichiers**).
- **Nouveaux constats P1 (non corrigés, voir plan)** : jour métier en UTC au lieu de `Africa/Algiers` (E-35) · `verify:licensing` hors CI (bloqué : l'état local du Manager n'existe pas sur un runner) · **E2E rejoués le 2026-10-23 : 42 réussis / 3 ignorés / 0 échec**.
- **Corrigé en W1→W10 (à ne plus re-signaler)** : `customers.accessQrSvg` sans staff-gate · `staffScope()` ⇒ «no session = gérant» · `database.optimize` sans gate · conversion Proforma→vente cassée si remise · clôture Z (chèque/transfert/dépenses/retours) · verrou de période close (W3) · unicité téléphone + `paginationSchema.page` borné (W3) · `test:coverage` rouge (W4) · `FROZEN_SCHEMA_COUNT` (W4) · extraction EAN-13/14 (W4) · `formatDzd` qui throw au rendu + double-submit + focus + lots bornés (W5) · atelier impression (W5) · code mort trié, `knip` à 0, `expo-constants` retirée, garde FR sans liste d'attente (W6) · chemins chauds indexés (migration 0050) + N+1 supprimés + bundle découpé (W8) · encodage réparé (W9) · **règles uniques (quantité/montant/date/normalisation) + état « en retard » produit (W7)** · **état d'erreur persistant dans 12 écrans (W10)**.
- ADRs : 001→**147** (`134` = design du ticket de vente, `135` = export données réimportable, `136` = conditionnement carton, `137` = coût FIFO en caisse, `138` = retours dette d'abord, `139` = annulation/correction factures, `140` = carton devis/retours fournisseur, `141` = tarif de gros carton sans plancher, `142` = coût rendu produit/livraison, `143` = paramètres navigation/recherche, `144` = formulaires et code-barres, `145` = paramètres composants/sections, `146` = studio d'impression, `147` = tableau de bord). `docs/INDEX.md` **à compléter jusqu'à 147** (fichier partagé avec la session 41 non commitée).
- **3 bugs caisse signalés par le propriétaire (2026-10-21) — DIAGNOSTIC PROUVÉ puis CORRIGÉS (§23, ADR-131)** : (B1) focus qui revient au champ « Nom » de l'article libre — `useDialogFocus` rejouait son effet à chaque rendu (`onClose` inline = identité nouvelle) ⇒ **corrigé** (refs, dépendances `[boxRef]`) ; (B2) vente au poids en mode « Montant » : 50,00 DZD saisis mais **49,70 facturés** ⇒ **corrigé** (le montant saisi est facturé tel quel, `billedTotalMinor`) ; (B3) panier mixte : `CHECK constraint failed: discount_amount_minor >= 0` (7× dans le journal du 2026-10-21) — une **majoration** (prix de ligne > prix d'origine) produisait une remise négative, acceptée par le domaine mais **interdite par la base** ⇒ **corrigé** (migration **0051** : remise signée, table `sales` reconstruite + runner « FK off » ; garde des lignes AVANT l'INSERT ⇒ message FR au lieu du CHECK SQL). **Lien B1 → B3** (la saisie tronquée du prix forçait une correction par majoration). Packaging refait le 2026-10-23 (schéma 0051 inclus) ; constat secondaire non traité (4 ventes à `amount_paid_minor = 0`).
- **Constats bloquants de la revue UI d'ADR-131 — CORRIGÉS (§25, ADR-132)** : (C1) éditer qté/prix d'une ligne « montant saisi » tuait l'écran Vente (`computeBilledTotal` levait au rendu) ⇒ ligne **verrouillée** (qté + prix, jamais fusionnée, `+`/`−` strictement sur la dernière ligne) + `safeLineTotal` (« — » + log, jamais d'exception) ; (C2) ticket **non imprimable** (remise négative refusée par `discountMinor`) ⇒ `moneyMinorSigned`, ticket « Remise −X »/« Majoration +X », « montant saisi » au lieu de qté × P.U., quantités FR, devis A4 à majoration visible ; (C3) couverture **E2E** du mode Montant. Revue ui-fr (3 risques corrigés) + db-guardian CLEAN (aucune migration).
- Outillage : `knip.json` (§16) — `Unused files` **32 → 0** ; re-mesuré 2026-10-21 : **0 fichier · 0 export · 0 type · 0 dépendance** (la couverture `knip` s'étend désormais à `license-manager/**` et `cloud/**` — J-11).
- **« Grand blanc après le code-barres » sur la facture de vente imprimée — CORRIGÉ (§26, ADR-133)** : (a) le ticket **n'imposait aucun format de page** (`printOptions()` sans `pageSize` ⇒ format par défaut du pilote, A4/297 mm) alors que son contenu **se termine par le bloc codes** ⇒ la page est désormais **largeur du rouleau × hauteur mesurée du contenu** (+3 mm de coupe, plancher 30 mm, repli = ancien comportement) ; (b) le **Code 39 n'était jamais mis à l'échelle** (462 px dans 280/200 px + `overflow:hidden`) ⇒ module calé sur la colonne (1,1 px ⇒ 275,7 px en 80 mm) + plafond CSS `max-width/height:auto` (58 mm : 200/200 px, plus de barre coupée) ; (c) l'export PDF passait des **microns** à `printToPDF` (qui attend des **pouces**) ⇒ conversion explicite, PDF d'un ticket 80 mm = **80,1 × 141,5 mm sur 1 page**. Restent assumés : Code 39 de 14 car. non scannable sur 58 mm (limite matérielle) et payload QR imprimé deux fois (contrat texte ADR-050).
- **Import/export Clients & Produits — VÉRIFIÉS et DURCIS (§27, EMP-1 `6bb3a51`)** : le câblage existait (ADR-130) et les 3 E2E étaient vertes, mais **réimporter l'export clients créait 2 fiches bidon** (en-tête `Client;Téléphone…` traité comme données, guillemets conservés) au lieu d'échouer proprement, et un téléphone `pas-un-numero` était accepté. **Corrigé** : parseur CSV quote-aware, **refus FR explicite des exports de rapport** (produits et clients), **téléphone importé validé** (domaine + main), **export interrompu** si une page est illisible (plus de CSV tronqué annoncé « ok »). Parseur inchangé sur les formats documentés (`nom;vente;achat;quantité[;code-barres]`, `prénom;nom;téléphone`). Aucune migration, aucun canal, aucun ADR nouveau (restaure la décision 3 d'ADR-130). **Complété par §28/ADR-135** : second export « Données CSV » réimportable, sans changer le rapport.
- **Export de données réimportable — AJOUTÉ (§28, ADR-135 `2d8028a`)** : les écrans Produits et Clients ont désormais **deux exports** : « Rapport CSV » (lisible Excel, ADR-130) et « Données CSV » (`nom;vente;achat;quantité[;code-barres]` / `prénom;nom;téléphone`) qui se réimporte tel quel. Montants via `minorToInput` (jamais `formatDzd`) ; `protectFormulas:false` pour préserver `+213…`/`-…` (le rapport garde RX-18) ; export données **refusé** si le filtre inclut des archivés (le format d'import ne transporte pas le statut). Aucun canal, schéma, migration. Réimporter dans la même base échoue proprement sur l'unicité code-barres/téléphone : la restauration complète reste `Paramètres → Sauvegarde`.
- **Essai réel de la build CSV — LANCÉ (§29, 2026-10-22)** : build propre depuis `c30b5c6` dans un worktree isolé (`tsc -b` **0**, `vite build` ✓, `build:electron` ✓, manifeste **218 fichiers** signé), copie stable non versionnée `release/veloria-csv-test/` (gitignorée) + raccourci Bureau `Veloria POS - Test CSV.lnk`. Licence existante **ACTIVE** (`VLIC-757224A4`, pro à vie, 17 pages) réutilisée : aucune réactivation nécessaire. La base réelle `%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite` a été migrée **50 → 51** par cette build : l'ancien installateur du 21/10 refusera désormais cette base (« version plus récente ») ; snapshot pré-migration + copie manuelle disponibles. `release/` (installateur) reste l'ancienne build.
- **Design du ticket de vente — LIVRÉ (§30, ADR-134 `9fbc90e`)** : le ticket papier, le PDF, l'aperçu vente et l'atelier partagent désormais **un seul document HTML** (`buildReceiptTicketHtml`) : en-tête enseigne, date, ligne client, table `Qté/Article/P.U/Montant` à lignes pointillées, `N Article(s)`, encadré arrondi `Ancien solde/Total vente/Versement/Nouveau solde` (ou `Reste à payer`/`Monnaie rendue`), remerciement, Code 39 + QR, mentions légales. Le montant saisi garde `P.U —` + « Montant saisi » (ADR-131/132). L'aperçu renvoie `{ text80, html80 }` (aucun canal, schéma ni migration ajouté) et s'affiche en iframe `sandbox=""`. Défaut trouvé et corrigé : l'encadré dépassait de **14 px** en 80 mm (`flex:0 0 74%`) ⇒ `flex:1 1 auto; min-width:0` ; mesure Playwright **0 débordement** en 58 et 80 mm. Le payload QR n'est plus imprimé deux fois quand un SVG existe. `buildReceiptText` reste pour les autres documents thermiques et le repli d'aperçu.
- **Contrats gelés (mis à jour par ADR-138)** : snapshot `ipc-channels.json` **181** (+`products.packagings.list/save/delete`) · `FROZEN_SCHEMA_COUNT` **125** · `FROZEN_EXPORT_COUNT = 134` · `FROZEN_SCHEMA_TOTAL` (op-id) **125** · `operation-id-coverage` : **46** REQUIRED + classification complète (125 schémas) · migrations **56** (0051 = remise signée ; **0052 = snapshots catégorie/COGS retours** ; **0053 = operationId de vente dans le panier** ; **0054 = conditionnements carton** ; **0055 = imputation des retours sur la dette** ; **0056 = snapshot carton des devis + retours fournisseur stock/abîmées**). `printing.preview` renvoie en plus `html80` (même canal, même schéma de requête).
- **E2E (2026-10-23)** : suite complète **45 tests : 42 réussis, 3 ignorés** (installateur NSIS/UAC + drag/redimensionnement OS), **0 échec** (26,6 min, relais miroir `:8100`). Specs ajoutées : `navigation-smoke` (16 modules) et `component-smoke` (rendu + dialogues) ; matrice `docs/reports/E2E_COVERAGE_MATRIX.md`. `full-loop-client` vert avec relais. Les 3 ignorés sont documentés dans la matrice.
- **Packaging REFAIT 2026-10-23** (§35) : `release/` reconstruit **de zéro** (ADR-023) — `Veloria-PoS-Setup-1.0.0.exe` + `.blockmap` · `Veloria-PoS-Portable-1.0.0.exe` · `Veloria-License-Manager-Setup-1.0.0.exe` + `.blockmap` · `Veloria-License-Manager-Portable-1.0.0.exe` · `SHA256SUMS.txt` · `release/win-unpacked/` (= License Manager, dernier empaqueté). Hashes : POS setup `1993570380256561b9272133f90a1bb2f4d15607522a0f9a95dd54b2be255d9d` · POS portable `39f4ea38c9bf615a03dc982822be328db90f99788846b837814a98b97c4ab94e` · Manager setup `a61f274eaa3acbdcbba3a9d2adac3f8558b30541efa9b98eb20112991079ce3f` · Manager portable `850321ccfcf502e26a59ec52550037bbec7018d90f0f7846c2fba5d178d5b0db`. `release:smoke` **0** ; `better-sqlite3` chargé dans les runtimes POS **et** Manager (Electron 37.2.0, ABI 136, SQLite 3.50.2 — règle AGENTS.md §9).
- Non relancés : `verify:licensing`, `npm audit` réseau (offline ⇒ non probant). **APK mobile impossible ici** : ni EAS CLI/jeton, ni JDK/Android SDK, ni `EXPO_PUBLIC_*` réel (placeholders dans `mobile/eas.json`).
- **Portes §30 (historique, 2026-10-22, arbre de `9fbc90e`)** : `npm run typecheck` **0** · `typecheck:electron` **0** · `eslint . --max-warnings 0` **0** · `vitest` **151 fichiers / 1 051 tests** **0** · `build` ✓ · `build:electron` ✓ (manifeste **220 fichiers**) · `verify:fr` **0** (325 fichiers) · `verify:encoding` **0** (886) · `verify:migrations` **VERIFIED**. E2E et `verify:licensing` **non rejoués** ; packaging `release/` antérieur au design ticket.
- **Portes §31 (historique, 2026-10-23, arbre de `e3cf6e7`)** : `typecheck` **0** · `typecheck:electron` **0** · `eslint` **0** · `vitest` **151 fichiers / 1 052 tests** **0** · `build` ✓ · `build:electron` ✓ (manifeste **220**) · `verify:fr` **0** (325) · `verify:encoding` **0** (887) · `verify:migrations` **VERIFIED**. **PDF réel** : 80,09 × 155,19 mm et 58,25 × 176,36 mm, dernier texte « POS » à **6,23 mm** du bas, aucun gris peint (blanc/noir uniquement). **Vide papier** : pilote étiquette `2120TF(Label)` en 90 × 60 mm, gap actif — passer le pilote en reçu/continu (détail §31). E2E, `verify:licensing` et packaging **non rejoués**.
- **Pièges découverts pendant l'audit** : (1) `npm run lint` passe sur `docs/**` ⇒ **tout `.mjs` déposé sous `docs/` casse la porte** (allowlist `allowDefaultProject` = 24 chemins, `eslint.config.mjs:31-58`) ; (2) `test:db` échoue (12 `Hook timed out`) si lancé **en parallèle** d'autres outils lourds ⇒ **`hookTimeout` passé à 60 s (W4)** ; (3) `format:check` échoue sur tout `.md` écrit à la main ⇒ **toujours** passer Prettier sur les livrables ; (4) `npm run build` seul invalide le manifeste licence ⇒ toujours enchaîner `build:electron` ; (5) `better-sqlite3` est compilé pour l'ABI Electron (136) : pour interroger la base hors GUI, passer par `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` ; (6) toute arête inter-features nouvelle fait **échouer** le test A3 ⇒ liste blanche `tests/unit/a3-organisation.test.ts` à mettre à jour dans le même commit ; (7) **`test:coverage` instrumentant tout le code, les tests d'intégration lourds dépassaient `testTimeout` (15 s) ⇒ passé à 60 s (W4)** ; (8) **écrire un fichier via `Set-Content` (PowerShell) corrompt l'UTF-8** (double encodage) ⇒ toujours écrire via l'outil d'édition ou un script Node.

## 2) Objectifs réalisés (11 → 12 oct 2026)

| #   | Objectif                  | Résultat                                                                                                                                                                 |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Nettoyage TEMP/cache      | TEMP user 1654→9 fichiers, +598 MB libres (opencode + verrous préservés) ; `npm cache verify` (39 MB GC)                                                                 |
| 2   | Packaging débloqué        | Developer Mode (`AllowDevelopmentWithoutDevLicense=1`) lève le blocage winCodeSign SANS admin — `package:win` + `package:manager` verts (ADR-070 respecté, `true` gardé) |
| 3   | Audit profond 3 UI        | 3 sous-agents + vérification manuelle : 0× P0, 7× P1, ~25× P2, plusieurs « dettes » réfutées (GRADIENTS utilisé, `share.ts` inexistant, `•••` voulu, haptics déjà câblé) |
| 4   | Correctifs radicaux       | 18 Manager + 9 Mobile + 13 POS (dont preload payload, JSON.parse gardé, startup fail-closed, restore, `useLicense(notify)`, SearchField/Select, clés stables) — ADR-080  |
| 5   | Design Phase 1 fondations | `::selection`/caret or, moment mouvement unique (modal+toast 160/180 ms), « Monnaie » héros 30 px — ADR-081 (D1/D10/D13 reformulés après refus craft-floor)              |
| 6   | Design Phase 2 surfaces   | Pastille+J-X Manager, bande « Aujourd'hui », salut horaire + impayés Mobile, barre crédit segmentée, glyphes SVG EmptyState — ADR-082 (D14 vérifié existant)             |
| 7   | Design Phase 3 profondeur | Densité (miroir useTheme), épinglés ★, total+Encaisser sticky, `useCountUp`, durcissement clair (10/10 hex couverts) — ADR-083                                           |
| 8   | Re-verdict complet        | 661/661 + E2E 24/24 (chrome 6, sale 4, reste 14) + re-packaging + checksums                                                                                              |

## 3) Fichiers modifiés (12 oct, par chantier, non commités)

- **Correctifs Manager** : `preload.ts`, `App.tsx`, `ipc-client.ts`,
  `manager-env.d.ts`, `registry.ts`, `validators.ts`, `licenses.ts`(inchangé —
  lecture seule), `manager-db.ts`, `integrity-check.ts`, `main.ts`,
  `window-manager.ts`, `styles.css`, `sign-manager-integrity.mjs`,
  `tests/unit/license-manager-presets.test.ts` (nouveau),
  `tests/unit/license-tamper.test.ts` (fixture P0-4 +preload).
- **Correctifs POS** : `use-license.ts`, `LicenseScreen.tsx`, `App.tsx`,
  `Sidebar.tsx`, `OcrImportDialog.tsx`, `IntakeDialog.tsx`,
  `ProductsBlock.tsx`, `ReportsScreen.tsx`, `widgets.tsx`,
  `DashboardScreen.tsx`, `ProformaDialogs.tsx`, `DetailsDrawer.tsx`
  (returns), `MovementsDialog.tsx`.
- **Correctifs Mobile** : `App.tsx`, `i18n.ts`, `Home.tsx`,
  `Invoices.tsx`, `QrScanner.tsx`, `tokens.ts`, `validate-env.mjs`
  (`staleLabel`/`allKeys` conservés — utilisés par les tests).
- **Design** : `globals.css`, `primitives.tsx` (Modal, EmptyState+glyphes),
  `ShellOverlays.tsx` (toasts), `PayDialog.tsx`, `SellTotalsPanel.tsx`
  (sticky), `CartPanel.tsx`, `TopBar.tsx` (densité), `use-density.ts`
  (nouveau), `use-count-up.ts` (nouveau), `shell-types.ts`,
  `SupplierPOsDialog.tsx`, + `license-manager/renderer/App.tsx`,
  `mobile/src/{App,Home,i18n}.tsx/ts` (Phase 2).
- **Docs** : `ADR-080`, `ADR-081`, `ADR-082`, `ADR-083`, `INDEX.md`.
- **Rebuildés (git-ignorés ou release/)** : `dist*/`, `release/` (4 exe +
  blockmaps + SHA256SUMS).

## 4) Erreurs découvertes (12 oct)

### Fermées (40+)

P1 : preload payload (recherche+rotation clé mortes), JSON.parse JSX,
startup sans catch, restore `selected` périmé, `standing_*` bruts,
`professional` brut, `use-license` silencieux · P2 : SearchField/Select
bruts, aria-label loupe, 8× catch silencieux, 10× `key={i}`,
MiniTable non-sticky, `createdAt` backups, `onConfirm` non-attendu,
double IPC recherche, preload hors حراسة, `licenseStatus` CREATE
contradictoire, labels sans `htmlFor`, `appInfo` mort, PRESETS sans
parity, endpoint mobile non-câblé, clés i18n/`STITCH` mortes, `:8100`
refusé par validate-env, stale-closure langue, `grant()` sans catch,
`key={p.name}`, `onEndReached` sans seuil · Design : `◌` Unicode,
toasts/modals sans mouvement, sélection/caret par défaut, total
PayDialog timide, liste Manager illisible, impayés invisibles (Mobile),
barre crédit continue, `bg-[#171207]`/`[#1c1113]` illisibles en clair.

### Ouvertes / assumées

1. **`installer.spec` jamais exécuté** : per-machine exige UAC élevé
   (skip documenté dans le spec lui-même, `:117-118`).
2. **`full-loop-client` exige relais `:8100`** (`e2e-mirror-relay.mjs`)
   - `PHONE`/`PIN` — non relancé cette session.
3. **Pas de remote/CI** : tags locaux uniquement (inchangé).
4. **Hex littéraux conservés** (`accent="#4edea3"`, `text-emerald-300`,
   `bg-[#1c1113]`, ~84 sites) : valeurs vérifiées = tokens ; migration
   partielle refusée (ADR-080, même rationale qu'ADR-075).
5. **E2E lent** : ~35-40 s/test (boot app) ; suite complète ≈ 25-30 min ;
   timeout 20 min insuffisant (pas un hang — prouvé par specs unitaires).
6. **`handoff.md` racine** : conservé (fichier de travail actif).
7. **Dette restante** : APK EAS (placeholders), specs E2E manquantes
   (11 specs), dû mobile soldé sauf Kit/annonces, harness hors périmètre.
8. **50 fichiers non commités** : en attente de revue + tag opérateur.

## 4bis) Session §15 — audit dead-code Phase A + lot 1 (2026-10-18)

**Livrable** : `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md` (Phase A, rapport
seul, zéro suppression) puis **lot 1 exécuté** sur autorisation opérateur
(« fais un plan et corrige radicalement »).

**Méthode** : `npx --yes knip` (219 candidats) + `npx --yes depcheck` +
`graphify` (6011 nœuds) ; chaque candidat revérifié par recherche exhaustive
avant toute suppression. 4 sous-agents `explore` en lecture seule ont couvert
`src/`, `electron/`, `tests/+scripts/+racine+dépendances`,
`license-manager/+mobile` ; la couche IPC à 3 niveaux (définition → preload →
appel renderer) a été vérifiée directement (les deux voies : wrapper
`api.*` **et** appel direct `call((a) => a.<ns>.<méthode>())`).

**Bilan** : 219 bruts → **212 faux positifs réfutés**, **47 findings réels**
(6 critiques · 31 sûrs · 6 « décision » · 2 hygiène).

**Supprimé (lot 1 — ADR-118)** : 21 fichiers, **148 lignes supprimées /
3 ajoutées** (commentaires devenus faux). `electron/` : alias
`clearCartDrafts`, `sumRemaining`, `expirationDate`, `LICENSE_SIGNATURE_ALG`,
`EXPIRING_CRITICAL_DAYS`, `sha256Hex`, `clearIntegrityCache`,
`clearFingerprintCache`, `setSecretBackendForTests`, réexport `TemplateRender`.
`src/` : 15 exports morts (thème/densité, `ModuleId`, `clampRetentionCount`,
`CLIENT_PIN_LENGTH`, `DebtAgingInput`, `agingBucketLabelFr`, `OcrDocumentKind`,
5× staff, `assertReceivableQuantity`, `ItemCondition`, 2× licence,
`CustomerDrawerState`). Tests : `acceptNextConfirm`, entrée dupliquée du
guard IPC. Dossiers : `src/shared/validation/`, `electron/database/migrations/`.

**Import orphelins retirés** (sinon `tsc -b` échoue, `noUnusedLocals`) :
`createHash` + `LICENSE_CRITICAL_DAYS` (`licensing/protocol.ts`).

**Portes avant → après** : `tsc -b` 0 → **0** · `eslint --max-warnings 0` 0 →
**0** · `vitest` **804 → 804** (121 fichiers, aucune perte) · `build` ✓ → ✓ ·
`build:electron` ✓ → ✓ (manifeste signé 214 fichiers) · `verify:migrations`
VERIFIED → **VERIFIED** · `verify:domain` VERIFIED → **VERIFIED** ·
`graphify update` OK (6011 nœuds / 16430 arêtes).

**Contrats gelés INTACTS** : `IPC_CHANNELS` (180), snapshot `ipc-channels.json`
(180), `FROZEN_SCHEMA_COUNT` (114), `operation-id-coverage` (R1). Les gardes
`bridge-shape` / `ipc-channel-inventory` / `validators-inventory` n'ont pas
été modifiées.

**Pièges écartés (ne pas « nettoyer »)** :

- `recovery.retry`/`recovery.exit` : appelés depuis le HTML **main**
  (`recovery-view.ts:95,100`, `license-view.ts:95`) — faussement morts.
- `bindings` : arête runtime transitive exigée par `better-sqlite3` (ADR-005).
- `mobile/**` + `license-manager/**` : points d'entrée Expo/electron-builder.
- `clearCartDraftsAtomic`, `CODE39/128*`, `STAFF_KDF_*`, `PIN_KDF_*`,
  `license/catalog.ts` : **test-only mais gardés** (couverture métier réelle,
  ADR-075 déjà tranché).

**Différé / à arbitrer** :

- **Lot 2 (ADR-119) — EXÉCUTÉ (§16)** : 3 canaux retirés (`sync.markSent`,
  `sync.pending`, `stock.ledger`) + 3 fonctions repo orphelines
  (`markOutboxSentAtomic`, `listPendingOutbox`, `Inventory.getLedger`).
  Snapshot 180 → **176** ; `FROZEN_SCHEMA_COUNT` 114 → **113**.
  `pushNowAtomic` marque la file `'sent'` lui-même (`sync.service.ts:263-270`)
  → les 2 canaux `sync.*` sont **supersédés techniquement**, pas « UI
  manquante ». La garde `retention` protège par **préfixe** `"sync."` → elle
  reste correcte ; le vecteur fantôme `"sync.markSent"` de
  `retention-critical.test.ts` a été retiré.
  **Conservés** : `announcements.save` (domaine+repo+validateur complets,
  seule l'UI manque → décision **produit**, pas du code mort) ;
  `templates.get` + `printer.get` (**hors périmètre** : schéma dans
  `validators.templates.ts`, handler dans `printing.receipt.ts` → fichiers du
  chantier impression non commité).
- `printer.get` + 24 réexports morts de `receipt-documents*` : **dans la zone
  du chantier impression non commité**, donc différés.
- `knip.json` + workspace `mobile` : ~95 % de faux positifs en moins pour un
  fichier de config, zéro changement de code.
- `RAW_GUARDED_CHANNELS` non appliqué (`ipc/raw-guards.ts:31`) ; garde
  `bridge-shape` ne couvrant que les noms `*Schema` (d'où la survie de
  `expirationDate`) ; `DT-03` : le validateur `expirationDate` **câblé** est
  le plus laxiste des deux.

**⚠ Dette de couverture** : `mobile/` n'est couvert par **aucun tsconfig**
(`typecheck` racine et `typecheck:manager` l'ignorent) ; seul `vitest` garde.

## 4ter) Session §16 — lot 2 : canaux IPC morts + `knip.json` (2026-10-19)

Autorisation opérateur : « fais un plan et corrige radicalement » puis
« tu as les permissions ». **Lot 1 déjà commité** (`20a705b`, ADR-118).

**Lot 2 (ADR-119)** — 3 canaux IPC retirés, sur les 6 candidats du rapport :

| Canal           | Handler                     | Fonction repo orpheline retirée                  |
| --------------- | --------------------------- | ------------------------------------------------ |
| `sync.markSent` | `registry.customers.ts:163` | `markOutboxSentAtomic` (`client-access.repo.ts`) |
| `sync.pending`  | `registry.customers.ts:170` | `listPendingOutbox` (`client-access.repo.ts`)    |
| `stock.ledger`  | `registry.stock.ts:14`      | `Inventory.getLedger` (`inventory.repo.ts`)      |

**Le fait qui tranche** : `pushNowAtomic` marque la file `'sent'` **lui-même**
dans sa transaction (`electron/sync/sync.service.ts:263-270`) et lit
lui-même les lignes `pending` (`:212-216`) → les 2 canaux `sync.*` sont
**supersédés techniquement**, pas des fonctionnalités à interface manquante.
`listPendingOutbox` était d'ailleurs explicitement étiqueté « pour le **futur**
agent de synchro » — un futur agent qui existe déjà (`pushNow`).

**Gardes synchronisées** : snapshot `ipc-channels.json` **180 → 176** ·
`IPC_CHANNELS` 180 → **177** clés (176 servis + `window.maximizedChanged`
push-only) · `FROZEN_SCHEMA_COUNT` **114 → 113** (`syncPendingSchema`) ·
vecteur fantôme `"sync.markSent"` retiré de `retention-critical.test.ts` ·
import + assertion `syncPendingSchema` retirés de `client-access.test.ts` ·
commentaire `retention.ts:42` corrigé (la garde protège par **préfixe**
`"sync."` → elle reste correcte : `sync.enqueue`/`pushNow`/`saveConfig`
subsistent).

**Conservés, et pourquoi** : `announcements.save` (domaine + repo + validateur

- handler **complets**, seule l'UI manque → décision **produit**) ·
  `templates.get` et `printer.get` (leurs fichiers sont dans le **chantier
  impression non commité** → mélanger deux chantiers dans un commit est
  interdit, AGENTS.md §10).

**Portes avant → après** : `tsc -b` 0 → **0** · `typecheck:electron` ✓ → ✓ ·
`typecheck:manager` ✓ → ✓ · `eslint --max-warnings 0` → **exit 0** ·
`vitest` **804 → 804** (121 fichiers) · `build` ✓ → ✓ · `build:electron` ✓ → ✓
· `verify:migrations` VERIFIED → **VERIFIED** · `verify:domain` VERIFIED →
**VERIFIED** · `graphify update` ✓.
**Gardes de contrat rejouées en isolation** : 37 assertions — `bridge-shape`
3/3 · `ipc-channel-inventory` 2/2 · `validators-inventory` 2/2 ·
`operation-id-coverage` 2/2 · `channel-alias` 4/4 · `client-access` 24/24.

**`knip.json` ajouté** (zéro changement de code) : candidats bruts
**219 → 30**, `Unused files` **32 → 0**. La clé décisive est
`ignoreExportsUsedInFile: true` : le dépôt exporte massivement des règles
pures consommées **dans leur propre fichier**, usage que knip ne comptait pas.
Les 27 `unused exports` restants sont **exactement** les findings vérifiés
manuellement (24 réexports `receipt-documents*` + `buildActivationQrPayload` +
`clearSecureState`) → **plus aucun faux positif résiduel**.

**Nouvelle trouvaille mobile** : `expo-constants` est déclaré dans
`mobile/package.json:23` mais **n'est importé nulle part** dans `mobile/src`.
Non supprimé : la correction exige `mobile/package-lock.json`
(**lockfiles intouchables**, consigne 3).

## 5) En attente (next actions)

> **Priorité 2026-10-19 (§18)** : le plan de remédiation
> `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` (11 vagues W0→W10) prime sur
> les items ci-dessous, qui y sont repris (Q1→Q20). **Prochaine action
> attendue : approbation du propriétaire sur (a) ADR-120, (b) Q5 (chantier
> impression : commit ou stash), (c) la vague W1 (logique financière).**

- [ ] **Lot 2 bis** : `templates.get` + `printer.get` + les 24 réexports morts
      de `receipt-documents*` — **nécessite le commit du chantier impression**
      d'abord (zone de chevauchement stricte). _(→ vague W6 du plan)_
- [ ] **`announcements.save`** : décision produit — construire l'UI des
      annonces magasin, ou retirer le canal + domaine + repo. _(→ Q1)_
- [ ] **`expo-constants`** : dépendance `mobile` inutilisée (retrait soumis à
      mise à jour du lockfile mobile). _(→ Q3)_
- [x] ~~**`docs/INDEX.md`** : étendre au-delà de ADR-103 (118 + 119 à ajouter)~~
      — **fait le 2026-10-19** : l'index était déjà complet jusqu'à ADR-119
      (l'affirmation « jusqu'à 103 » de l'ancien §1 était fausse) ; ADR-120
      et les 2 rapports d'audit y ont été ajoutés.
- [ ] **Revue + tag** de l'arbre checkpointé (HEAD `fec3acf`, §11) —
      proposition : tag local `v1.0.0-session-1018` après revue.
- [ ] **Session admin** : `installer.spec` (UAC) — seul gate jamais vert.
- [ ] **Relais + full-loop-client** : `node scripts/e2e-mirror-relay.mjs`
      puis spec client (PHONE/PIN).
- [ ] **Remote** : dépôt distant + push + CI (`.github/workflows/ci.yml`
      prête) ; alternative `git bundle` USB.
- [ ] **APK** : compte EAS + `eas.json` réel (placeholders refusés).
- [ ] **Phase design restante** : D2 sticky Mobile ? non — reste D5
      Mobile ? non. Reste : D15 soleil (contraste), D16 Mobile (compte),
      D3 presets ? — revoir liste §D (propositions 25-36, D15/D16 mobiles
      non faits).
- [ ] **Propositions fonctionnelles 1-36** : vagues à prioriser
      (irrigation directe : 15, 27, 14, 23).

## 6) Commandes

```powershell
npm run dev:electron          # dev (build electron + electron .)
npm test                      # vitest (661)
npm run test:e2e               # Playwright (electron.launch, workers:1, ~30 min total)
npx playwright test tests/e2e/sale-flow.spec.ts   # fumée rapide ciblée (~3 min)
node scripts/e2e-mirror-relay.mjs            # relais :8100 (prérequis full-loop)
npm run verify:migrations && npm run verify:domain && npm run verify:perf
npm run build && npm run build:electron      # TOUJOURS couplés (manifest, sinon e2e "tampered")
npm run package:win && npm run package:manager  # OK sans admin SI Developer Mode (reg AllowDevelopmentWithoutDevLicense=1)
npm run release:smoke && npm run release:checksums
npm run license:scan          # secrets (prepackage)
git tag -a vX -m "..."        # tags locaux (pas de remote)
```

Données test réutilisables (isolation par run) : client `0555123456` / PIN
au choix (6 chiffres) · service-key e2e `e2e-service-key-0123456789` ·
anon JWT `role:anon` (voir full-loop-client.spec.ts).

## 7) Règles à garder (AGENTS.md, résumé)

1. SQLite seule source métier · 2. Renderer = `window.veloria` uniquement ·
2. Pas de `run-sql`, canaux `domain.action` + Zod · 4. Centimes DZD + 1 tx +
   `operationId` · 5. Domaine sans framework, prepared statements ·
3. UI 100 % FR (mobile AR/FR), erreurs FR + log · 7. Tranches verticales ·
4. format → typecheck → tests → build · 9. better-sqlite3 vs Electron 37 ·
5. ADR-\*.md + INDEX · 11. Migrations IMMUABLES + verify vert ·
   12-13. Skill-first + routage (db/slice/ui-fr, impeccable+craft-floor
   avant tout edit UI, audit-avant-suppression, dragon si aucun match).
   Nouveaux : craft-floor refuse `border-left` coloré / anneaux décoratifs /
   `◌`-Unicode / cartes fantômes — reformuler, pas adoucir.

## 8) Pièges rencontrés (ne pas répéter — ajouts 12 oct)

- `build` renderer seul invalide le manifest → e2e licence `tampered` ;
  toujours enchaîner `build:electron` (re-confirmé 2026-10-18 : manifest
  re-signé 213 fichiers, E2E reparti).
- Toasts empilés (4,5 s) : drainer avant lecture du toast suivant.
- `getByLabel` matche aussi les `aria-label` des boutons (ex. nav) → préférer
  `title=` ou `data-path` si collision.
- thead sticky + `min-w-[1240px]` : clic ligne → bouton `Voir …` + scroll
  explicite ; `scroll-margin` global dans `globals.css`.
- `exactOptionalPropertyTypes` : `ref` par spread conditionnel.
- PowerShell 5.1 : pas de `sed/grep/tail` → outils `read/grep` natifs ;
  `Select-String` sans `-Recurse` ; chemins avec espaces entre `"..."`.
- `test-only-allow-expired.cjs` DOIT suivre `buildSecureStateV2` (H-3).
- QR V2 exige URL+anon configurés AVANT l'activation (ADR-068).
- e2e fenêtrage : écran < 1600×900 → démarrage maximisé (skips dédiés).
- **NOUVEAU** : `Select-String ... | Select-Object -Last N` bufferise tout
  jusqu'à la fin — en cas de timeout, zéro sortie (ce n'est pas un hang) ;
  rediriger vers fichier (`> $env:TEMP\x.log`) + lire le fichier.
- **NOUVEAU** : E2E ≈ 35-40 s/test (boot) → prévoir ~30 min ; valider par
  spec ciblée (`sale-flow`, `window-chrome`) avant la suite complète.
- **NOUVEAU** : `Set-Content` peut ré-encoder (mojibake) — vérifier
  `git diff` après toute réécriture hors `edit`.
- **NOUVEAU** : `edit` exige l'indentation exacte — en cas d'échec,
  afficher les espaces (`-replace ' ', '.'`) avant de réessayer.
- **NOUVEAU** : winCodeSign passe SANS admin si Developer Mode = 1
  (`mklink` cmd OK même si `New-Item` PS exige l'élévation) ;
  `signAndEditExecutable=false` reste INTERDIT (ADR-070).
- **NOUVEAU** : `noUncheckedIndexedAccess` — `split().map(Number)`
  donne `number|undefined` (garde explicite exigée).
- **NOUVEAU** : utilitaires Tailwind vs classes CSS perso en conflit de
  taille → une seule source (ex. `font-mono-currency-*` SANS `text-*`).
- **NOUVEAU (18 oct)** : `graphify update .` peut sortir code 1 APRÈS un
  update réussi (tip watch) — vérifier la sortie, pas le code retour.
- **NOUVEAU (18 oct)** : douchette E2E = rafale ≤ 60 ms → idle 90 ms
  (ADR-116) ; ne pas remonter `TEXT_IDLE_MS` (220 ms, frappe humaine),
  les specs « scan sans Entrée » en dépendent.
- **NOUVEAU (18 oct)** : `git commit` embarque TOUT l'index — un arbre
  multi-sessions peut avoir des fichiers PRÉ-STAGÉS (`D `/`RM ` dans
  `git status --short`) ; vérifier/stager par chemins avant commit.
- **NOUVEAU (18 oct ter)** : ne JAMAIS lancer un script GUI
  `npx electron script.cjs` pendant que le POS tourne (crash renderer de
  l'instance POS) — requêtes DB dev : `ELECTRON_RUN_AS_NODE=1 npx electron
script.cjs` (better-sqlite3 = ABI Electron ; `node` système échoue).

## 9) Archive session 2026-10-07 (topnav + Manager icon, ADR-072/073)

TopBar fusionné + Sidebar compacte horizontale + horloge fr-DZ 24h + mode
clair CSS-only + icône Manager (`resolveManagerIcon`). Vérifié + rebuildé ;
screenshots `docs/shots/pos-*.png`. Restes : sign-off visuel demandeur,
`test:e2e` packagé, Manager UI + APK refonts en attente, `graphify update .`
impossible (CLI absent).

## 10) Session 2026-10-12 (correctifs radicaux + design Phases 1-3)

- **Déblocage packaging** : Dev Mode → 4 exe signés + SHA256SUMS (×2
  rebuilds : après correctifs, après design).
- **Audit → 0 P0 / 7 P1 / ~25 P2** (3 sous-agents, findings vérifiés
  manuellement, dettes réfutées documentées en §4.7).
- **Correctifs** : 18 Manager + 13 POS + 9 Mobile + 2 tests
  (parity + fixture P0-4) — auteur mixte (sous-agents Manager/Mobile
  relus via `git diff`, POS en direct).
- **Design** (direction « دفع جريء محسوب », impeccable+craft-floor) :
  Phase 1 fondations, Phase 2 surfaces, Phase 3 profondeur
  (D5 densité, D6 épinglés ★, D2 sticky, D16 `useCountUp`, D8 clair).
- **État final** : 661/661, E2E 24/24, eslint 0, manifests signés,
  release/ frais, 50 fichiers en attente de revue/commit/tag.
- **Correctif jour (même date)** : écriture invisible en thème clair —
  pastels (`amber/emerald/red/sky-200/300`), variantes `/60-/80`,
  placeholder beige, `bg-black/40`, `hover:text-white` : tous mappés
  (contrastes AAA) ; preuve par captures E2E (`test-results/light-*`,
  git-ignorées, spec temporaire supprimé).

## 11) Session 2026-10-18 (scan douchette sans Entrée — ADR-116)

- **Demande opérateur** : le scan doit ajouter au panier SANS presser
  Entrée (et, pour les unités continues KG/G/L/ML/CL/M, ouvrir le dialogue
  quantité-ou-montant — déjà livré en ADR-114).
- **Constat** (3 reproductions E2E réelles) : l'ajout sans Entrée existait
  (debounce 220 ms ; Entrée en fin de rafale = no-op) mais deux failles —
  latence fixe 220 ms, et deux scans < 220 ms d'écart se CONCATÈNENT
  (`CODE1CODE2`) → « Code-barres inconnu », zéro ajout.
- **Fix ADR-116** : cadence machine = frappes ≤ 60 ms
  (`SCAN_BURST_GAP_MS`, aucun humain) → idle 90 ms (`SCAN_IDLE_MS`) si
  texte code-barres ; frappe humaine inchangée 220 ms (`TEXT_IDLE_MS`).
  Refs `lastKeyAtRef`/`scanBurstRef` (`useSellState`), décision pure
  `searchIdleMs` (sell-search).
- **Tests** : unit sales 69/69 (4 nouveaux : searchIdleMs, rafale/humain/
  texte) ; E2E `scan-flow` **6/6** — 3 nouveaux (sans Entrée focus champ ;
  sans Entrée focus perdu ; 2 scans à 180 ms → 2 lignes), ×2 passes
  stables ; vitest complet **795/795** ; eslint 0 ; `verify:*` VERIFIED.
- **Piège re-vécu** : `npm run build` seul → manifest licence « tampered »
  à l'import E2E ; `build:electron` re-signe (213 fichiers) — séquence
  obligatoire.
- **Git** : `734a69c` (purge harness) + `fec3acf` (checkpoint 295 fichiers
  = backlog ADR-080→115 + cette session ; scratch `check_like.py` /
  `full-inventory.txt` git-ignorés) + commit `docs(handoff)` de ce §11.
- **Restes** : revue + tag opérateur ; suite E2E complète, packaging,
  typecheck manager/mobile non relancés cette session.

## 12) Session 2026-10-18 bis (politique opération → format d'impression — ADR-117)

- **Demande opérateur** : cantonner le format d'impression par opération —
  vente / règlement / retour / bon de livraison / bon de commande fournisseur
  → **ticket 58/80 uniquement** ; devis → **A4 uniquement** ; étiquettes →
  tous gabarits adhésifs SAUF A4. Le 58 vs 80 reste le réglage
  imprimante/modèle existant (aucun sélecteur au moment d'imprimer).
- **Décisions (ADR-117)** : A4 banni de TOUT document de vente (historique,
  fiche client, dettes, aperçus + exports) ; devis ticket 80 mm supprimé ;
  canaux IPC `printing.printA4`, `printing.exportA4Pdf`,
  `printing.printProforma80mm` supprimés (30→27) ; constructeurs A4 de vente
  purgés (`receipt-a4.ts` supprimé, `buildA4Html`, `buildProformaText`,
  `buildPaymentTicketA4Html`, …) ; type doc `facture` retiré du Studio/Zod
  (6 types : ticket, proforma « Devis A4 », bon_livraison, recu, avoir,
  etiquette) ; papier A5 + gabarit `A4-24` retirés ; `pageAtRule` (chrome)
  toujours A4 ; Zod 116→114 ; étiquettes : microns non nuls
  (`labelFormatSchema` défaut `45x20`, limite 200 conservée),
  `exportLabelsPdf` → « etiquettes.pdf » ; capacités de licence historiques
  (ex. `invoice-a4`) conservées (concepts de licence) ; `autoPrintInvoice`
  inchangé (auto-impression = ticket). **Aucune migration** : 0036 immutable
  (ligne `facture` orpheline inoffensive ; `TEMPLATE_DOC_TYPES` ne la
  réinitialise plus) ; papier legacy invalide → miroir Zod = défauts
  complets (accepté).
- **E2E réparés au passage** (casse PRÉEXISTANTE — refonte recherche
  liste ADR-114 + porte session 0041 arrivées dans `fec3acf` sans mise à
  jour des specs) :
  - 7 specs : sélecteur résultat produit `getByRole("button")` →
    `getByRole("option")` (`SellSearchPanel`) — customer-invoice ×2,
    credit-return ×2, sale-flow ×2, pdf-export, restart, full-loop-client.
  - `restart` : placeholder historique périmé → `getByLabel` (libellé
    courant « Rechercher dans l'historique … »).
  - `license-activation` : franchit la porte session (`staffLoginIfNeeded`)
    après l'import externe + redémarrage — 4/4 vertes.
  - `factory-reset` : l'instance `app.relaunch()` (non pilotable par
    Playwright) bootstrappait la porte et consommait le code initial
    (affiché UNE fois, jamais en clair) → perdu pour la relance du harnais.
    Fix : boucle de frappe qui la tue AVANT son bootstrap (~5 s), puis
    relance pilotée — 2/2 stables.
  - `helpers.ts` : capacité `proformas` ajoutée (exigée par
    `exportProformaPdf`) ; commentaire `autoStaffLogin` à jour.
- **Preuves** : vitest **794/794** (121 fichiers ; snapshot IPC 27 canaux) ;
  `tsc -b` 0 (213 fichiers) ; eslint 0 ; prettier OK ; `build` +
  `build:electron` + manifest signé (213 fichiers) ;
  `verify:migrations`/`verify:domain` VERIFIED ; **13 specs E2E : 12/13
  vertes** (seul `installer` non exécutable — paquet Win requis), dont
  `pdf-export` réécrit (ticket 80 via `exportReceiptPdf` + devis A4 via
  `exportProformaPdf` + assertions négatives de purge des canaux) et
  `full-loop-client` avec relais `:8100`.
- **Pièges pour la suite** : ne jamais éditer une migration appliquée
  (0036 garde sa ligne `facture` — CHECK) ; tout nouveau test E2E caisse :
  résultats produit = `role="option"`, porte session = `staffLoginIfNeeded`
  (défaut du harnais), restart = relance pilotée après kill des instances
  auto-relancées ; `dist`/`dist-electron` doivent être rebuildés APRÈS tout
  changement src (build + `build:electron` re-signe le manifest).
- **Git** : `860c11a` (72 fichiers, ADR-117 + purge A4 + E2E) +
  commit `docs(handoff)` de ce §12. Tag opérateur à proposer :
  `v1.0.0-format-ops` après revue.

## 13) Session 2026-10-18 ter (lancement POS opérateur)

- **Demande opérateur** : « شغل pos و فعله » — lancer le POS et
  (licence) l'activer. Aucun changement de code.
- **Actions** : sources plus récentes que `dist-electron` (17 oct) →
  `npm run build` + `npm run build:electron` (manifest re-signé, 213
  fichiers, 18 oct 21:0x) ; `npm run verify:licensing` → **ACTIVE**
  (licence locale déjà importée, clé embarquée vérifiée) ; lancement
  `npx electron .` : `startup.ready` mode main ≈ 6,6 s, DB
  `C:\ProgramData\Veloria PoS\Data\Veloria POS DB.sqlite` schema 47,
  backup auto créé, porte session staff affichée (1 utilisateur :
  `admin` / « Gérant », role manager, actif).
- **Piège vécu (nouveau)** : lancer un script GUI `npx electron
script.cjs` PENDANT que le POS tourne → `renderer.gone reason
crashed` + crash GPU/service réseau de l'instance POS (2ᵉ lancement
  propre OK). Pour requêter la DB en dev sans GUI :
  `$env:ELECTRON_RUN_AS_NODE="1"; npx electron script.cjs` (better-sqlite3
  est compilé ABI Electron — `node` système échoue en
  NODE_MODULE_VERSION 136≠127).
- **Git** : arbre propre avant/après (builds git-ignorés) ; seul ce
  §13 + §8 commités (`docs(handoff)`).

## 14) Session 2026-10-18 quater (préparation du prompt d'audit dead-code)

- **Demande opérateur** : « برومبت احترافي » pour un audit complet des
  codes morts — aucun changement de code ; livrable = prompt prêt à
  coller, remis dans le chat (seul ce §14 est committé).
- **Prompt préparé** : audit-first (AGENTS §13/§14 + ADR-075) ;
  périmètre repo entier (src, electron, license-manager, mobile, cloud,
  private, tests, scripts, racine) ; knip/ts-prune/depcheck + repli rg ;
  vérification IPC 3 couches (channels ↔ preload ↔ renderer) + gardes
  `bridge-shape`, `ipc-channel-inventory`, `validators-inventory` ;
  rapport `docs/reports/DEAD_CODE_AUDIT_<date>.md` ; suppressions par
  lots APRÈS approbation explicite, portes format→typecheck→lint→tests→
  build + `graphify update` + handoff + commit par lot.
- **État arbre** : chantier impression en cours non commité (11 M :
  `validators.templates.ts`, `printing.receipt.ts`,
  `printing.templates.ts`, `receipt-documents*.ts`, `thermal.ts`,
  `template-rules.ts` ; 2 nouveaux : `printing.capabilities.ts`,
  `template-capabilities.ts`) — laissé intact, NON touché ici ; à
  committer par sa session dédiée après portes vertes.
- **Complément (même session)** : recommandation du modèle gratuit pour
  l'audit — `opencode/space-bunny-free#max` (1M ctx, zero-retention) ;
  alternatives `longcat-2.5-preview-free`, `beam-free#max`,
  `deepseek-v4.1-flash-free#high` ; à éviter pour du code confidentiel :
  Nemotron free (trial NVIDIA loggé), MiMo / Big Pickle. Sources :
  catalogue `tools.opencode.models` + models.dev + docs Console.
- **Git** : commits `docs(handoff)` explicites sur `handoff.md` uniquement
  (les fichiers du chantier impression restent dans l'arbre, non
  touchés).

## 17) Session 2026-10-19 quinquies (prompt d'audit intégral — 16 axes)

- **Demande opérateur** : « درس المشروع واكتبلي برومبت احترافي وصارم يقوم
  بفحص المشروع من كل أنواع المشاكل والأخطاء والأكواد الميتتة وغير المكتملة
  والزائدة وكل شيء، يعطيني تقرير شامل ومفصل وخطة إصلاحية جذرية » →
  livrable = **un prompt** à coller dans une session neuve. **Aucun changement
  de code métier** dans cette session.
- **Étude préalable du dépôt** (avant rédaction) : `AGENTS.md`, `handoff.md`
  (§1→§16), `package.json` (24 scripts), `eslint.config.mjs`,
  `knip.json`, `docs/STRUCTURE.md`, `docs/INDEX.md`, `docs/ADR-001..119`,
  `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md` (ADRs 075/118/119), arborescence
  `src/` `electron/` `tests/` `scripts/` `docs/` `license-manager/` `mobile/`
  `cloud/` `database/`, `tests/unit/` (85 fichiers de garde), `electron/ipc/`
  (24 canaux + 47 validateurs + 20 repos).
- **Livrable** : `docs/prompts/AUDIT_PROMPT_2026-10-19.md` (1080 lignes / 83 Ko).
  Structure : §1 contexte obligatoire (identite projet + 14 regles + gates +
  etat courant + pieges) · §2 livrables (3 fichiers) · §3 **10 regles de
  comportement strict** (audit-first, preuve obligatoire, classification de
  confiance, interdiction lockfiles/migrations, interdiction `--fix` pendant
  l'audit) · §4 **8 phases** (baseline → carte graphify → statique →
  dynamique → parite → securite → produit → synthese) · §5 **16 axes**
  (A→P) + **19 playbooks de domaine** (P1→P19 : caisse, paiements,
  stock/FIFO, clients/dettes, fournisseurs, retours, depenses, zakat/
  clotures, rapports, impression/PDF, OCR, licences, sync/cloud, backup/
  migrations, staff/PIN/RBAC, mobile, manager, scripts, packaging) +
  **matrice de couverture des artefacts** (type de fichier → controle →
  outil → preuve) + **politique de preuve et d'echantillonnage** ·
  §6 outils (knip, depcheck, ts-prune, madge, dpdm, jscpd, semgrep,
  gitleaks, osv-scanner, ast-grep, betterer, lizard, scc, npm audit) +
  cheatsheet de commandes + regles anti-false-positives · §7 **gabarit de
  rapport** (13 sections) · §8 **gabarit de plan** (vagues W0→W9) ·
  §9 livrables finaux · §10 **DoD** (14 points) · §11 style d'execution
  (explore/db-guardian/ui-fr/general) · §12 **echelle de severite +
  calcul de risque** (Impact × Likelihood → P0..P3) + definition P0
  Veloria · §13 **scenario d'execution** (5 phases + ordre des vagues +
  regle d'arret) · §14 **10 questions proprietaire** (Q1→Q10 avec defaut
  propose) · §15 **gabarits pret-a-l'emploi** (ADR en francais + messages
  de commit + entree handoff + checklist PR) · §16 **liste de deverrouillage
  des contrats figes** (snapshot IPC, FROZEN_SCHEMA_COUNT, operation-id
  coverage, manifeste, migrations) · §17 **profondeurs S/M/L**.
- **Chiffres re-vérifiés avant écriture** (écarts vs skills/docs signalés
  dans le prompt lui-même) : migrations = **47** (`0047_customer_search_norm.sql`)
  et non 0036 comme l'affirme le skill `veloria-db` ; `knip` 219→30 avec
  `Unused files`=0 ; 20 M + 3 nouveaux non commités (chantier impression) ;
  `RAW_GUARDED_CHANNELS` non appliqué (`electron/ipc/raw-guards.ts:31`) ;
  `bridge-shape` ne couvre que `*Schema` ; `docs/INDEX.md` s'arrête à ADR-103
  alors que 118/119 existent.
- **Pièges consignés dans le prompt** : `rg` absent du PATH · PowerShell 5.1 ·
  `Set-Content` mojibake · `git commit` balaie l'index (staging par chemins) ·
  `build` seul invalide le manifeste licence · ABI `better-sqlite3` =
  `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` · `graphify update` peut
  sortir code 1 après succès · `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`.
- **État arbre** : chantier impression (20 M + 3 N) **laissé intact** ; seul
  `docs/prompts/AUDIT_PROMPT_2026-10-19.md` + `handoff.md` + `docs/INDEX.md`
  sont commités (staging par chemins explicites, AGENTS.md §10).
- **Prochaine étape proposée** : coller le prompt dans une session neuve →
  Phase 0 (baseline + mesure des gates) → Phase 1 (carte graphify) →
  rapport `docs/reports/FULL_AUDIT_2026-10-19.md` + plan
  `..._PLAN.md` → puis exécution des vagues **avec approbation par vague**
  (ADR-075 : jamais de suppression automatique).
- **Git** : commit `docs(audit): prompt d'audit integral 16 axes (audit-first)`
  sur `docs/prompts/AUDIT_PROMPT_2026-10-19.md` + `docs/INDEX.md`, puis
  commit `docs(handoff)` séparé sur `handoff.md` (arbre sale → pas de
  commit handoff « arbre propre », commit explicite par chemins).

## 18) Session 2026-10-19 sexies — audit intégral EXÉCUTÉ (0 correction de code)

- **Demande opérateur** : « أنت مهندس جودة وأرشيف (code archaeologist) بمستوى
  staff+، ومكلَّف بإجراء تدقيق forensic شامل ونهائي لمشروع Veloria PoS، ثم إنتاج
  تقرير مفصّل و خطة إصلاح جذرية مرتّبة على موجات (waves) قابلة للتنفيذ. لا تُصلح
  شيئًا في هذه المرحلة. مخرجك الأساسي هو معرفة مُثبَتة + خطة. » ⇒ **3 livrables
  obligatoires** : rapport (M1) + plan en vagues (M2) + ADR optionnel (M3).
- **Livrable** :
  - `docs/reports/FULL_AUDIT_2026-10-19.md` — rapport intégral, 16 axes A→P,
    **228 findings** classifiés, chaque finding avec `file:line` + extrait +
    commande de reproduction + étiquette de confiance (PROUVÉ / DYNAMIC-RISK /
    TEST-ONLY / DUPLICATE / DELIBERATE-KEEP / REFUTED) + §12 «مُستبعد»
    (21 réfutations prouvées).
  - `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` — **11 vagues W0→W10** avec
    chemins explicites, pas, gates, rollback, dépendances, timeline, DoD,
    registre de déverrouillage des contrats gelés, et **20 décisions owner**
    en attente (§4, Q1→Q20).
  - `docs/ADR-120-guardes-de-contrat-auto-derivees.md` — **proposé** (en attente
    d'approbation) : « les gardes qui ne peuvent pas échouer ne sont pas des
    gardes ».
  - Preuves brutes : `docs/reports/maintenance/audit-raw/` (12 fichiers, 340 Ko).
- **Chiffres (avant → après)** : findings **0 → 228** (0 Critical · 23 High ·
  95 Medium · 110 Low) · canaux IPC **177** (mesure exacte) · schémas Zod réels
  **120** vs `FROZEN_SCHEMA_COUNT` **113** · `formatDzd` en render **268** sites
  vs `formatDzdSafe` **16** · `mobile/src` non typechecké **13/22** ·
  `test:coverage` **EXIT=1** (18 dépassements) · U+FFFD **113** caractères dans
  **20** fichiers `electron/ipc/*` · canaux IPC morts **6 → 3**.
- **Portes** (baseline mesuré, arbre sale) : `tsc -b` 0 · `typecheck:electron` 0
  · `typecheck:manager` 0 · `lint` exit 0 · `vitest` 121 fichiers / 804 tests
  0 · `test:db` 0 (isolé) · `verify:migrations` VERIFIED · `verify:domain`
  VERIFIED · `verify:perf` VERIFIED · `license:scan` 0 · `format:check` 0 ·
  `build` ✓ · `build:electron` ✓ (manifeste 214 fichiers) ·
  **`test:coverage` EXIT=1 — porte rouge, NON corrigée (audit-first)**.
- **Contrats gelés** : **inchangés** (aucun canal, aucun compteur, aucun
  snapshot modifié). Le passage `FROZEN_SCHEMA_COUNT` 113→120 est **proposé**
  en W4 (pas exécuté).
- **État arbre** : chantier impression (20 M + 3 N) **laissé intact** ; seuls
  `docs/reports/FULL_AUDIT_2026-10-19*.md`, `docs/ADR-120-*.md`,
  `docs/reports/maintenance/audit-raw/`, `docs/INDEX.md` et `handoff.md` sont
  commités (staging par chemins explicites, AGENTS.md §10).
- **En attente** : 20 décisions owner (Q1→Q20 du plan) — notamment **Q5**
  (commit/stash du chantier impression), **Q7** (source de vérité de la
  dette), **Q9** (`RAW_GUARDED_CHANNELS` : test ou suppression), **Q11**
  (seuil de couverture de `src/features`), **Q12** (majeur Electron) —
  plus l'approbation d'**ADR-120**.
- **Pièges** : (1) `npm run lint` scanne `docs/**` ⇒ un `.mjs` déposé sous
  `docs/` casse la porte (`allowDefaultProject` = liste de 24 chemins) ; (2)
  `test:db` échoue si lancé en parallèle d'outils lourds (`hookTimeout` 10 s
  par défaut vs 47 migrations rejouées par `beforeEach`) ; (3) `format:check`
  échoue sur tout `.md` non passé par Prettier ⇒ passer Prettier sur les
  livrables ; (4) `npm run build` seul invalide le manifeste licence.
- **Git** : commit `docs(audit): audit integral 16 axes - 228 findings, 0
correction` sur `docs/reports/FULL_AUDIT_2026-10-19.md` +
  `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` + `docs/ADR-120-*.md` +
  `docs/reports/maintenance/audit-raw/` + `docs/INDEX.md`, puis commit
  `docs(handoff): session 2026-10-19 sexies - audit integral execute (baseline
gele)` sur `handoff.md` seul.

## 19) Session 2026-10-19 septies → 2026-10-20 (remédiation : vagues W1, W2, W3)

- **Demande propriétaire** : « قم بالاصلاحات الجذرية اللازمة » (faire les
  corrections radicales nécessaires) — exécution du plan d'audit vague par
  vague, avec approbation implicitement donnée pour les vagues déjà
  listées dans `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md`.
- **Reprise de session** : la session « تدقيق Veloria PoS وخطة الإصلاح الجذري »
  (ouverte le 19/10 à 21:50) s'était interrompue au milieu de la vague **W3**
  (le commit W2 était posé, la migration 0048 était écrite mais jamais
  appliquée). W3 a été reprise depuis zéro : migrations, code main, UI,
  tests, portes, ADR.

### Vague W1 — logique financière (`0e900f1`)

- 7 High + 3 Low corrigés **sans migration** : E-20 (conversion devis remisé
  → vente : la remise globale est répartie sur les lignes, somme EXACTE au
  centime, `discount_type` reste `none` — ADR-121) · E-22 (clôture Z : espèces
  seules, dépenses `paid` seules, retours non annulés seuls) · E-23 (avoir >
  solde : plus d'ABORT technique, excédent reporté) · E-24 (source de vérité
  unique de la dette) · E-25 (annuler une vente encaissée supprime
  l'encaissement et remet le solde) · E-26 (correction de quantité journalisée
  en mouvement de stock) · E-27 (frais de livraison capitalisés dans le coût
  FIFO) · E-33 (historique : pas d'encaissements de ventes annulées) ·
  E-34 (arrondi monétaire « half away from zero » exact) · E-36 (zakat : la
  VRAIE fonction du domaine est appelée).
- Preuves : `docs/reports/maintenance/audit-raw/w1-gates.txt`.

### Vague W2 — sécurité, RBAC, contrats (`cd43aa2`)

- K-01 (`customers.accessQrSvg` exige `debts` : fuite du PIN client fermée) ·
  K-04 (`staffScope()` fail-closed : sans session, les lectures sensibles
  sont refusées) · K-05 (`database.optimize` protégé comme `database.reset`) ·
  A-09 (verrou « code à changer » appliqué aux 32 canaux bruts) ·
  A-04/A-05 (plus aucune erreur moteur brute vers l'opérateur) ·
  A-10/A-11/A-13 (`operationId` exigé sur `expenses.delete`,
  `backup.restore`, `database.relocate`) · A-17 **réfuté** (le confinement de
  `logo_path` existait déjà) · K-02/K-03 (License Manager packagé : pas de
  VITE_MANAGER_URL, `will-redirect`/`will-attach-webview` bloqués) ·
  G-15 (date calendaire impossible refusée par le Manager) · G-13 (la garde
  ESLint « pas d'arabe dans src/ » était **inerte** ⇒ remplacée par une porte
  réelle `verify:fr`, fail-closed) · G-21 (`typecheck:mobile`, `verify:fr`,
  `test:coverage` branchés dans le CI).

### Vague W3 — base de données et migrations (`833cea1`)

- **E-21 — verrou de période close** : migration `0048` (15 triggers
  `RAISE(ABORT)`) : une journée close devient **immuable** (ventes,
  encaissements, dépenses, retours, paiements fournisseurs). La seule issue
  est explicite : `closings.reopen` (nouveau canal, **gérant** uniquement,
  tracé en `audit_log` avec les montants d'origine, idempotent par
  `operationId`) + bouton « Rouvrir la journée » dans l'écran Rapports
  (gérants uniquement, confirmation explicite). Les messages des triggers
  sont mappés en FR dans `ipc-errors.ts` (sans quoi l'opérateur aurait vu
  « Une erreur inattendue est survenue »).
- **E-28 — unicité du téléphone client** : migration `0049` (2 triggers,
  comparaison sur les chiffres, miroir de `PHONE_DIGITS_EXPR`) + contrôle
  applicatif `assertPhoneAvailable` (création ET modification). Trigger et
  non index UNIQUE : un index UNIQUE échouerait sur l'historique (migration
  non applicable sur une base réelle) et interdirait la réutilisation d'un
  numéro porté par un client archivé.
- **E-31** : `paginationSchema.page` borné à 10 000 (`OFFSET` illimité
  interdit).
- **E-36** : les gardes deviennent **échecables** — `verify:migrations`
  assume 0045/0046/0047 (elles ne l'étaient pas) et ajoute les blocs
  0048/0049 + la **pureté de l'argent** (toute colonne `*_minor` est
  `INTEGER`) ; `verify:domain` vérifie que toute mutation IPC appelée
  depuis un registre est **dans une transaction** et **accepte un
  `operationId`** (59 mutations analysées, seuil de non-vacuitité = 40).
- **F-08** : la sonde de vérification d'une copie de base a des pragmas
  (`busy_timeout`, `foreign_keys`, `query_only`, `trusted_schema`).
- **Contrats modifiés** (ADR-122) : canaux IPC servis 176 → **177**
  (snapshot mis à jour) · `FROZEN_SCHEMA_COUNT` 113 → **114** (total réel
  120 → **121**) · migrations 47 → **49** (`0001..0047` IMMUABLES, 0048/0049
  **nouveaux**) · arête inter-features `reports>staff` ajoutée à la liste
  blanche du test A3 (`staff` est une feuille ⇒ zéro cycle).

### Portes (mesurées sur l'arbre sale, chantier impression non commité)

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `typecheck:manager`
0 · `eslint --max-warnings 0` exit 0 · **vitest 130 fichiers / 857 tests 0** ·
**test:db 36 fichiers / 162 tests 0** (isolé, sinon `Hook timed out`) ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `license:scan` 0 · `build` ✓ (30.3 s) · `build:electron` ✓
(manifeste signé 217 fichiers). **`test:coverage` reste ROUGE (EXIT 1, 18
dépassements) — c'est l'objet de la vague W4.**

### Nouveaux tests (17 cas)

`tests/database/closing-period-lock.test.ts` (6) ·
`tests/database/customers-phone-unique.test.ts` (6) ·
`tests/integration/closing-reopen.test.ts` (5).

### En attente / à faire

1. **W4** (prochaine vague) : `test:coverage` EXIT 0 + gardes auto-dérivées
   (`validators.staff.ts` ⇒ `FROZEN_SCHEMA_COUNT` 114 → 121) + test
   d'énumération de `RAW_GUARDED_CHANNELS`.
2. **Q5 non tranché** : le chantier impression (20 M + 3 nouveaux) reste
   **intact et non commité** — commit ou stash ? (décision propriétaire).
3. **20 décisions owner** du plan (§4) encore ouvertes (Q1→Q20), dont Q6
   (avoir en cours), Q7 (source de vérité de la dette), Q17 (jour métier
   `Africa/Algiers`), Q19 (APK/EAS).
4. **ADR-120** (gardes de contrat auto-dérivées) toujours **proposé**, non
   approuvé.
5. **E2E à rejouer** avant tout tag : `staff-session` et `full-loop-client`
   (touchés par K-04 en W2) + le nouveau canal `closings.reopen`.
6. `verify:licensing`, packaging `release/` et `npm audit` (réseau) non
   relancés.

### Pièges de cette session

- `better-sqlite3` est compilé pour l'**ABI Electron** (136) : tout script
  Node qui l'importe échoue (`NODE_MODULE_VERSION 127`). Contournement :
  `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` — c'est aussi le moyen de
  lire la base `opencode.db` pour retrouver l'historique d'une session.
- Le console PowerShell affiche le UTF-8 en mojibake : ne jamais écrire un
  `.md` via `Set-Content` (le fichier serait corrompu). Écrire via l'outil
  d'édition ou un script Node en UTF-8, puis passer Prettier.
- Une arête inter-features nouvelle ⇒ **le test A3 échoue** : penser à mettre à
  jour `tests/unit/a3-organisation.test.ts` dans le même commit.
- `eslint` casse sur tout `.cjs`/`.mjs` déposé à la racine du dépôt (hors
  `allowDefaultProject`) : les scripts d'analyse temporaires doivent être
  supprimés avant de commiter.

### Git

`0e900f1` (W1) · `cd43aa2` (W2) · `833cea1` (W3) — 3 commits, staffage par
chemins explicites (le chantier impression n'a jamais été balayé). Le commit
`docs(handoff)` de cette section est séparé, conformément à AGENTS.md §10.

## 20) Session 2026-10-20 (bis) — remédiation : vague W4 (couverture + gardes)

- **Demande propriétaire** : « اكمل » (continuer) — exécution de la vague
  suivante du plan d'audit : **W4 — couverture et tests**.
- **État hérité** : W1/W2/W3 commitées (`0e900f1`, `cd43aa2`, `833cea1`),
  `handoff.md` à jour (§19). `test:coverage` était **ROUGE** (EXIT 1,
  18 dépassements de seuil sur 5 fichiers domain) alors qu'il est **dans le
  CI depuis W2/G-21** ⇒ le CI était cassé par la vague W2.

### Ce qui a été fait

- **Aucun seuil abaissé** : les seuils par fichier restent
  `statements 80 / branches 75 / functions 88 / lines 80` (`perFile: true`).
  La couverture est passée de **89,3 % → 95,63 %** des lignes et
  **82,04 % → 86,96 %** des branches, **100 %** des fonctions.
- **33 nouveaux tests** (`tests/unit/domain-rules-coverage.test.ts`) sur les
  règles domaine non testées : produit (fiche, codes-barres EAN), retours
  (`computeReturnLineTotal` / `validateReturnLines` — **jamais appelées**
  avant), fournisseurs (tous les plafonds de champs, soldes, paiement >
  dette), bons de commande (200 lignes, transitions, libellés FR), import CSV
  (prix/quantité invalides, doublon, en-tête, plafond 5 000, clients).
- **6 nouveaux tests OCR** + **bug de production corrigé** :
  `src/domain/ocr/parser.ts:86` — le quantificateur `{12,13,14}` est
  INVALIDE en JavaScript (3 valeurs ⇒ motif littéral) ⇒ **les codes-barres
  EAN-13/UPC-A n'étaient JAMAIS extraits** de l'analyseur de factures
  (seuls les codes à 8 chiffres passaient). Corrigé en `{12,14}`.
- **Gardes rendues auto-dérivées** (capables d'échouer) :
  `RAW_GUARDED_CHANNELS` (constante décorative ⇒ **appliquée** : scan
  complet de `electron/`, 34 canaux gardés, 5 exceptions documentées avec
  raison) · `FROZEN_SCHEMA_COUNT` 114 → **121** (`validators.staff.ts`
  inclus) · `bridge-shape` : **tous** les exports (127) au lieu des seuls
  `*Schema`, seuil gelé (127), 0 export mort, 8 schémas NESTED documentés ·
  `operation-id-coverage` : classification **complète** (43 REQUIRED +
  20 exceptions LWW + assertion « tout schéma non listé n'exige pas
  operationId ») · `ipc-channel-inventory` : `ocr.progress` push-only
  vérifié explicitement · `a1-p0-boundary` : le test creux (C-05) réécrit
  (date impossible **réellement** refusée) · `pin-kdf-parity` : parité
  **comportementale** (main + relais E2E + fonction Edge **exécutés**,
  condensats comparés ; constantes comparées numériquement) + parité KDF
  **équipe** ajoutée (elle n'existait pas).
- **4 tests « miroir » convertis à la production** (I-03) :
  `payment-receipt` (→ `getCustomerPaymentReceipt`), `operation-id`
  (→ `saveZakatCalculation`), `carts-drafts` (→ `save/load/clear`),
  `atomic-slices` (→ `receiveStockAtomic`). Un « miroir » réécrivait la
  logique de production dans le test : il restait vert même si la
  production était supprimée ou inversée.
- **Timeouts** : `hookTimeout` 10 s → **60 s** (chaque `beforeEach` rejoue
  49 migrations ⇒ 12 « Hook timed out » en exécution parallèle) ;
  `testTimeout` 15 s → **60 s** (la couverture instrumente tout le code :
  `client-loop` et `repair-hardening` dépassaient 15 s ⇒ faux négatifs).
- **CI** : `npm run test:coverage` était déjà présent (W2) mais ROUGE ⇒ il
  devient vert. `npm run verify:licensing` **non** ajouté (il vérifie l'état
  local du Manager — clé privée + `.vlic` importé — absent d'un runner :
  il resterait rouge ; c'est une porte post-release vendor, comme `package*`).

### Portes (arbre sale, chantier impression non commité)

`test:coverage` **EXIT 0** (95,63 % lignes · 86,96 % branches · 100 %
fonctions) · `vitest` **132 fichiers / 907 tests** 0 · `test:db` **36
fichiers / 164 tests** 0 · `tsc -b` 0 · `typecheck:electron` 0 ·
`typecheck:manager` 0 · `eslint --max-warnings 0` exit 0 · `format:check` 0 ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `verify:fr` 0 · `license:scan` 0 · `build` ✓ (28,6 s) ·
`build:electron` ✓ (manifeste signé 217 fichiers).

### Contrat gelé modifié (ADR-123)

`FROZEN_SCHEMA_COUNT` 114 → **121** · nouvel invariant
`FROZEN_EXPORT_COUNT = 127` · liste `REQUIRED` de `operation-id-coverage`
complétée (23 → **43**). La cible de W4 prévue au plan (120) devient **121**
à cause du schéma `closingReopenSchema` ajouté en W3.

### En attente / à faire

1. **W5** (prochaine vague) : rendu et ergonomie caissier — `formatDzd()`
   qui throw pendant le rendu (268 sites), double-submit, `useBusyFlag`,
   écrans qui meurent.
2. **Q11** (seuil de couverture de `src/features`) : périmètre inchangé
   (`src/domain` + `src/application`, 80/75/88/80 par fichier). L'extension à
   l'UI (119 fichiers) reste à arbitrer.
3. Les **11 autres fichiers « miroir »** de l'audit (I-03) : à auditer vague
   par vague (le patron de conversion est donné par les 4 converts).
4. **Q5** toujours ouvert (workshop impression), **20 décisions owner**
   (§4 du plan), **ADR-120** toujours proposé non approuvé.
5. **E2E à rejouer** avant tout tag : `staff-session`, `full-loop-client`.

## 23) Session 2026-10-21 (bis) - diagnostic des 3 bugs caisse (propriétaire)

**Demande** : « عند إضافة منتج حر إلى السلة… الاسم يكتب عادي لكن السعر يرجع
لخانة الاسم » · « منتج بالوزن 700 دج/كغ، بيع 50 دج ⇒ السلة تكتب 49,7 دج »
· « السلة مختلطة (حر + وزن + قائمة + خصة) ⇒ البيع لا يمر ويظهر خطأ ».

**Méthode** : lecture du code + **preuve par les données réelles** —
journal main `%APPDATA%\Veloria PoS\logs\veloria-2026-10-21.log` + base
`%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite` (6 ventes, 10 lignes) +
reproduction sur base migrée temporaire (repos réels `createSaleAtomic`).

### B1 — focus qui revient au champ « Nom » (article libre)

`useDialogFocus` (`src/shared/ui/primitives.tsx:313-355`) : `useEffect` avec
dépendances `[boxRef, onClose, extraKey]`. `onClose` arrive du parent sous
forme de flécheta **inline** (`SellScreen.tsx:297` `onCloseCustom={() =>
s.setCustomOpen(false)}`) ⇒ **identité nouvelle à chaque rendu** ⇒ l'effet
rejoue à chaque frappe : le cleanup rend le focus à l'ouvrant puis l'effet
refocus **le PREMIER `input` du dialogue** = « Nom du produit » (le prix est le
2ᵉ). Symptôme exact : 1 chiffre saisi puis retour au nom.
**Portée : tous les modales/tiroirs** dont `onClose` est inline (visible
seulement là où le champ|Lu n'est pas le premier).
Correctif : `onClose`/`extraKey` dans une ref, dépendances `[boxRef]` seul.

### B2 — montant saisi au poids ≠ montant facturé (49,70 au lieu de 50,00)

`weightDialogPreview` (`src/features/sales/sell/sell-weight.ts:64-84`) : mode
« Montant » → `qty = round(montant/prix, 3 déc.)` puis
`total = prix × qty` (`computeLineTotal`). 50,00 DZD à 700,00 DZD/kg ⇒
`qty = 0,071 kg` ⇒ total = **49,70 DZD** (100,00 DZD ⇒ 0,143 kg ⇒ **100,10**).
Le montant exact est **perdu** : `onConfirm(preview.qty)` ne transmet que la
quantité. **Preuve base réelle** : vente `FAC-2026-00006`, ligne « bil »
⇒ `quantity 0.071`, `line_total_minor 4970`.
Comportement « par design » (ADR-114 : facturer le poids arrondi), mais le
caissier **perd de la argent** ⇒ écart métier à trancher (voir §23 « à
trancher »).

### B3 — vente du panier mixte refusée (cause PROUVE)

Journal main, 7 fois le 2026-10-21 (20:27→20:32 UTC), canal `sales.create` :
`CHECK constraint failed: discount_amount_minor >= 0`.
Mécanique : un prix de ligne **supérieur** au prix d'origine (majoration)
⇒ remise de ligne **négative** (`origin − facturé < 0`) ⇒ le domaine
l'accepte (remise signée, « majoration admise ») mais la base l'interdit
(`sales.discount_amount_minor >= 0` — migration 0001 immuable + trigger
`trg_sale_items_discount_nonneg_ins` — migration 0031) ⇒ rollback total ⇒ le
caissier voit « Une erreur inattendue est survenue. Réessayez. »
**Lien B1 → B3** : le focus B1 tronque la saisie du prix de l'article libre
(ex. « 5 » au lieu de « 500 ») ⇒ le caissier corrige via le P.U. du panier
(prix **supérieur**) ⇒ la vente est refusée.
**Aggravant** : la garde main « Remise de ligne invalide pour « X » » est
exécutée **APRÈS** l'INSERT de la vente (boucle des lignes) ⇒ l'erreur SQL
brute gagne ⇒ message technique au lieu du FR (violation AGENTS §6).
Reproduction (repos réels, base migrée) : `discountAmount = -49500` ⇒
`CHECK constraint failed: discount_amount_minor >= 0`, **0 vente créée**.

### Constat secondaire (à vérifier)

Ventes `FAC-2026-00001/3/4/6` enregistrées avec `amount_paid_minor = 0` ⇒
**ventes à crédit** (reste = total) au lieu d'encaissement comptant ; la
vente 6 a `credit_limit_override = 1` (le caissier a coché le dépassement).
Piste : l'effet de synchro `paidText → cart.amountPaidMinor`
(`useSellState.ts:190-195`) borne à `totalMinor`, qui vaut **0** quand
`computeSaleTotals` lève (« Le montant payé doit être entre 0 et le total »,
soit un panier qui rétrécit après un montant saisi) ⇒ montant payé → 0.

### À trancher par le propriétaire

1. **B2** : (a) facturer le poids arrondi (ADR-114) mais l'annoncer
   explicitement (« 50,00 DZD ⇒ 71 g ⇒ 49,70 DZD facturés ») ; (b) facturer
   le montant saisi **exact** ⇒ la ligne porte un montant facturé propre ⇒
   la remise peut devenir négative ⇒ **reconstruction de la table `sales`**
   (SQLite ne sait pas supprimer un CHECK) + trigger 0031 + domaine + rapports
   ⇒ **nouvelle migration + ADR** ; (c) compromis : facturer le montant
   exact en portant un prix unitaire effectif (perte du prix catalogue sur le
   ticket).
2. **B3** : (a) interdire la majoration (message FR : « le prix ne peut pas
   dépasser le prix catalogue ») — simple, invariant DB respecté ; (b)
   autoriser la majoration de bout en bout (remise signée) ⇒ même migration
   que B2(b) ⇒ **une seule migration** pour les deux.
3. **B1** : correctif obvious (ref dans `useDialogFocus`) + test de non-régression.

**Aucun code modifié dans cette session** (diagnostic seul ; le fichier de
reproduction temporaire a été supprimé).

### Correctifs APPLIQUÉS (2026-10-22) — ADR-131

**Décisions propriétaire** : B2 ⇒ (b) facturer le montant saisi **exact** ;
B3 ⇒ (b) autoriser la majoration ⇒ **une seule migration** pour les deux ;
B1 ⇒ correctif + test.

| Fichier                                                                                                   | Correction                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/ui/primitives.tsx`                                                                            | `useDialogFocus` : `onClose`/`extraKey` dans des refs « dernière valeur » ; l'effet ne dépend plus que de `[boxRef]` ⇒ **plus de refocus du 1ᵉʳ champ** (corrige B1 pour TOUS les dialogues)               |
| `database/migrations/0051_sales_signed_discount.sql`                                                      | **NOUVEAU** : reconstruction de `sales` ⇒ `discount_amount_minor` **signé** (borne −1e11) ; triggers 0031 « remise non négative » remplacés par un plancher borné ; marqueur `-- veloria:foreign-keys-off` |
| `electron/database/sqlite.service.ts`                                                                     | Runner : migration « FK off » (FK désactivées **avant** la transaction — `PRAGMA foreign_keys` est un no-op dedans) + `PRAGMA foreign_key_check` fail-closed après                                         |
| `src/domain/sales/sale-rules.ts`                                                                          | `billedTotalMinor` sur la ligne ; `computeBilledTotal()` (montant saisi validé : entier > 0 + borne d'arrondi 0,0005 × prix + 1) ; `billedAmountToleranceMinor()`                                          |
| `electron/ipc/money-guard.ts`                                                                             | Miroir main : `priceLine({ billedTotalMinor })` + tolérance (parité prouvée par `money-guard-parity.test.ts`)                                                                                              |
| `electron/ipc/handlers/sales.repo.ts`                                                                     | `validateSaleLines()` **AVANT** l'INSERT (messages FR, plus de CHECK SQL brut) ; remise signée bornée ; `raisedLines` (majorations) dans l'audit                                                           |
| `electron/ipc/validators.sales.ts` / `validators.documents.ts` / `validators.print.ts`                    | Champ optionnel `billedTotalMinor` (vente, devis, brouillon) ; le validateur d'impression accepte le montant saisi dans la borne d'arrondi                                                                 |
| `electron/ipc/credit-gates.ts` / `registry.sales.ts` / `registry.documents.ts` / `handlers/carts.repo.ts` | Total facturé = montant saisi (gate crédit, payload vente, devis, brouillons)                                                                                                                              |
| `src/features/sales/sell/sell-weight.ts`                                                                  | Aperçu « Montant » = **montant saisi** (50,00 DZD ⇒ 50,00 DZD)                                                                                                                                             |
| `src/features/sales/sell/QuantityDialog.tsx` / `SellOverlays.tsx` / `SellScreen.tsx` / `sell-search.ts`   | Le montant saisi est transmis jusqu'à la ligne du panier (`billedTotalMinor`)                                                                                                                              |
| `src/features/sales/cart-store.ts`                                                                        | Deux lignes à montants facturés DIFFÉRENTS ne fusionnent plus (le poids s'additionne, le montant non)                                                                                                      |
| `src/features/sales/sell/CartPanel.tsx` / `sell-totals.ts`                                                | Total de ligne = montant facturé ; marque « montant saisi » dans le panier ; le ticket porte le montant exact                                                                                              |
| `src/features/sales/sell/PriceDialog.tsx`                                                                 | La **majoration** est annoncée en clair (« Majoration : ce prix dépasse le prix catalogue… l'écart sera tracé dans l'audit »)                                                                              |
| `src/features/sales/sell/cart-drafts.ts`                                                                  | Le montant facturé survit au redémarrage (brouillon)                                                                                                                                                       |

**Tests ajoutés** : `tests/unit/sales/sale-signed-discount.test.ts` (9),
`tests/integration/sale-signed-discount.test.ts` (3, repos réels),
`tests/unit/ui-dialog-focus.test.ts` (3),
`tests/unit/money-guard-parity.test.ts` (+1 bloc parité montant saisi).

**Portes (arbre propre, 2026-10-22)** : `tsc -b` **0** · `eslint --max-warnings 0` **0** ·
`format:check` **0** · `vitest` **145 fichiers / 992 tests** **0** ·
`test:db` **40 / 186** **0** · `verify:migrations` **VERIFIED** ·
`verify:domain` **VERIFIED** · `verify:fr` **0** (322 fichiers) ·
`verify:encoding` **0** (872 fichiers) · `verify:perf` **VERIFIED** · `knip` **0**.

**À faire** : rejouer l'E2E (non relancés depuis le 2026-10-18) · reconstruire le
packaging (la migration 0051 change le schéma : `release/` à refaire) ·
**constat secondaire** (§23 « Constat secondaire ») : 4 ventes enregistrées avec
`amount_paid_minor = 0` (ventes à crédit au lieu d'encaissement) — piste :
l'effet de synchro `paidText → cart.amountPaidMinor` borné à `totalMinor`
(qui vaut 0 quand `computeSaleTotals` lève). **Non traité dans cette session.**

## 21) Session 2026-10-21 — remédiation : fin du plan d'audit (W6, W7, W10)

- **Demande propriétaire** : « اكمل الجلسة المسماة "تدقيق Veloria PoS وخطة
  الإصلاح الجذري" المفتوحة بتاريخ 20 oct 2026 على الساعة 14:56 » — reprise
  exacte de la session `ses_ea6665c78ffeLz5b52nyesQy1d` (état restauré depuis
  `opencode.db` : 804 messages, work-in-progress W6 interrompu sur une
  question au propriétaire).
- **État hérité** : W1→W5, W8, W9 commitées ; **W6 (code mort) à moitié
  fait** (4 fichiers modifiés, non commités) ; la question laissée en
  suspens portait sur `expo-constants` (dépendance mobile fantôme).

### Vague W6 — code mort trié (`60211cf`, ADR-127)

- **Correction d'un excès de la session précédente** : la suppression
  aveugle des 24 ré-exports du barrel d'impression a **cassé le build**
  (`tsc` : 8 symboles consommés par la suite de tests) ⇒ le rapport `knip`
  **ne voit pas** l'usage par les tests : la preuve, c'est la porte
  `typecheck`, pas l'outil. Règle retenue : _recherche exhaustive + tsc +
  suite complète_, jamais le rapport seul.
- **B-03** : le miroir main du constructeur de QR V1 est supprimé (le POS
  n'émet plus que la V2) ; le **format** V1 reste lu par l'APK et décrit par
  le use-case applicatif (spécification exécutée par son test).
- **B-02** : `clearSecureState()` supprimé (aucun flux ne l'appelait).
- **B-32** (décision propriétaire : « retirer + lockfile régénéré ») :
  `expo-constants` retirée de `mobile/package.json` ; le lockfile n'est
  modifié que sur **une ligne** (npm réécrivait aussi des champs `libc`
  sans rapport — écartés pour ne pas polluer la revue) ; la dépendance reste
  dans l'arbre comme **transitive** de `expo` (correct).
- **B-36** : `tailwindcss` retiré de `ignoreDependencies`.
- **O-05** : les 2 commentaires arabes de l'impression sont corrigés ⇒ la
  liste `PENDING_WORKSHOP` de `verify-fr-only.mjs` est **supprimée** (la
  garde FR est pleine : 321 fichiers, plus de dérogation temporaire).
- Résultat : **`knip` = 0** (0 fichier, 0 export, 0 type, 0 dépendance).

### Vague W7 — règles uniques (ADR-128)

8 duplications supprimées, une par une, avec test de parité :

| #    | Règle unique (source)                                    | Copies supprimées                                               |
| ---- | -------------------------------------------------------- | --------------------------------------------------------------- |
| D-02 | `parseQuantityInput` (`domain/common/quantity.ts`)       | `parseQtyInput`, `parseQty`, `parseQuantityInput` (weight-sale) |
| D-03 | `formatQuantityFr` (idem)                                | `fmtQty`, `formatQtyFr`                                         |
| D-04 | `percentOfMinor` (`domain/money/money.ts`)               | 2 calculs _inline_ (zakat, restockage)                          |
| D-05 | `multiplyMinorByQuantitySafe` (variante qui ne lève pas) | 7 `Math.round(prix × qté)` sans garde                           |
| D-06 | `daysBetween` (`domain/common/dates.ts`)                 | 3 implémentations d'écart en jours                              |
| D-07 | `strictOrNum` (`@shared/money/parse.ts`)                 | copie locale (réception)                                        |
| D-08 | `toMinorSafe` (`domain/money/money.ts`)                  | `asMinor`                                                       |

- **E-29** : le renderer normalise désormais le nom client **exactement**
  comme le main (« Cœur » ⇒ `coeur`, plus « c eur ») + test de parité sur
  16 vecteurs.
- **E-30** : l'état `'overdue'` **existe enfin** (règle unique dans
  `electron/ipc/handlers/debt-status.ts` : une vente ouverte échue) — écrit
  dans les 4 écritures du solde **et** recalculé à la lecture (l'échéance
  dépend du temps : un état matérialisé ne peut pas suivre le temps) ;
  `agingBucket` (code mort) supprimé. Trois flux ont été réordonnés
  (encaissement, avoir sur retour, annulation) pour que le statut soit lu
  dans l'état final de la transaction.
- **J-11** : `knip` couvre `license-manager/**` et `cloud/**` (la Edge
  Function est déclarée `entry`).
- 2 nouveaux tests : `parity-normalisation.test.ts` (E-29) et
  `money-rule-convergence.test.ts` (D-02 → D-08).

### Vague W10 — état d'erreur persistant (ADR-129)

- **A-06** : 12 écrans de données déclarent un état d'erreur **persistant**
  (`loadError`) et l'affichent via la nouvelle primitive `ErrorState`
  (`role="alert"`, message FR, icône) — l'erreur ne disparaît plus en 4,5 s
  et un tableau vide après un échec ne passe plus pour « aucune donnée ».
- Garde : `tests/unit/a06-screen-error-state.test.ts` (14 cas) parcourt les
  écrans et exige état + affichage (exemptions documentées : licence,
  caisse, réglages).
- **A-28** : le téléphone/e-mail codés en dur dans « À propos » sont
  remplacés par la **fiche entreprise** (réglable par le commerçant).
- **A-07 / A-27** : déjà traités en W5 (rappelés dans l'ADR).

### Portes (arbre propre, 2026-10-21)

`test:coverage` **EXIT 0** (95,83 % lignes · 87,19 % branches · 100 %
fonctions — aucun seuil abaissé) · `vitest` **140 fichiers / 964 tests** 0 ·
`test:db` **38 fichiers / 177 tests** 0 · `tsc -b` 0 · `typecheck:electron` 0 ·
`eslint --max-warnings 0` exit 0 · `format:check` 0 · **`knip` 0** ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `verify:fr` 0 (322 fichiers) · `verify:encoding` 0 (864 fichiers) ·
`license:scan` 0 (1367 fichiers) · `build` ✓ (12,1 s) · `build:electron` ✓
(manifeste signé 216 fichiers).

### Packaging (2026-10-21, après les vagues)

`release/` **reconstruit de zéro** (ADR-023 : jamais de réutilisation) :

| Artefact                                        | Taille   | SHA-256 (début)                                                    |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `Veloria-PoS-Setup-1.0.0.exe` (NSIS machine FR) | 129,4 Mo | `3fa6b662b3c963f14cbb4a20040cde7693e54650adff9194b8660634f63f868f` |
| `Veloria-PoS-Portable-1.0.0.exe`                | 128,9 Mo | `60742079adbb07637f3d92a1222d46305a6127d34f3c5ebd095ae7ec87a530e5` |
| `Veloria-License-Manager-Setup-1.0.0.exe`       | 111,5 Mo | `021da8b4684bf3da87dc1ca0d1340914533ee9acd1af5325f9c05973a99a3331` |
| `Veloria-License-Manager-Portable-1.0.0.exe`    | 111,1 Mo | `55f7e68535afea531274aed7b69ceec11b419f05fd7c624cd1cb84e1c3ffeec7` |

- 2 `.blockmap` + `SHA256SUMS.txt` + `release/win-unpacked/` (= POS).
  `release:smoke` **EXIT 0** (dist, preload sandbox-safe, stamps CommonJS,
  manifeste manager) · `better-sqlite3` **chargé dans le runtime packagé**
  (Electron 37.2.0, ABI 136, SQLite 3.50.2 — règle AGENTS.md §9).
  **APK mobile non construit** : ni EAS CLI/jeton, ni JDK/Android SDK, ni
  `EXPO_PUBLIC_*` réel (placeholders) ⇒ action propriétaire.

### En attente / à faire

1. **E2E à rejouer** avant tout tag : `staff-session` et `full-loop-client`
   (touchés par K-04 en W2 et par le canal `closings.reopen` en W3).
2. `verify:licensing`, packaging `release/`, `npm audit` (réseau) non
   relancés (hors périmètre / réseau).
3. **ADR-120** toujours _proposé_ (non approuvé) · les autres décisions
   owner du plan (§4) : Q6 (avoir en cours), Q7 (source de vérité de la
   dette), Q17 (jour métier `Africa/Algiers`), Q19 (APK/EAS).
4. Reste à faire hors plan d'audit : Q11 (extension du seuil de couverture
   à `src/features`), les 11 autres fichiers « miroir » (I-03).

### Pièges de cette session

- **`knip` ne voit pas l'usage d'un export par les tests** ⇒ ne jamais
  supprimer sur la foi du rapport : recherche exhaustive + `tsc -b` + suite.
- **Packaging** : `package:win` / `package:manager` exigent le privilège
  symlink (`signAndEditExecutable: true`, ADR-070) ⇒ **Developer Mode**
  (`AllowDevelopmentWithoutDevLicense=1`) pour construire **sans admin**.
  Les deux configs partagent `directories.output: release` ⇒ le second
  build **écrase `release/win-unpacked`** : construire le POS **en dernier**
  pour que `win-unpacked` contienne le POS (c'est lui qu'on teste au
  runtime). Le cache electron-builder est vide ⇒ premier build télécharge
  Electron (123 Mo) + winCodeSign + NSIS (~6 min).
- `npm run test:coverage 2>&1 | Select-Object -First N` : le `-First` ferme
  le pipeline et **tue** le run (sortie tronquée) ⇒ écrire dans un fichier
  (`> file 2>&1`) puis lire le fichier.
- `opencode.db` (historique des sessions) s'ouvre avec
  `node --experimental-sqlite` : `better-sqlite3` du projet est compilé pour
  l'ABI Electron (136) et refuse de charger sous Node 22 (ABI 127).
- Un `while` de recherche qui ne fait pas progresser l'index boucle à
  l'infini : écrire les scripts Node hors du dépôt (dossier TEMP) et les
  supprimer après usage (un `.cjs` à la racine casse `eslint`).
- **Vérifier le module natif packagé** : `require` du chemin **asar**
  (`resources/app.asar/node_modules/better-sqlite3`), pas du chemin
  `app.asar.unpacked` (le `bindings` n'y est pas) —
  `ELECTRON_RUN_AS_NODE=1 "release\win-unpacked\Veloria PoS.exe" script.js`.

## 22) Session 2026-10-21 (bis) — import/export CSV (Clients, Produits) + re-emballage

- **Demande propriétaire** : « اضف خاصية الاستراد و التصدير في صفحتي
  العملاء و المنتجات و تحقق منهما » — l'import clients et l'export produits
  manquaient (les deux écrans étaient asymétriques).
- **État hérité** : W1→W10 commitées, `release/` reconstruit (§21), arbre
  propre. Une **session concurrente** travaille sur un bug « panier mixte »
  (fichier `tests/integration/_repro-mixed-cart.test.ts`, TEMP) : ce fichier
  n'a **pas** été touché ni commité (staffage par chemins explicites).

### Ce qui a été fait (ADR-130, commit `8b55f3c`)

- **Import clients** (slice verticale complète) : le parseur de domaine
  existait déjà (`parseCustomersCsv`) mais **personne ne l'utilisait** ⇒
  chemin d'écriture complet :
  `importCustomersAtomic` (main, UNE transaction, tout-ou-rien) · canal
  `customers.import` + `customersImportSchema` (Zod) · preload ·
  `api.customerImport` · portes staff (`debts`) et licence (`customers`) ·
  bouton « Import CSV » + champ fichier masqué + confirmation FR.
  Garanties : unicité du téléphone **E-28** vérifiée AVANT l'écriture (message
  FR, pas de rollback du trigger 0049) · doublon dans le même fichier refusé ·
  **idempotence de lot** par `operationId` · `search_norm` recalculé (0047) ·
  aucune dette/plafond créés (l'import ne fait que des fiches).
- **Export produits** (renderer) : **toutes** les pages du filtre courant
  (parcours borné en concurrence + progression), montants DZD formatés,
  code-barres et statut inclus.
- **Contrats gelés** (documentés dans l'ADR) : canaux 177 → **178** ·
  `FROZEN_SCHEMA_COUNT` 121 → **122** · `FROZEN_EXPORT_COUNT` 127 → **128** ·
  `FROZEN_SCHEMA_TOTAL` 121 → **122** · `operationId` REQUIRED 43 → **44**.
- **Tests** : `tests/integration/customers-import.test.ts` (6 cas) +
  `tests/unit/import-export-ui.test.ts` (6 cas : garde statique du câblage
  renderer + lignes CSV de l'export + interdiction SQLite/Node dans l'UI) +
  `tests/e2e/csv-import-export.spec.ts` (**3 cas, E2E RÉEL** : le fichier CSV
  est importé par le main et la fiche apparaît dans le tableau avec son
  téléphone ; un fichier invalide est refusé **sans écrire de fiche** ; les
  deux exports parcourent le filtre et rapportent le compte de lignes).
  Note : l'événement `download` de Playwright n'est pas émis par Electron
  (téléchargement géré par la session Chromium) ⇒ l'export est vérifié par
  son **effet** (toast FR) et son contenu par le test unitaire.

### Packaging refait avec la feature (release/)

`release/` reconstruit **après** l'import/export (ADR-023 : jamais de
réutilisation) : `Veloria-PoS-Setup-1.0.0.exe` + `.blockmap` ·
`Veloria-PoS-Portable-1.0.0.exe` · `Veloria-License-Manager-Setup-1.0.0.exe`

- `.blockmap` · `Veloria-License-Manager-Portable-1.0.0.exe` ·
  `SHA256SUMS.txt` · `win-unpacked/` (= POS).

`release:smoke` **EXIT 0** · `better-sqlite3` **chargé dans le runtime
packagé** (Electron 37.2.0, ABI 136, SQLite 3.50.2 — règle AGENTS.md §9).

### Formats (rappel)

- **export = RAPPORT** (lisible dans Excel) ;
- **import = flux de DONNÉES** : clients `prénom;nom[téléphone]`, produits
  `nom;vente;achat;quantité[;code-barres]` (en-tête optionnel) ;
- un export ré-importé n'est pas un aller-retour : il échoue proprement
  (format / téléphone déjà utilisé ⇒ message FR, **rien n'est écrit**) plutôt
  que de créer des doublons.

### Portes

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `eslint
--max-warnings 0` 0 · `knip` 0 · `vitest` **142 fichiers / 976 tests** 0 ·
`test:db` **39 fichiers / 183 tests** 0 · `verify:migrations/domain/perf`
VERIFIED · `verify:fr` 0 (322 fichiers) · `verify:encoding` 0 (868 fichiers) ·
`license:scan` 0 (1420 fichiers) · `test:coverage` **EXIT 0** (95,83 % lignes) ·
`build` + `build:electron` ✓ (manifeste signé 216 fichiers).

## 24) Session 2026-10-22 — diagnostic « grand blanc après le code-barres » (facture de vente imprimée)

**Demande propriétaire** : « فاتورة البيع عندما تطبع هناك فراغ كبير بعد الكودبار »
= le ticket de vente imprimé laisse un grand blanc après le code-barres.

**Périmètre** : une vente ne sort **qu'en ticket thermique 58/80** (ADR-117 :
jamais d'A4 pour une vente) ⇒ le document visé est `thermalHtml()`
(`electron/printing/receipt-documents/thermal.ts`), alimenté par
`receiptCodes()` (`printing.enrich.ts:277`) — code-barres = **N° de facture**.

**Preuve** : HTML du ticket reconstruit hors application (esbuild + Chromium
headless, mise en page papier 80 mm = 302 px CSS) puis mesures DOM
(`getBoundingClientRect` / `scrollWidth`).

### Cause 1 — le ticket n'impose PAS le format de page ⇒ le blanc final

`printOptions()` (`printing.printer-settings.ts:55-67`) ne renvoie que
`{ silent, deviceName }` : **aucun `pageSize`** ⇒ Chromium prend le format
**par défaut du pilote** (A4 / 297 mm sur la plupart des pilotes thermiques) et
pose le ticket (colonne de 74 mm) dans le coin d'une page de 210×297 mm.
Le contenu du ticket **se termine par le bloc codes** (code-barres + QR +
payload — `thermal.ts:191-200`, dernier enfant du `<div>` racine) ⇒ **le grand
blanc arrive immédiatement après le code-barres**. Même défaut côté export PDF :
`pageSize: { width: 80000, height: 297000 }` (`printing.pdf-exports.ts:62` et
`:123`) ⇒ page de 297 mm pour ~185 mm de contenu.
Le seul chemin qui impose un format exact est celui des **étiquettes**
(`printHtmlPages` → `pageSizeMicrons`, `printing.templates.ts:246-248`).

### Cause 2 — le Code 39 n'est jamais mis à l'échelle ⇒ code-barres TRONQUÉ

`code39Svg()` (`receipt-documents/barcode39.ts:73-95`) renvoie un SVG à
**largeur intrinsèque** = 16 glyphes (14 car. + `*` début/fin) × 27 px + 15
écarts × 2 px = **462 px** (module étroit 2 px, large 5 px).
Le bloc thermique l'insère dans une colonne de **280 px** (80 mm) / **200 px**
(58 mm) avec `overflow:hidden` (`thermal.ts:193-194`) ⇒ la barre est **coupée à
61 % (80 mm) / 43 % (58 mm)** ⇒ code-barres illisible au scan.
Le `<text>` du SVG est centré sur la largeur **intrinsèque** (x = 231) ⇒ à
80 mm il est calé à droite (x 185→278), à **58 mm il disparaît totalement**
(x 185→278 vs fenêtre 0→200) ⇒ plus aucun numéro lisible sous la barre.
Les deux autres rendus d'objets KNOW, eux, mettent le code-barres à
l'échelle : A4 `.barcode svg{max-width:230px;height:auto}`
(`receipt-documents/proforma.ts:143`) et étiquettes
`.label svg{max-width:100%;height:auto}` (`receipt-documents/labels.ts:114`) —
**seul le thermique a été oublié** (le conteneur a été ajouté en `6ee2862`,
ADR-050/057).
Correctif vérifié en navigateur : `svg{max-width:100%;height:auto}` ⇒ 462→280 px,
hauteur 34 px, `<text>` recentré (x 112), `scrollWidth` 280 (plus de
débordement).

### Constat secondaire

Le payload QR s'affiche **deux fois** sur le ticket : ligne texte `QR : …`
(`receipt-text.ts:225-226`) + bloc 9 px sous le QR (`thermal.ts:196-198`).

### Correctifs proposés (NON appliqués — diagnostic seul)

1. Imposer le format du ticket comme pour les étiquettes :
   `printHtml(html, 300, { pageSizeMicrons: { width: 80000|58000, height:
<hauteur mesurée> } })` — mesurer `document.body.scrollHeight` dans la
   fenêtre cachée (`printing.templates.ts`) pour supprimer la hauteur fixe
   297 mm ; `margins: none` est déjà prévu par `printHtmlPages`.
2. Mettre le Code 39 à l'échelle (`max-width:100%;height:auto`) ou réduire le
   module étroit (1,1 px ⇒ 275 px, tient nativement dans 280 px) — arbitrage
   lisibilité du scan (X-dimension) vs largeur.
3. Ne plus imprimer le payload QR deux fois.

**Aucun code modifié dans cette session** (diagnostic seul ; script de
reproduction temporaire supprimé).

## 25) Session 2026-10-22 (bis) — clôture des constats de la revue UI d'ADR-131 (ADR-132)

**Demande propriétaire** : « اكمل » = reprendre la session « تشخيص أخطاء السلة
والأسعار والبيع » (21 oct 21:50) et terminer les **3 constats bloquants** que sa
propre revue ui-fr avait laissés après ADR-131.

### Constats corrigés

| #   | Constat                                                                                    | Correctif                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Éditer qté/prix d'une ligne « montant saisi » **tuait l'écran Vente** (error boundary)     | La ligne est **VERROUILLÉE** : `isBilledByAmount()` + `cart-store` ignore `setQty`/`setLinePrice`, `addLine` ne fusionne jamais, `+`/`−` ne vise QUE la dernière ligne (message FR si verrouillée, jamais de remontée vers une ligne non visée) ; `safeLineTotal()` affiche « — » + log au lieu de lever ; indice de verrou **visible** + `aria-describedby` (pas seulement une infobulle, inutilisable sur caisse tactile). |
| C2  | Ticket **non imprimable** : remise négative rejetée par `printPayloadSchema.discountMinor` | `moneyMinorSigned` (±1e9, borné côté impression) ; `billedTotalMinor` dans `printLineSchema`/`ReceiptLine` ; ticket « Remise −X » / « Majoration +X », « montant saisi » au lieu de `qté × P.U.` (faux), quantités en virgule FR (`formatQtyFr`) ; devis A4 : marque « montant saisi », quantité FR, **majoration visible même quand les lignes à zéro sont masquées**.                                                      |
| C3  | Aucune couverture E2E du mode Montant                                                      | `tests/e2e/cashier-amount-mode.spec.ts` (2 cas) : focus « article libre » + parcours réel poids → montant 50,00 DZD → ligne verrouillée → encaissement → ticket (« montant saisi » + « Majoration »).                                                                                                                                                                                                                        |

### Revue contradictoire (avant commit)

- **ui-fr** (2 passes) : 3 risques trouvés puis corrigés — (1) le raccourci
  `+`/`−` remontait à une ligne ANTÉRIEURE quand la dernière était verrouillée
  (il pouvait la retirer !) ⇒ cible strictement la dernière + message FR ;
  (2) verrou expliqué uniquement en infobulle + `aria-label` contradictoire ⇒
  texte visible + labels « Quantité/Prix verrouillé » ; (3) faux « 0,00 DZD »
  dans la voie de secours (`formatDzd(total ?? 0)`) ⇒ marque rendue seulement si
  le total est calculable, sinon « Montant illisible — retirez la ligne ».
  Également : « audit » → « journal de la vente » (CartPanel/PayDialog), accord
  « Écart d'arrondi de la longueur / du poids », `console.error` réservé aux
  erreurs **inattendues** (une frappe partielle est normale).
- **db-guardian** : **CLEAN** — aucune migration touchée, `moneyMinorSigned`
  fail-closed (borne d'impression plus stricte que `assertSignedTotal`), pas de
  vecteur de gonflement (`billedTotalMinor` = libellé d'impression, le total
  imprimé reste `lineTotalMinor` + garde de recomposition), idempotence/transaction
  inchangées.

### Fichiers

- Domaine : `src/domain/sales/sale-rules.ts` (`isBilledByAmount`).
- Renderer : `cart-store.ts`, `CartPanel.tsx`, `QuantityDialog.tsx`, `PriceDialog.tsx`,
  `SellTotalsPanel.tsx`, `sell-finalize.ts`, `sell-weight.ts`, `sell-totals.ts`,
  `sell-types.ts`, `SellScreen.tsx`, `PayDialog.tsx` (libellé).
- Main/impression : `validators.common.ts`, `validators.print.ts`,
  `receipt-documents/{common,receipt-text,amounts,proforma}.ts`.
- Docs : `docs/ADR-132-*.md`, `docs/INDEX.md`.
- Tests : `tests/unit/sales/sale-amount-line-lock.test.ts` (8),
  `tests/unit/sales/cart-line-safe-total.test.ts` (3),
  `tests/unit/receipt-signed-discount.test.ts` (7),
  `tests/e2e/cashier-amount-mode.spec.ts` (2) ; miroirs :
  `bridge-shape` (129 exports), `sell-split` (`billedTotalMinor: null`).

### Portes (arbre des fichiers commités, 2026-10-22)

`tsc -b` **0** · `eslint --max-warnings 0` **0** · `format:check` **0** ·
`vitest` **148 fichiers / 1014 tests** **0** · `test:db` **40 / 186** **0** ·
`test:coverage` **EXIT 0** (seuils par fichier 80/75/88/80) ·
`verify:migrations` **VERIFIED** · `verify:domain` **VERIFIED** ·
`verify:fr` **0** (322 fichiers) · `verify:encoding` **0** (878 fichiers) ·
`verify:perf` **VERIFIED** · `knip` **0** · `build` ✓ · `build:electron` ✓
(manifeste signé 217 fichiers) · Playwright spec caisse **2/2**.

### Reste / limites connues

- **Packaging** : `release/` reste à reconstruire (déjà dû à la migration 0051
  d'ADR-131) — non fait ici.
- **Réimpression depuis l'historique** : `billedTotalMinor` n'est pas persisté
  (pas de colonne) ⇒ la réimpression affiche `qté × P.U.` + « Majoration » au
  lieu de « montant saisi ». Montants exacts et recomposables ; corriger
  exigerait une NOUVELLE migration (documenté ADR-132 §4).
- **Constat secondaire §23** (`amount_paid_minor = 0` sur 4 ventes) : non traité.
- Suite E2E complète non rejouée (seule la spec caisse l'a été).

## 26) Session 2026-10-22 (ter) — correctif « grand blanc après le code-barres » (ADR-133)

**Demande propriétaire** : « اكمل » = appliquer le correctif du diagnostic §24
(facture de vente imprimée : grand blanc après le code-barres).

### Correctifs appliqués

| #   | Cause prouvée (§24)                                                                                                                       | Correctif                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Le ticket n'imposait **aucun `pageSize`** ⇒ format par défaut du pilote (A4/297 mm) alors que le contenu **se termine** par le bloc codes | `thermalPageSize()` (nouveau `printing.page-size.ts`) : largeur papier + **hauteur mesurée du contenu** (+3 mm de coupe, plancher 30 mm) ; `printHtmlPages` mesure après `did-finish-load` et imprime avec `pageSize` + `margins: none` ; `thermalWidth` propagé par `printHtml`/`printCopies` (repli = ancien comportement si la mesure échoue). |
| 2   | Le **Code 39 n'était jamais mis à l'échelle** : 462 px dans une colonne de 280 px (80 mm) / 200 px (58 mm) + `overflow:hidden`            | `code39ModuleFor()` (module étroit calé sur la colonne, borné 1 → 2 px) + `thermalBarcode()` qui ajoute `style="max-width:<colonne>px;height:auto"` : barre **entière**, proportions conservées, numéro lisible recentré.                                                                                                                         |
| 3   | L'export PDF passait des **microns** à `printToPDF`, qui attend des **pouces**                                                            | `micronsToInches()` + marges nulles ; l'export PDF d'un ticket utilise la même hauteur mesurée que l'impression.                                                                                                                                                                                                                                  |

### Mesures (avant → après, Chromium + Electron réels)

- 80 mm : SVG **462 px débordant 280 px** (61 % de la barre visible) → **275,7 px dans 280 px** (barre entière, hauteur de barre conservée) ; page **297 mm → 141,1 mm** (= contenu 522 px + 3 mm).
- 58 mm : 462 px dans 200 px (43 % visible, numéro hors zone) → **200/200 px**, numéro centré ; page 127,9 mm.
- Export PDF (Electron réel, `printToPDF`) : **1 page 80,1 × 141,5 mm** et **58,3 × 128,1 mm** (avant : « taille » de 80 000 po lue par Chromium ⇒ page géante et contenu minuscule dans un coin).

### Fichiers

- Nouveau : `electron/printing/printing.page-size.ts` (`thermalPageSize`, `measureContentPx`, `micronsToInches`).
- Impression : `printing.templates.ts` (`PrintPage.thermalWidth`, mesure, `pageSize` + marges), `printing.receipt.ts`, `printing.payment.ts`, `printing.logistics.ts` (livraison, retour, bon de commande), `printing.studio.ts` (page de test thermique) — tous en `{ thermalWidth: width }`.
- Documents : `receipt-documents/barcode39.ts` (`code39ModuleFor`, 3ᵉ paramètre `narrowPx`, arrondi `svgNum`), `receipt-documents/thermal.ts` (`thermalBarcode`), `receipt-documents.ts` (ré-export).
- PDF : `printing.pdf.ts`, `printing.pdf-exports.ts`.
- Tests : `tests/unit/printing/page-size.test.ts` (**13**). Docs : `docs/ADR-133-*.md`, `docs/INDEX.md`.

### Portes (arbre de ce commit, 2026-10-22)

`tsc -b` **0** · `typecheck:electron` **0** · `eslint . --max-warnings 0` **0** ·
`vitest` **149 fichiers / 1027 tests** **0** · `build` ✓ · `build:electron` ✓
(manifeste signé 218 fichiers) · `verify:fr` **0** (323 fichiers) ·
`verify:encoding` **0** (880) · `verify:migrations` **VERIFIED**.
Vérification hors suite : Chromium/Playwright (géométrie + mesure) et Electron
réel (`dist-electron` + `printToPDF`).

### Reste / limites connues

- **58 mm** : un Code 39 de 14 caractères n'y est pas scannable (module plancher
  1 px ⇒ X-dimension < 0,2 mm). Le code y est complet et lisible à l'œil ;
  **80 mm reste la largeur recommandée** pour un scan fiable.
- **Payload QR toujours imprimé deux fois** (ligne texte `QR : …` + bloc 9 px
  sous le QR) : contrat texte ADR-050, hors périmètre.
- **Dépendance au pilote** : si un pilote refuse la taille de page custom, le
  repli garde l'ancien comportement (aucun `pageSize`) ⇒ le blanc reviendrait
  (mais jamais de ticket tronqué). À confirmer sur l'imprimante de production.
- `release/` toujours à reconstruire (déjà dû à la migration 0051 d'ADR-131).

## 27) Session 2026-10-22 (quater) — vérification import/export Clients & Produits (EMP-1)

**Demande propriétaire** : « تحقق من خاصية التصدير و الاستيراد في صفحة المنتجات و العملاء ».
Vérification réelle du câblage, puis correction du seul chemin destructeur trouvé.

### Ce qui a été vérifié

| Écran    | Import                                                            | Export                                                | Preuve                                 |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| Produits | bouton + input masqué + `parseProductsCsv` + `api.productsImport` | toutes les pages du filtre + `downloadCsv` + toast FR | E2E réelle + unitaires + intégration   |
| Clients  | idem avec `parseCustomersCsv` + `api.customerImport`              | toutes les pages du filtre + `downloadCsv` + toast FR | E2E réelle (4/4) + intégration (7 cas) |

Câblage conforme aux règles : parseur domaine avant confirmation, `operationId`
de lot, transaction atomique tout-ou-rien côté main, gates staff + licence,
messages FR, aucun accès SQLite/Node dans le renderer. **Aucune régression de
canal, de schéma ni de migration** (aucune migration ajoutée).

### Constats

| #   | Constat (prouvé)                                                                                                                                                                                                                                                                                                         | Sévérité | État                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------- |
| 1   | Réimporter le CSV **exporté par l'écran Clients** créait **2 fiches bidon** (`Client / "Téléphone"` avec téléphone `"Jour règlement"`, puis `"Amine Benali" / "0550123456"` avec téléphone `"5"`). Le parseur ne connaissait ni les guillemets ni l'en-tête de rapport, et le main acceptait un téléphone non numérique. | P1       | CORRIGÉ                                             |
| 2   | Téléphone `pas-un-numero` accepté à l'import (`phoneDigitsParity` ne retirait que les séparateurs, pas les lettres).                                                                                                                                                                                                     | P2       | CORRIGÉ                                             |
| 3   | Champs CSV entre guillemets (Excel, exports de l'app) non décodés (`""` et `;` internes).                                                                                                                                                                                                                                | P2       | CORRIGÉ                                             |
| 4   | Export : une page IPC en échec était ignorée par `runBulk` ⇒ CSV partiel annoncé « N exporté(s) » (troncature silencieuse).                                                                                                                                                                                              | P2       | CORRIGÉ                                             |
| 5   | Export ≠ aller-retour : c'est un **rapport** (catégorie, statut, montants formatés, nom complet), l'import est un **flux de données** — décision 3 d'ADR-130. Un export réimporté doit être **refusé proprement**, pas accepté.                                                                                          | —        | COMPORTEMENT CONFORME (message désormais explicite) |

### Correctifs

- `src/domain/import/csv-import.ts` : `splitCsvLine()` quote-aware (`""`, `;`
  internes), détection des en-têtes de rapport (`Nom;Catégorie…`,
  `Client;Téléphone…`) ⇒ `DomainError` FR explicite « export de rapport, pas un
  fichier d'import » avec le format attendu ; validation du téléphone importé
  (vide accepté, sinon chiffres + séparateurs usuels, ≥ 6 chiffres).
- `electron/ipc/handlers/import.repo.ts` : **miroir main** de la règle
  téléphone (`digitsOnly` + charset) — la base reste l'autorité ; `seenPhones`
  compare les chiffres.
- `src/features/products/ProductsScreen.tsx` + `src/features/customers/ClientsScreen.tsx` :
  si `runBulk` rapporte une page en échec, **aucun téléchargement** ; toast FR
  « Export interrompu : N page(s) sur M illisible(s). Réessayez. » + log
  technique.

### Fichiers

- Code : `src/domain/import/csv-import.ts`,
  `electron/ipc/handlers/import.repo.ts`,
  `src/features/products/ProductsScreen.tsx`,
  `src/features/customers/ClientsScreen.tsx`.
- Tests : `tests/unit/csv-import-safety.test.ts` (**nouveau, 10 cas**),
  `tests/integration/customers-import.test.ts` (+1 cas téléphone bidon),
  `tests/unit/import-export-ui.test.ts` (+ garde « Export interrompu »),
  `tests/unit/domain-rules-coverage.test.ts` + `tests/unit/phase6-9-rules.test.ts`
  (fixtures téléphone réalistes), `tests/e2e/csv-import-export.spec.ts`
  (+1 cas « export de rapport refusé, aucune fiche bidon »).

### Portes (arbre de ce commit, 2026-10-22)

`tsc -b` **0** · `typecheck:electron` **0** · `eslint` (fichiers touchés,
`--max-warnings 0`) **0** · `vitest` **150 fichiers / 1 038 tests** **0** ·
`build` ✓ · `build:electron` ✓ (manifeste signé 218 fichiers) ·
**E2E `csv-import-export` : 4/4 vertes** (import + export réels, fichier
invalide, export de rapport refusé, export catalogue) · `verify:domain`
**VERIFIED** · `verify:fr` **0** (323 fichiers) · `verify:encoding` **0** (882
fichiers) · `verify:migrations` **VERIFIED**.

### Reste / limites connues

- L'export reste un **rapport** (ADR-130) : non réimportable par conception ;
  il est désormais refusé avec un message FR explicite, sans écriture.
- Pas de plafond de volume à l'export Clients/Produits (contrairement à
  l'historique, `EXPORT_MAX = 5 000`) : parcours page par page, concurrence
  bornée ; à arbitrer si un catalogue dépasse quelques dizaines de milliers de
  lignes.
- `skipped` reste à 0 dans le contrat d'import (aucune ligne ignorée : tout ou
  rien) ; le champ est conservé pour compatibilité.
- E2E : seul le refus du rapport **clients** est couvert en réel ; le refus du
  rapport **produits** est couvert par le test unitaire.

## 28) Session 2026-10-22 (quinquies) - export données réimportable (ADR-135)

### Objectif

Le propriétaire a réimporté un CSV **exporté par le même programme** et a reçu
`Ligne 2 : prix de vente invalide`. Le geste naturel « exporter puis
réimporter » doit fonctionner, sans transformer le rapport en format
d'import.

### Cause racine

- La version installée (`release/`, **21/10 22:58**) est antérieure au
  correctif EMP-1 `6bb3a51` (**22/10 21:04**) : `app.asar` ne contient pas la
  détection d'en-tête de rapport.
- Ancien parseur : l'en-tête `Nom;Catégorie;Unité;Prix d'achat;Prix de vente…`
  est consommé, puis `Catégorie` est lu comme `Prix de vente` sur la première
  ligne de données ⇒ message `Ligne 2`.
- Le correctif EMP-1 refuse désormais ce fichier proprement, mais **le besoin
  de transfert restait entier**.

### Livré (commit `2d8028a`, ADR-135)

- **Deux exports** sur Produits et Clients :
  - « Rapport CSV » : inchangé (colonnes enrichies, montants DZD, RX-18) ;
  - « Données CSV » : format exact d'import, réimportable tel quel.
- Produits : `nom;vente;achat;quantité;code-barres` via `minorToInput`
  (jamais `formatDzd`) ; Clients : `prénom;nom;téléphone` (prénom/nom
  séparés).
- `toCsv(..., { protectFormulas: false })` uniquement pour le fichier de
  données : préserve `+213…` et les noms `-…` ; le rapport garde RX-18.
- Export données **refusé** si le filtre courant inclut des archivés
  (produits : `includeArchived` ; clients : `archiveFilter !== "active"`) :
  le format d'import ne transporte pas le statut, aucune réactivation
  silencieuse.
- `finally` : `bulkBusy`/`bulkLabel`/`exportKind` remis à zéro même en cas
  d'exception (l'ancien `catch` laissait le bouton bloqué).
- Aucun canal IPC, schéma Zod ou migration. Réimport dans la même base :
  échec propre sur l'unicité code-barres/téléphone (tout-ou-rien) ; la
  restauration complète reste `Paramètres → Sauvegarde → Restaurer`.

### Fichiers

- Code : `src/shared/export/csv.ts`, `src/features/products/types.ts`,
  `src/features/customers/types.ts`, `src/features/products/ProductsScreen.tsx`,
  `src/features/customers/ClientsScreen.tsx`.
- Tests : `tests/unit/csv-import-safety.test.ts` (13 cas, aller-retour
  produits/clients + RX-18), `tests/unit/root-repair.test.ts` (16 cas,
  `protectFormulas:false`), `tests/unit/import-export-ui.test.ts` (6 cas,
  câblage statique + gardes archivés), `tests/e2e/csv-import-export.spec.ts`
  (clics rapport + données).
- Docs : `docs/ADR-135-export-donnees-reimportable-csv.md`,
  `docs/ADR-130-import-export-csv-clients-produits.md` (note de mise à jour),
  `docs/INDEX.md`.

### Portes (arbre de ce commit)

Format ✓ · `npx tsc -p tsconfig.json --noEmit` **0** · ESLint fichiers
touchés **0** · `vitest` **150 fichiers / 1 042 tests** **0** · `vite build`
✓ · `verify:fr` **0** (325) · `verify:encoding` **0** (885) · `verify:domain`
**VERIFIED** · `verify:migrations` **VERIFIED**.

### Bloqué par le chantier concurrent (hors périmètre)

- `tsc -b` / `typecheck:electron` : 3 erreurs dans `electron/printing/*`
  (`receiptTextOf`, `m` inutilisé) — fichiers non touchés.
- E2E `csv-import-export` : échec **avant lancement** sur
  `integrity.mismatch` de `dist-electron/printing/printing.pdf-exports.js`
  (chantier impression/Documents en cours). Ce n'est pas une régression CSV ;
  le contenu de l'export données est couvert par les tests unitaires.
- Le numéro **ADR-134** est utilisé par ce chantier concurrent ; le présent
  ADR est donc **ADR-135**. Ne pas commiter `electron/printing/*`,
  `src/features/history/HistoryDialogs.tsx`,
  `src/shared/documents/DocumentPreviewModal.tsx` ni
  `src/features/debts/DebtDialogs.tsx` avec ce travail.

### Reste

1. Quand le chantier impression est terminé : relancer `tsc -b`,
   `npm run build:electron`, puis la spec E2E `csv-import-export`.
2. Refaire le packaging (`release/` du 21/10) pour que l'utilisateur voie le
   correctif EMP-1 et le bouton « Données CSV ».
3. Vérifier dans l'app réelle : Produits → « Données CSV » → réimport sur une
   base vierge ; Clients idem. Attendu : mêmes noms/prix/quantités/codes et
   prénom/nom/téléphone, sans erreur `Ligne 2`.

---

## 29) Session 2026-10-22 — lancement réel de la build CSV (essai propriétaire)

### Demande

Le propriétaire a demandé : « شغل النسخة الجديدة و فعلها لأجربها » — lancer la
nouvelle version et l'activer pour tester l'export/import `Données CSV`.

### Réalisé

- **Build propre hors arbre sale** : worktree détaché sur `c30b5c6` dans
  `%TEMP%\opencode\veloria-csv-run` (le chantier impression/Documents
  concurrent n'est pas inclus). `npm run build` : `tsc -b` **0**, `vite build`
  ✓ (1 773 modules) ; `npm run build:electron` : preload + stamp + manifeste
  d'intégrité **218 fichiers** signé.
- **Copie stable** : `release/veloria-csv-test/` (gitignorée, `/release/`)
  contient `dist`, `dist-electron`, `package.json` + jonctions
  `node_modules`, `resources`, `database`, `public`. Le statut licence y est
  **ACTIVE** après vérification d'intégrité.
- **Raccourci Bureau** : `Veloria POS - Test CSV.lnk` → Electron du dépôt avec
  l'argument du dossier stable. Permet de rouvrir la build de test après
  fermeture, sans toucher à l'installateur.
- **Activation** : la licence de production existante est **ACTIVE**
  (`VLIC-757224A4`, édition `pro`, `lifetime`, 17 pages, matériel
  `CBFB-E42A-A0BD-C53F`). Aucun import `.vlic` ni réactivation nécessaire ;
  l'intégrité de la build de test est valide.
- **Lancement** : fenêtre `Veloria PoS - Point de vente` ouverte, renderer
  neuf ; les assets produits/clients contiennent bien le bouton
  **« Données CSV »**. Aucune erreur `license.integrity_failed` /
  `TAMPER_DETECTED` dans les logs.

### Effet sur la base réelle

- Démarrage sur la base de production
  `C:\ProgramData\Veloria PoS\Data\Veloria POS DB.sqlite` ; migration
  **0051** appliquée (schéma **50 → 51**).
- **Conséquence** : l'ancienne build installée (21/10) refuse maintenant cette
  base (« créée avec une version plus récente »). Ne pas relancer l'ancien
  installateur sur cette base ; utiliser la build de test ou refaire le
  packaging.
- Filets : snapshot pré-migration automatique dans
  `%APPDATA%\Veloria PoS\backups` + copie manuelle
  `%TEMP%\opencode\veloria-db-backup-20261022-221055.sqlite` (schéma 50).

### Reste

1. Laisser le propriétaire tester Produits/Clients → « Données CSV » →
   réimport (base vierge ou copie) et remonter le résultat.
2. Après stabilisation du chantier impression : `tsc -b`,
   `build:electron`, E2E `csv-import-export`, puis packaging neuf.
3. Ne pas commiter `release/` (gitignoré) ni les fichiers du chantier
   concurrent.

---

## 30) Session 2026-10-22 (sexies) — design du ticket de vente (ADR-134)

### Demande

Le propriétaire a fourni la photo d'un ticket de superette et demandé que la
facture de vente imprimée reprenne ce dessin : grande enseigne, date, client,
table `Qté / Article / P.U / Montant`, `N Article(s)`, encadré arrondi des
soldes, remerciement, code-barres + numéro et pied légal. Le ticket sortait
jusqu'ici en texte monospace, et l'aperçu ne montrait pas le rendu réel.

### Livré (commit `9fbc90e`, ADR-134)

- **Builder HTML unique** `buildReceiptTicketHtml`
  (`electron/printing/receipt-documents/ticket-html.ts` +
  `ticket-blocks.ts`) utilisé par l'impression, le PDF, l'aperçu, l'échantillon
  Studio, l'impression de test et la page de test.
- **Mise en page** : logo + enseigne (1,9 × la base, bornée 16–28 px), ville
  en italique, contact et `RC / NIF / NIS`, date centrée, ligne
  `Client : Nom | téléphone | adresse` (ou « Comptant »), vendeur, table à
  colonnes fixes (`colgroup`) et lignes pointillées. Montants de table
  **compacts** (sans « DA », milliers ni « ,00 ») pour tenir en 58 mm ;
  l'encadré garde les montants `DA` formatés.
- **Montant saisi** (ADR-131/132) : `P.U` = « — », mention « Montant saisi »,
  jamais de multiplication fausse ; référence produit sur la deuxième ligne.
- **Encadré** : `Ancien solde` (si fiche), `Total vente`, `Timbre fiscal`
  (espèces), `Versement`, `Nouveau solde` en gras ; replis `Reste à payer`,
  `Reste (timbre)`, `Monnaie rendue`. Détail fiscal au-dessus seulement si
  remise/livraison/TVA.
- **Pied** : nombre d'articles, montant en lettres, règlement/échéance,
  remerciement (défaut « Merci de votre visite. »), Code 39 + numéro, QR
  optionnel, mention légale (défaut « Ticket obligatoire pour toutes
  réclamations »), signatures si le modèle les garde.
- **Aperçu** : `printing.preview` renvoie `{ text80, html80 }` ; les modales
  Vente, Historique, Dettes, Retours et l'atelier affichent `html80` dans une
  iframe `sandbox=""`, avec repli `text80`. Aucun canal, schéma Zod ni
  migration ajouté.
- **Correctif pendant la vérification** : l'encadré `flex:0 0 74%` dépassait
  de **14 px** du papier 80 mm ; passé à `flex:1 1 auto; min-width:0`.
  Playwright : **0 élément hors cadre** en 58 et 80 mm (280 × 575 px /
  200 × 654 px pour 6 lignes).
- **QR** : le payload texte n'est plus imprimé quand un SVG QR existe (fin de
  la duplication constatée en ADR-133 §D4) ; le numéro lisible sous les barres
  n'apparaît que sans code-barres.

### Fichiers

- Code main : `electron/printing/receipt-documents/ticket-html.ts` (236 l.),
  `ticket-blocks.ts` (147 l.), `receipt-documents.ts`,
  `printing.receipt.ts`, `printing.pdf-exports.ts`, `printing.samples.ts`,
  `printing.studio.ts`.
- Renderer : `src/shared/documents/DocumentPreviewModal.tsx`,
  `src/shared/documents/invoice-preview.tsx`,
  `src/features/history/HistoryDialogs.tsx`,
  `src/features/debts/DebtDialogs.tsx`,
  `src/features/returns/dialogs/DetailsDrawer.tsx`,
  `src/features/print-templates/PrintTemplatesScreen.tsx`.
- Tests : `tests/unit/printing/ticket-html.test.ts` (9 cas),
  `tests/unit/printing/split-parity.test.ts` (18 cas, échantillon ticket =
  `text80` + `html80`).
- Docs : `docs/ADR-134-design-ticket-vente.md`, `docs/INDEX.md`.

### Portes (arbre de `9fbc90e`)

`npm run typecheck` **0** · `typecheck:electron` **0** · `eslint
--max-warnings 0` **0** · `vitest` **151 fichiers / 1 051 tests** **0** ·
`build` ✓ · `build:electron` ✓ (manifeste **220 fichiers**) · `verify:fr`
**0** (325) · `verify:encoding` **0** (886) · `verify:migrations`
**VERIFIED**.

### Reste

1. **Imprimer sur l'imprimante thermique réelle** (58 et 80 mm) et vérifier
   le rendu papier : lisibilité des montants compacts, alignement de
   l'encadré, scan du Code 39.
2. Rejouer l'E2E `csv-import-export` (blocage d'intégrité levé) et, plus tard,
   la suite E2E complète.
3. Refaire le packaging : `release/` (21/10) ne contient ni ADR-134, ni
   ADR-135, ni EMP-1.
4. Recueillir l'avis du propriétaire sur le dessin (taille de l'enseigne,
   mentions du pied) avant de figer d'éventuels réglages supplémentaires.

---

## 31) Session 2026-10-22/23 — « فراغ » après le code-barres : aperçu et pilote

### Demande

Le propriétaire a signalé un vide dans le ticket : « هناك فراغ في التذكرة »,
puis a précisé **« أسفل التذكرة بعد الباركود »** (en bas, après le code-barres).
Le ticket doit rester fidèle à la photo, en 58/80 mm, N&B, avec un aperçu qui
reflète exactement le papier.

### Diagnostic

1. **Le blanc des captures n'était pas dans le ticket.** Les anciennes captures
   Playwright étaient des captures **pleine page** de **302 × 1400 px** (80 mm)
   et **219 × 1400 px** (58 mm) : le ticket s'arrêtait à 575 / 654 px, puis
   **825 px de blanc** suivaient. Ces pixels venaient du viewport de capture,
   pas du document.
2. **Le PDF est serré.** Rendu Electron réel + `printToPDF` :
   - 80 mm : **80,09 × 155,19 mm**, dernier texte « POS » à **6,23 mm** du bas ;
   - 58 mm : **58,25 × 176,36 mm**, même blanc de **6,23 mm** ;
   - couleurs du PDF : seulement `#ffffff` et `#000000`, aucun gris.
3. **Le vide papier vient du pilote étiquette.** Le poste utilise
   `4BARCODE 3B-365B` (USB003) avec le pilote **`2120TF(Label)`**. Le
   `PrinterDriverData` contient `PageWidth=900`, `PageHeight=600` (90 × 60 mm),
   `SensorType=0` (gap), `GapLen=30`, `ContinuousForm=0`, `PrintMode=4`
   (arrachage) ; le PrintTicket par défaut est un `PageMediaSize` de
   **90 000 × 60 000 microns**. L'application demande une page **80 × 155 mm** ;
   ce pilote d'étiquettes continue de fonctionner au **gap** et avance le
   rouleau après le code-barres. Le HTML et le PDF ne sont pas en cause.

### Livré (commit `e3cf6e7`, ADR-134 §5)

- **Aperçu** : `#veloria-ticket` est détouré sur un fond **gris `#d1d5db`**
  avec une ombre, **uniquement en `@media screen`**. Le média print reste
  blanc ; le PDF ne peint que blanc et noir. Le `body` n'a plus de padding
  écran, donc la hauteur mesurée reste **575 px / 155,135 mm** en 80 mm
  (aucun blanc ajouté par l'aperçu).
- **Captures de contrôle** : captures **d'élément** `#veloria-ticket`
  (`280 × 575 px` et `200 × 654 px`), sans blanc ajouté, plus des aperçus
  `320 × 650` / `240 × 700` montrant la feuille sur fond gris.
- **Test** : `ticket-html.test.ts` passe de 9 à **10 cas** (fond écran, fond
  print blanc, ombre, absence de `@media print`).
- **ADR-134 §5** : preuves PDF, diagnostic du pilote et consignes de passage
  en mode reçu/continu.

### Configuration pilote à appliquer (hors code)

Le shell n'est **pas élevé** (groupe Administrateurs en « refus uniquement ») :
les clés HKLM n'ont pas été modifiées. Deux voies :

1. **Passer le pilote actuel en continu** : Préférences d'impression de
   `4BARCODE 3B-365B` → type de papier **continu/reçu** (pas étiquette),
   capteur **continu** (pas gap), gap **0**, taille **80 mm × hauteur du
   ticket** (ou personnalisée 80 × 155 mm), mode **arrachage**. Objectif
   registre : `SensorType=2`, `ContinuousForm=1`, `GapLen=0`.
2. **Installer le pilote reçu** du XP-365B / 3B-365B (le paquet Windows
   constructeur contient les deux modes), créer la queue « reçu », puis la
   sélectionner dans Veloria en largeur 80 mm.

Le pilote `2120TF(Label)` reste correct pour de vraies étiquettes 90 × 60 mm,
pas pour un ticket de 155 mm. Le type de papier réel (rouleau continu ou
étiquettes) reste **à confirmer** avant l'essai.

### Build de test

`release/veloria-csv-test/` date de `c30b5c6` et **ne contient pas**
`dist-electron/printing/receipt-documents/ticket-html.js` : un essai papier
depuis cette copie ne peut pas valider le nouveau dessin. Rebuilder la copie
stable (copier `dist/` + `dist-electron/` à jour, ou refaire le packaging)
avant l'essai papier.

### Portes

`ticket-html.test.ts` **10 cas** · `split-parity.test.ts` **18 cas** · suite
complète **151 fichiers / 1 052 tests** **0** · `typecheck` /
`typecheck:electron` / ESLint **0** · `build` ✓ · `build:electron` ✓
(manifeste **220**) · `verify:fr` **0** (325) · `verify:encoding` **0** (887) ·
`verify:migrations` **VERIFIED**.

### Reste

1. Confirmer le papier chargé (rouleau continu 80 mm ou étiquettes 90 × 60).
2. Appliquer le mode reçu/continu (ou installer le pilote reçu) et imprimer
   un ticket réel pour vérifier la disparition du blanc.
3. Rebuilder `release/veloria-csv-test/` avec le `dist`/`dist-electron` de
   `e3cf6e7` avant l'essai propriétaire.
4. Éventuellement, ajouter un avertissement dans `PrinterCard` quand le
   pilote sélectionné est un pilote étiquette (détection `driverName`) —
   non fait faute de confirmation du papier et pour éviter une copie UI
   trompeuse.
5. Rejouer l'E2E `csv-import-export` et refaire le packaging complet.
   \

## Session 32 — Audit page Paramètres (nettoyage mineur)

- `backup-frequency.ts` : champ minutes inutilisé retiré de `BACKUP_FREQUENCIES` (code mort/redondant).
- `limits.tsx` : `SaveBar` accepte `disabled` (actions conditionnelles).
- `SettingsSectionsA.tsx` : `AnnouncementSection` désactive `SaveBar` pendant le chargement initial.
- `SettingsSectionsB.tsx` : `DatabaseSection` alimente `foreignKeyViolations` depuis `dbHealth` et affiche le compteur.
- `use-app-settings.ts` : clé `showBalances` inutilisée retirée des valeurs par défaut de `invoice`.

Vérifications : typecheck 0 · eslint 0 · vitest settings-helpers/settings/a3 0 · verify:migrations VERIFIED · verify:fr 0 · verify:encoding 0.

## Session 33 — Fusion de composants Paramètres

- `SecuritySection` intègre désormais les préférences d'affichage (mode clair, compact) ; `DisplaySection` supprimé.
- `PrintingSection` retiré de l'écran ; `PrinterCard` inliné directement dans `SettingsScreen` (documents). Le composant mort restant dans `SettingsSectionsB.tsx` est supprimé en §35.

Vérifications : typecheck 0 · eslint 0 · vitest a3/settings/settings-helpers 0.

## Session 34 — Tickets HTML (livraison, retour, règlement) au design ticket de vente

- Nouveaux builders HTML : `buildDeliveryTicketHtml`, `buildReturnSlipTicketHtml`, `buildPaymentTicketHtml` (design ADR-134).
- IPC livraison/retour/règlement renvoient `html80` et impriment en HTML (plus de texte monospace).
- Exportés via le barrel `receipt-documents.ts`.

Vérifications : typecheck 0 · vitest printing 41/41.

## Session 35 — Audit skills, erreurs projet, E2E intensifiés, packaging (2026-10-23/24)

- **Skills** : `veloria-db` (dernière migration `0051_sales_signed_discount.sql`), commande `migration-new`, `db-guardian` (0051) et `qa` (ADR-135) alignés sur l'état réel. `AGENTS.md` vérifié (règles 1-14 inchangées), `verify:fr` et `verify:encoding` verts.
- **Lint** : 15 erreurs `@typescript-eslint/no-explicit-any` dans `delivery-ticket.ts`, `return-ticket.ts`, `payment-ticket-html.ts` — casts `any` supprimés (types `ReceiptData`/`LogisticsDocData`), chaîne optionnelle inutile retirée.
- **Knip** : 2 exports morts supprimés (`PrintingSection` dans `SettingsSectionsB.tsx`, ré-export `TicketCodes` du barrel) → 0.
- **E2E** : nouvelle matrice `docs/reports/E2E_COVERAGE_MATRIX.md` ; ajout `navigation-smoke.spec.ts` (16 modules) et `component-smoke.spec.ts` (rendu + dialogues) ; correctifs : `aria-label` sur les iframes d'aperçu ticket (ADR-134), noms de dialogues réels (`Réception — facture directe`, `Confirmer l'action`), attente iframe 80 mm dans l'historique, stabilisation `restart` (double nettoyage des instances `app.relaunch()`). `full-loop-client` rejoué avec le relais `scripts/e2e-mirror-relay.mjs` (:8100).
- **Portes** : `format:check` 0 · `typecheck` 0 · `typecheck:electron` 0 · `eslint` 0 · `vitest` 151 fichiers / 1052 tests 0 · `test:db` 40 fichiers / 187 tests 0 · `test:e2e` 45 tests (**42 réussis, 3 ignorés** : installateur UAC + drag/redimensionnement OS, **0 échec**) avec relais · `verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0 · `license:scan` 0 · `knip` 0 · `build` ✓ · `build:electron` ✓.
- **Packaging** : rebuild ADR-023 depuis zéro (`release/` supprimé), POS + License Manager (NSIS machine FR + portables) — `Veloria-PoS-Setup-1.0.0.exe` (`199357…5d9d`), `Veloria-PoS-Portable-1.0.0.exe` (`39f4ea…ab94e`), `Veloria-License-Manager-Setup-1.0.0.exe` (`a61f27…ce3f`), `Veloria-License-Manager-Portable-1.0.0.exe` (`850321…5b0db`), 2 `.blockmap`, `SHA256SUMS.txt`. `release:smoke` **0**, `release:checksums` **0**, `better-sqlite3` **chargé dans les deux runtimes packagés** (Electron 37.2.0, ABI 136, SQLite 3.50.2). `release/win-unpacked/` contient le Manager (dernier empaqueté) ; le POS a été vérifié avant remplacement.

## 36) Session 2026-10-24 — Phase 1 + Phase 2 début (redesign APK client)

- Tokens V4 : échelle gris + dark-mode prep + ombre card renforcée. Kit : focus ring Field.
- Écrans : Home (titre boutique 24, montant dette +4), Invoices (titre 22), Payments (titre 22), Account (avatar 72).
- Portes : typecheck:mobile 0, mobile tests 27/27 verts.

## 37) Session 2026-10-25 — Dashboard NET + catégories + gardes radicaux (migration 0052)

- **Commit** : `f30bf1a` (22 fichiers, +1545/−347) ; ce handoff est le commit `docs(handoff)` associé.
- **Migration 0052** `database/migrations/0052_dashboard_category_snapshots.sql` : `sale_items.category_id` et `return_items.category_id` (catégorie figée à l'opération), `return_items.cogs_minor` (coût FIFO des unités restockées), `supplier_returns.staff_user_id` (attribution manquante), backfills, index de plage/auteur. Vérifiée par `verify:migrations` (52) et `tests/database/migrations.test.ts`.
- **Flux vente/retour** : `createSaleAtomic` précharge la catégorie produit et l'écrit dans chaque ligne ; `createReturnAtomic` copie la catégorie et stocke le coût FIFO restauré (`cogs_minor`), 0 si non restocké ; `createSupplierReturnAtomic` porte `staff_user_id`.
- **Dashboard backend** scindé dans `electron/ipc/handlers/dashboard.repo.ts` (ré-export `finance.repo`) : CA/marge/COGS **nets des retours non annulés**, cash net des remboursements, `byMethod` basé sur `sale_payments` réels − remboursements, `overdueCount`/`upcomingCount` séparés du Top 5, `recentReturns`/`recentPurchases` filtrés (annulés exclus), `overdue`/`upcoming` filtrés par auteur, `daily` complété à zéro, `byCategory` (ventes nettes, retours, marge), `integrityAt` mis en cache (plus de `PRAGMA integrity_check` à chaque affichage), requêtes `created_at >=/<` indexables, index 0052.
- **UI Dashboard** : carte « Ventes et marge par catégorie » avec sélecteur (Toutes / catégorie / Sans catégorie), tableau ventes/retours/marge + total, exports CSV/Excel/PDF enrichis ; tous les agrégats passent par `formatDzdTotal`/`formatDzdTotalSigned` (plus de « — » à 10M DZD ni sur une marge négative), libellés « Encaissements nets », « Instantané global », « top 5 ».
- **Gardes** : annulation refusée si un retour non annulé existe ; retour refusé sur vente annulée **dans le main** ; `enqueueSaleRefresh` après annulation/retour ; miroir paginé par `customer_id` (>500 clients) ; Supabase RLS + revokes + `security_invoker` ; changement d'URL miroir avec clé conservée exige la ressaisie de la clé service ; `database.reset/relocate`, `backup.restore/export`, `sync.saveConfig` réservés au **gérant**.
- **Tests** : `tests/integration/dashboard-net-category.test.ts` (net retours, cash, catégories, auteur, compteurs, annulés) · `tests/unit/format-total.test.ts` · gardes dans `w1-money-atomicity.test.ts` · `requiresServiceKeyReentry` (`sync-protocol`) · `staff-gates-matrix` · migrations 52.
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · `vitest` **153 fichiers / 1063 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste signé 225 fichiers) · `verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0.
- **Reste ouvert (phases suivantes)** : verrou PIN client côté Edge (RPC atomique + rate limit), jour métier `Africa/Algiers` (E-35), chiffrement des sauvegardes et refonte QR (PIN/expiration), `maxDevices`, TTL `sync_outbox`/payloads cloud, `format:check` global non rejoué (Prettier ciblé sur les fichiers modifiés).

## 38) Session 2026-10-25 — Caisse : totaux, limites, stock et idempotence (migration 0053)

- **Commit** : `8130ba8` (40 fichiers, +835/−169) ; ce handoff est le commit `docs(handoff)` associé.
- **Frontière monétaire** : `parseDzdInputTotal` / `minorToInputTotal` (MAX_MINOR_TOTAL), validateurs `moneyTotal` / `moneyTotalPositive` pour `saleCreateSchema.amountPaidMinor`, `cartsSaveSchema.amountPaidMinor` et `recordPaymentSchema.amountMinor` ; tous les **totaux** de la caisse utilisent `formatDzdTotal`/`formatDzdTotalSigned` (les prix unitaires gardent `formatDzd`). Les boutons « Encaisser », « Appoint » et « Régler » acceptent désormais un total > 10M DZD sans `MoneyError`.
- **Saisie paiement** : un montant invalide n'est plus converti en 0 ; `paidError`/`deliveryError` sont affichés, la validation est bloquée, et `finalizeSale` revalide le texte avant commit. Un survirement reste une monnaie rendue (plafonné à l'enregistrement).
- **Limites** : `MAX_CART_LINES = 500` et `MAX_CART_TABS = 20` partagés par `saleCreateSchema`, `cartsSaveSchema`, le store et les ajouts (produit/article libre/onglet). `hydrate` tronque défensivement. `carts.load` exige désormais une session.
- **Stock** : ajout/quantité bloqués au-delà du stock affiché ; `createSaleAtomic` refuse **inconditionnellement** le stock négatif (trigger 0037) et ignore l'ancien paramètre ; le toggle « stock négatif » trompeur est retiré des réglages (écriture figée `false`).
- **Archivage** : `createSaleAtomic` refuse un produit `is_active=0` et un client `deleted_at != NULL` pour **toute** vente ; `carts.save` retire un client archivé du brouillon.
- **État caisse** : `clearSaleForm` vide aussi `deliveryText` ; l'hydratation restaure le frais de livraison ; la baisse clavier `-` ne supprime plus une ligne silencieusement (message + croix), la hausse respecte le stock.
- **Complément `2834b26`** : `+`/`−` sont réservés à la quantité de la **dernière ligne** même quand le focus est dans la recherche/scan (aucune saisie dans le champ code-barres) ; les autres champs (client, quantité, livraison, formulaires) conservent la saisie `+`/`−`. Helper pur `shouldIgnoreBump` + tests `bumpLastQty`.
- **Impression / crédit** : `dueDate` est porté par `LastSale`, imprimé sur le ticket et validé par `isRealCalendarDate` ; une vente à crédit avec versement 0 n'imprime plus « ESPÈCES » (méthode null).
- **Permissions UI** : `SellScreen` lit `useStaff` ; le dialogue de prix est désactivé sans `discount`, l'annulation masquée sans `cancel`, « Régler »/« Nouveau client » masqués sans `debts` (le main reste la décision).
- **Idempotence durable** : migration **0053** `cart_drafts.sale_operation_id` ; `openPay` réutilise l'operationId du panier, `finalizeSale` persiste le brouillon avec cet ID **avant** `sales.create`, et le panier est vidé **avant** l'aperçu/l'impression. Un crash après commit rejoue le même ID au redémarrage.
- **Tests** : `sale-guards` (stock/archivés), `sale-money-cap` (1,5 Md centimes, 500/501 lignes), `cart-limits`, `cart-drafts` (operationId persisté), `sell-cashier` (openPay stable), `sell-split` (échéance réelle, dueDate, méthode null), `format-total` (parse/format totaux).
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint` 0 · `vitest` **156 fichiers / 1075 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **227**) · `verify:migrations` VERIFIED (53) · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0.
- **Reste ouvert** : navigation clavier des résultats clients et des onglets ; `dueDate`/onglet actif non persistés dans le brouillon ; aperçu d'un replay si le brouillon a été édité après un commit ambigu ; verrou PIN Edge ; jour métier Algiers ; chiffrement sauvegardes/QR ; `maxDevices` ; TTL cloud.

## 39) Session 2026-10-25 — Conditionnement carton (migration 0054)

- **Commit** : `75f9cba` (slice complète) ; ce handoff est le commit `docs(handoff)` associé. ADR-136.
- **Migration 0054** (0052/0053 déjà prises, règle 12) : table `product_packagings` (facteur > 1, prix vente/achat carton, auto, actif) + index partiel **un seul actif par produit** ; colonnes `packaging_id`/`unit_factor` sur `sale_items`, `stock_intake_items`, `return_items`, `product_barcodes` ; `stock_intake_items.line_total_minor` ; backfills facteur 1 + total payé historique. Aucune vente historique recalculée.
- **Domaine** `src/domain/packaging` : `splitQuantityByCarton`, `priceSaleLine` (1 ligne pièce sous le seuil, sinon 1 carton × n + reste), `allocateUnitCosts`/`allocateUnitCostLayers` (plus grand reste compact, 1–2 paliers, somme exacte), `toBaseQuantity`. Tarif carton appliqué seulement si `(facteur−1) × prix pièce ≤ prix carton < facteur × prix pièce` ⇒ **monotonicité** garantie.
- **Vente** : `buildSalePayload`/`totalsOf` projettent les lignes caisse via `expandSaleLines` ; `createSaleAtomic` agrège le stock **par produit en unités de base AVANT écriture**, consomme le FIFO sur `baseQty`, écrit `sale_items.packaging_id/unit_factor` et des mouvements `-baseQty`. Le main relit le conditionnement en DB : facteur, prix carton et prix d'origine doivent correspondre, sinon refus FR. Double-submit operationId = une seule vente.
- **Achat** : `unitFactor`/`packagingId` acceptés ; quantité reçue en cartons, abîmés en pièces ; `line_total_minor = prix × reçus + fret` ; `netBase = reçus × facteur − abîmés` ; `allocateUnitCostLayers` crée 1–2 couches FIFO dont la somme vaut le total payé ; `purchase_price_minor` dérivé par pièce (prix de vente jamais écrasé). Retours fournisseur éligibles en unités de base.
- **Retours client** : `unit_factor` porté par la ligne de retour ; sélection de la ligne vendue dans la **même unité** ; éligibilité cumulée en unités de base ; carton complet uniquement (retour partiel refusé) ; restock/FIFO/mouvement en `baseQty` ; annulation miroir en unités de base.
- **UI FR** : section « Conditionnement » du formulaire produit (libellé, taille, prix carton vente/achat, tarif auto) ; caisse « N unités — X carton(s) de F + R unité(s) », badges **Tarif carton**, **Économie : …**, **Prix manuel** (règle désactivée) ; achat « Unité d'achat Carton/Pièce » + résumé `N pièces — coût/pièce` ; ticket avec lignes « carton » et « pièce » (libellé figé dans `unit_code`).
- **Rapports** : Top produits, rotations Dashboard et `stock_qty` des retours multiplient par `unit_factor` (unités de base) ; les montants restent les totaux de ligne figés.
- **Tests** : `packaging-rules` (découpage, arrondis, monotonicité, totaux exacts), `packaging-allocation-parity` (domaine ↔ main), `packaging-slice` (vente mixte, double-submit, facteur/prix forgés, rollback stock, retours carton/pièces, achat 3 cartons + 2 abîmés avec couches exactes), contrats gelés et migrations à jour.
- **Portes** : `format:check` 0 (un fichier de la session 38 réaligné) · `typecheck` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · `vitest` **159 fichiers / 1103 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **230**) · `verify:migrations` VERIFIED (54) · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0 · `knip` **0**.
- **Hors périmètre Phase 1** : code-barres carton, retour partiel de carton (allocation cumulative), plusieurs niveaux de carton, prix de gros client. À noter : un changement de prix/conditionnement entre l'ajout au panier et l'encaissement est refusé (message FR « rafraîchissez le panier »), jamais appliqué silencieusement.

## 40) Session 2026-10-25 — Coût FIFO en caisse (ADR-137)

- **Commit** : `86876ca` (10 fichiers, +384/−16) ; ce handoff est le commit `docs(handoff)` associé. ADR-137.
- **Symptôme** : après réception d'un stock à un nouveau prix, la caisse comparait le prix facturé au dernier prix d'achat (`products.purchase_price_minor`) : vendre l'ancien stock à son ancien prix déclenchait une fausse alerte « sous coût » et l'audit `sale.created` mémorisait un coût erroné, alors que le COGS FIFO des rapports était déjà correct.
- **Correctif** : `products.search`/`products.getByBarcode` exposent `fifo_next_unit_cost_minor` (plus ancienne couche restante) ; `sell-search.addProduct` l'utilise comme coût de référence ; le dialogue prix affiche « Coût FIFO » et l'alerte sous-coût s'appuie dessus. `createSaleAtomic` calcule le sous-coût **après** `consumeLayers` en comparant le total facturé au COGS FIFO réel, et fige `sale_items.purchase_price_minor` au coût FIFO moyen de la ligne. `products.purchase_price_minor` reste le dernier coût (ADR-021) ; rapports/valorisation inchangés.
- **Tests** : `tests/integration/fifo-sale-cost.test.ts` (prochaine couche exposée, vente couverte par l'ancien stock non signalée, audit réel quand la ligne traverse les couches).
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · `vitest` **160 fichiers / 1106 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **230**) · `verify:migrations` VERIFIED (54) · `verify:domain` VERIFIED · `verify:fr` 0 (334) · `verify:encoding` 0 (913).
- **Reste ouvert** : l'avertissement préalable est basé sur la prochaine unité (estimation) ; pour une ligne qui traverse plusieurs couches, seul l'audit serveur est exact. Le prix d'achat affiché dans Stock/Produits reste le dernier prix d'achat (référence d'achat) ; la valeur du stock reste FIFO.

## 41) Session 2026-10-25 — Retours : imputation automatique sur la dette (ADR-138, migration 0055)

- **Demande** : fiche d'audit du module retours — le stock revenait mais le solde client ne bougeait pas ; vérifier aussi les rapports. Après preuve des défauts, décision propriétaire : **خصم تلقائي من الدين أولًا**.
- **Constats prouvés** : remboursement espèces sur une vente à crédit ⇒ dette et document intacts ; avoir > solde perdu (Q6) ; crédit imputé compté comme **espèces** dans le Z ; avoir impossible après clôture du jour de vente (trigger 0048) ; valeur de retour au **prix catalogue** (avant remise) et **première ligne** du produit ; `Rapports` (hors Dashboard) brut.
- **Migration 0055** (`0055_return_credit_allocations.sql`) : `sales.credit_applied_minor` + triggers `0 <= crédit <= payé` ; table `customer_credit_allocations` (`return_id`, `customer_id`, `sale_id` nullable = crédit non affecté, montant, date) + index + triggers d'appartenance/plafond ; `return_items.sale_item_id` + index ; recréation de `v_customer_balance_check` (soustrait les crédits non affectés) et `v_daily_sales` (`paid_minor` hors crédit). Aucune migration 0001-0054 modifiée.
- **Main** : `return-settlement.ts` (règle pure, miroir testé de `computeReturnSettlement`) ; `createReturnAtomic` calcule `creditApplied = min(valeur nette, solde)`, alloue la vente d'origine puis les ventes ouvertes les plus anciennes, laisse la vente d'un jour clos intacte (crédit non affecté), met à jour `customers.outstanding` dans la même transaction, refuse les espèces au-delà de l'excédent, stocke le crédit **réellement imputé**, calcule statut/reste dessus ; `finance.repo.ts` exclut `credit_applied_minor` du Z et de la zakat ; `credit-gates.ts` exige `debt-management` dès qu'un client a une dette ; `getReturnableSaleItems` expose le solde et l'éligibilité par ligne.
- **Valeur nette** : le retour utilise `sale_items.line_total_minor` au prorata (`× qté retournée / qté vendue`, plafonné au reste de la ligne) et `sale_item_id` ; `return_items.sale_item_id` trace la ligne. Plus de sur-remboursement sur une ligne remisée ni de mélange entre deux lignes du même produit.
- **UI** : `NewCustomerReturnDialog` affiche dette actuelle / dette après retour, avoir automatique en lecture seule, espèces préremplies avec l'excédent (champ désactivé si 0), envoie `saleItemId`, total par ligne net ; `DetailsDrawer`/liste affichent le crédit réellement imputé ; `ReturnsScreen` renomme le KPI « Retours (total) » (le compteur n'était pas journalier).
- **Tests** : `tests/integration/returns-auto-settlement.test.ts` (7 : cash sur dette, multi-factures, jour clos, Z, remise, deux lignes du même produit, idempotence) ; `w1-money-atomicity` adapté (5 cas de règlement) ; `domain-rules` + `main-domain-parity` ; vérification 0055 dans `verify-migrations` ; E2E `credit-return` **3/3**, dont le scénario propriétaire vente à crédit → retour → dette réduite automatiquement.
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint` (fichiers touchés) 0 · **vitest 161 fichiers / 1121 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **232**) · `verify:migrations` VERIFIED (55) · `verify:domain` VERIFIED · `verify:fr` 0 (335) · `verify:encoding` 0 (917) · `knip` 0 · `format:check` 0 · E2E ciblé 3/3.
- **Base réelle (copie)** : 0055 appliquée sur une copie de `%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite` (844 Ko) ⇒ `integrity_check=ok`, **0 violation FK**, colonne/table/`sale_item_id` présents. Aucune écriture sur l'original.
- **Piège E2E** : la session shell avait `ELECTRON_RUN_AS_NODE=1` ⇒ `electron.launch` échoue « Process failed to launch ! ». Faire `unset ELECTRON_RUN_AS_NODE` avant `npm run test:e2e` (les 3 specs `credit-return` passent ensuite).
- **Reste ouvert** : `Rapports` (hors Dashboard) affiche toujours ventes/marges **brutes** (décision de netting à prendre) ; les remboursements complémentaires n'ont pas de date de paiement propre (le Z les impute au jour de création) ; le crédit non affecté n'a pas de ligne UI dédiée dans le tiroir client ; la double source `customers.outstanding` vs `sales.remaining` reste (Q7), désormais allouée/alignée et contrôlée par `v_customer_balance_check`.

## 42) Session 2026-10-25 — Caisse : codes-barres à lettres + ajout direct sur correspondance

- **Demande propriétaire** : « le code-barre doit supporter les lettres, et quand il correspond à la recherche il s'ajoute directement au panier de vente ».
- **Constat** : le chemin « code-barres exact » existait mais exigeait `[0-9A-Za-z-_.]{4,}`, comparait la casse en SQL (`barcode = ?`) et n'était pas prioritaire sur le préfixe quantité. Un code court (`A1`), à symboles (`AB/CD-12`) ou saisi/scanné dans une casse différente de la fiche n'était donc jamais ajouté directement ; un scan machine inconnu à lettres restait silencieux et le scan suivant se concaténait au champ.
- **`src/features/sales/sell/sell-search.ts`** : `isBarcodeLike` = jeton unique (aucun espace) ≥ 2 caractères, lettres/symboles/chiffres. `runSearch` tente **toujours** le code-barres exact en premier — d'abord le **jeton complet** (un vrai code `2X500G` gagne sur « 2 × 500G »), puis le code du préfixe quantité explicite (`2x AB-12`, `1,5*619…`), puis seulement la recherche texte. En **rafale machine**, le préfixe quantité est désactivé : un code scanné peut contenir `x`/`*`, jamais interprété comme « 2 × 500G » (la quantité rapide reste une saisie humaine). Un échec issu d'une **rafale machine** (`scanBurstRef`) affiche « Code-barres inconnu… » et vide le champ, y compris pour un code alphanumérique (avant : silence + concaténation `CODE1CODE2`).
- **`electron/ipc/handlers/products.repo.ts`** : `getProductByBarcode` et `searchProducts` comparent le code avec `COLLATE NOCASE` (ASCII) ; à casse identique la correspondance exacte garde la priorité (`ORDER BY (barcode = ?) DESC`, puis principal/ancienneté). Aucun changement d'écriture, d'unicité ni de migration : la casse stockée reste intacte (les codes réellement sensibles à la casse ne sont pas réécrits).
- **Tests** : `tests/unit/sales/sell-split.test.ts` — prédicat élargi, ajout direct lettres+symboles, code court, `2X500G` prioritaire, rafale `2X500G` inconnu sans interprétation quantité, préfixe `2*AB-12`, scan inconnu alphanumérique (message + vidage), saisie humaine inconnue (ni message ni vidage) ; nouveau `tests/integration/barcode-lookup.test.ts` (4 : scan majuscules → fiche minuscule, liste caisse, priorité casse exacte, symboles stricts).
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · eslint (fichiers touchés) 0 · **vitest 162 fichiers / 1132 tests 0** · `build` ✓ · `verify:migrations` VERIFIED (55). E2E non rejoués (pas de changement de flux UI ; logique couverte unit + intégration).
- **Décision assumée** : l'ajout automatique reste réservé à une **correspondance code-barres exacte** ; une recherche par nom (même à résultat unique) conserve ↑↓ + Entrée — sinon une pause de frappe ajouterait un produit non voulu.
- **Reste ouvert** : deux codes-barres ne différant que par la casse peuvent coexister (contrainte `UNIQUE` BINARY) ; la recherche ignore la casse et privilégie la casse exacte, mais l'import CSV ne détecte pas encore ce doublon de casse. Une normalisation/unicité NOCASE demanderait une migration dédiée.

## 43) Session 2026-10-26 — Annulation / correction des factures de vente et d'achat (ADR-139)

- **Demande propriétaire** : « ajouter la possibilité de modifier ou annuler une facture de vente ou d'achat ». Choix validés : vente = **annuler puis rééditer** (pas de modification en place) ; achat = **facture fournisseur / réception de stock** ; permissions existantes (`cancel` pour la vente, `stock` pour l'achat).
- **Vente — canal `sales.reopen`** (`electron/ipc/handlers/sales.repo.ts` `reopenSaleAtomic`, idempotent, permission `cancel`) : construit d'abord le panier de réédition (refus si produit archivé), puis annule dans la **même transaction** via `cancelSaleAtomic` (stock, couches FIFO, paiements, solde client), écrit `sale.reopened` dans l'audit et renvoie les lignes. Rejouer le même `operationId` renvoie le même panier. **Aucune ligne historique n'est modifiée** ; la nouvelle facture reçoit un nouveau numéro.
- **Reconstruction du panier** : lignes pièces (prix, remise, **montant saisi verrouillé** conservé), lignes **carton** converties en unités de base + métadonnées packaging (tarif carton, facteur, libellé, `auto=true`) avec un prix pièce qui rend le tarif carton applicable et **conserve le total** ; coût de référence = prochaine couche FIFO. Client et frais de livraison repris ; montant encaissé remis à zéro (nouvel encaissement).
- **UI vente** : bouton « Modifier la vente (annuler et rééditer) » dans le détail de l'Historique, à côté de l'annulation ; le brouillon passe par `src/shared/sales/pending-sale-edit.ts` puis est appliqué par `useSellState` **après l'hydratation des paniers persistés** (sinon écrasé), via `cart-store.openTabWith` (réutilise un panier vide, sinon nouvel onglet, limite 20) et navigue vers la Caisse (`onNavigate` passé par le shell). Le stock affiché est celui **après annulation** (sinon une vente ayant vidé le stock resterait « en rupture ») et le contexte crédit du client est rechargé (autorisation/solde/plafond).
- **Achat — `stock.intakeDetail` + `stock.intakeCancel`** (`inventory.repo.ts`) : annulation d'une réception **intacte** — refus FR si statut ≠ committed, retour fournisseur vivant, couches FIFO consommées/incohérentes, réception historique sans couches, solde fournisseur insuffisant (facture déjà réglée) ou réception liée à un **bon de commande** réceptionné. Sinon : stock − quantité nette, couches neutralisées (`remaining = 0`, jamais supprimées), mouvement `adjust_out` (`related_entity_type = intake_cancel`, référence facture), dette fournisseur − total, statut `cancelled`, audit `stock.intake_cancelled`, idempotence.
- **UI achat** : `StockIntakesDrawer` — lignes cliquables, statut Validée/Annulée, détail (fournisseur, totaux, quantités reçues/abîmées/net, ligne), boutons « Annuler la facture » et « Corriger (annuler et recréer) ». La correction ouvre `StockIntakeDialog` prérempli (fournisseur, n° facture, date, livraison, notes, produits, quantités, prix d'achat hors fret reconstruit). Le prix de vente saisi n'est pas conservé (le prix catalogue actuel reste référence). Les stats fournisseur (`last_intake_at`, `intake_count`) et le compteur d'entrées de la fiche fournisseur excluent désormais les réceptions annulées.
- **Correctif découvert** : `cancelSaleAtomic` remettait `amount_paid = 0 / remaining = total` ; pour une vente **sans client** (ou client sans crédit autorisé), le trigger 0051 « crédit » refusait cette écriture. Les ventes annulées sans créance possible sont désormais **soldées** (`paid = total`, `remaining = 0`, paiements supprimés, vente annulée) ; les ventes à crédit autorisées gardent le miroir E-25. Aucun impact rapports (tous filtrent `is_cancelled = 0` / `sale_payments` supprimés).
- **Aucune migration** : `stock_intakes.status` acceptait déjà `cancelled` ; mouvement en `adjust_out` existant. ADR-139 créé ; `docs/INDEX.md` mis à jour (non commité, voir ci-dessous).
- **Tests** : `tests/integration/sale-reopen.test.ts` (6 : annulation/panier, idempotence, retours, produit archivé, ligne carton, montant saisi) ; `tests/integration/intake-cancel.test.ts` (7 : annulation complète, idempotence, stock consommé, retour fournisseur, facture réglée, bon de commande, sans fournisseur) ; `tests/unit/sales/cart-store-open-draft.test.ts` (4) ; garde ADR-021 de `fifo-layers` mise à jour (annulation seule, pas d'update/delete) ; snapshot `ipc-channels.json` +3 canaux.
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · eslint (fichiers touchés) 0 · **vitest 165 fichiers / 1149 tests 0** · `build` ✓ · `verify:migrations` VERIFIED (55). **E2E non rejoués** (flux UI non couvert par Playwright cette session).
- **Limites assumées** : pas de modification en place ; réception liée à un bon de commande → retour fournisseur ; stock consommé → retour fournisseur/ajustement ; l'annulation d'une réception crée un mouvement « ajustement » (filtre Stock), pas un type dédié ; jour clos non bloquant (même comportement que l'annulation de vente).
- **Git** : code/tests/ADR commités séparément ; `handoff.md` et `docs/INDEX.md` laissés dans l'arbre car ils contiennent aussi les modifications non commitées de la session 41.

## 44) Session 2026-10-26 — Catalogue : étiquettes de la sélection multi-pages

- **Demande propriétaire** : après avoir coché des produits sur plusieurs pages du Catalogue, « Étiquettes » n'imprimait que les produits de la page affichée.
- **Cause prouvée** : la sélection (`Set<number>`) survivait bien aux changements de page, mais `openLabelsSelection` construisait les étiquettes en filtrant `rows` (page courante) par la sélection. Les fiches des pages précédentes n'étaient plus disponibles au moment de l'impression.
- **Correctif UI** : `ProductsScreen` stocke la sélection dans `Map<number, Product>` — cocher une ligne mémorise la fiche, la page suivante ne l'écrase pas. `toggleSelectPage`, archivage (`[...selection.keys()]`) et les remises à zéro utilisent la Map. Helper pur `labelTargets(products)` (`src/features/products/types.ts`) : ignore les produits sans code-barres et projette `{ name, priceMinor, barcode }` ; `LabelTarget` y est déplacé (LabelsDialog et ré-export `ProductDialogs` mis à jour). Aucun canal IPC, aucune migration, aucun ADR.
- **Tests** : `tests/unit/catalogue.test.ts` — régression « selection across ALL pages » (2 produits de 2 pages, sans code-barres ignoré) ; nouveau `tests/e2e/catalogue-labels.spec.ts` — import CSV de 21 produits (2 pages), 1 coché sur chaque page, l'aperçu iframe contient **2** `.label` (1 seul avant le correctif). La licence du harnais E2E accorde `excel-export` (import CSV) et `barcode-scanner` (aperçu des étiquettes), nécessaires aux flux réels.
- **Limite assumée** : la fiche mémorisée est celle du moment de la coche (nom, prix, code-barres) ; modifier un produit passe par `refresh()` qui vide la sélection.
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · eslint (fichiers touchés) 0 · prettier 0 · **vitest 165 fichiers / 1150 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **232**) · `verify:fr` 0 (336 fichiers) · **E2E `catalogue-labels` 1/1** · `graphify update` rejoué.
- **Git** : correctif + tests + E2E commités ; `handoff.md` laissé dans l'arbre pour la même raison qu'en §43 (modifications non commitées de la session 41).

## 45) Session 2026-10-26 — Carton : devis convertibles + retours fournisseur en unités justes (ADR-140, migration 0056)

- **Demande propriétaire** : « فحص و التحقق من نظام تعبئة الكرتون و اصلح الأخطاء جذريا » (auditer et corriger à la racine le conditionnement carton).
- **Défaut 1 — devis carton incohérent** : `createProforma` envoyait les lignes de panier **avant** découpage (`15 × prix pièce`) alors que l'aperçu utilisait le total carton. Le devis stocké valait 30000, l'aperçu 28000, et la conversion facturait 30000. Correctif : `expandSaleLines` pour les lignes ET l'impression (`buildProformaLines`), snapshot `packaging_id`/`unit_factor`/`unit_code` sur `proforma_items` (migration 0056), validation main du conditionnement, `unit_factor` entier obligatoire pour une ligne carton.
- **Défaut 2 — conversion perdait le conditionnement** : `convertProformaToSaleAtomic` créait une ligne `PIECE` quantité 1 (au lieu de 12 unités de base) et ne pouvait pas honorer un devis dont le tarif carton avait changé. Correctif : `createSaleAtomic` accepte `trustedPackagingSnapshot` (**interne main, absent du schéma IPC**) pour les conversions de devis : facteur/prix du devis font foi, le stock/FIFO utilisent `quantité × unit_factor`, le conditionnement courant n'est pas revalidé. `sales.create` continue de revalider strictement.
- **Défaut 3 — retours fournisseur en unités mélangées** : l'écran affichait « reçu 3 » (cartons) et « restant 36 » (pièces), saisissait des pièces sans le dire, et proposait 36 alors que seules 34 étaient en stock (les 2 abîmées n'ont jamais été stockées) ⇒ refus « Stock insuffisant ». Correctif : `supplier_return_items.quantity_stock` + `quantity_damaged` (migration 0056, backfill stock=quantity/abîmées=0), éligibilité = **couches FIFO restantes + abîmées non retournées**, mutation : la part stock sort du stock, la part abîmée non ; annulation : seule `quantity_stock` revient. `intakeItemId` optionnel : chaque ligne d'achat est valorisée à **son** prix (carton vs pièce), plus au prix de la première ligne du produit. Journal de couches **agrégé par produit** pour ne pas rejouer la restauration sur deux lignes du même produit.
- **Défaut 4 — correctif latent** : l'INSERT du mouvement d'annulation de retour avait **un placeholder de trop** (10 colonnes / 11 valeurs) ⇒ toute annulation de retour client ou fournisseur échouait en SQL. Corrigé dans les deux branches et couvert par 2 régressions.
- **UI FR** : détail/édition de devis affiche l'unité carton (`Carton de 12 × 12`) et permet d'ajouter une ligne carton au tarif courant ; retour fournisseur affiche « reçu X cartons = Y pcs », « stock N + abîmées M = restant », saisie explicitement en pièces ; le devis depuis la caisse imprime les lignes carton + reste.
- **Tests** : `packaging-slice` (7 → 9 : retour 36 = 34 stock + 2 abîmées, annulation idempotente, deux lignes même produit) ; `proforma-convert-discount` (+1 : devis carton 28000, conversion après désactivation/changement de tarif, stock 85) ; `packaging-rules` (clé d'idempotence conditionnement) ; `sell-split` (impression devis éclatée) ; `migrations` (56) et `verify:migrations` (0056).
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · eslint (fichiers touchés) 0 · prettier 0 · **vitest 165 fichiers / 1156 tests 0** · `build` ✓ · `verify:migrations` **56** ✓. E2E non rejoués (flux caisse/devise couverts par unit + intégration ; aucun changement de canal).
- **Git** : nos fichiers sont dans l'arbre avec la session 41 non commitée ; ne pas committer en bloc sans validation propriétaire (voir §1).
- **Hors périmètre inchangé** : code-barres carton (Phase 3), retour partiel de carton, plusieurs niveaux, prix de gros. La réédition d'une vente carton (`sales.reopen`) reconstruit le panier avec le tarif historique ; si le tarif courant a changé, la revalidation de `sales.create` refuse avec « rafraîchissez le panier » — comportement antérieur, non modifié ici.

## 46) Session 2026-10-26 — Test réel du tarif de gros carton (œufs) + ADR-141

- **Demande propriétaire** : ouvrir le programme et vendre **1 carton + 4 pièces** d'œufs (1 carton = 30, achat 540 DZD, vente carton 650 DZD, vente pièce 25 DZD), vérifier le comportement et corriger tout écart.
- **Test réel** : nouvel E2E `tests/e2e/carton-sale.spec.ts` (vraie fenêtre Electron, base temporaire isolée + licence E2E) — création du produit avec conditionnement, panier 34 pièces, encaissement, ticket, puis lecture SQLite. Sur cette machine, Playwright doit lancer Electron sans `ELECTRON_RUN_AS_NODE` : `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/carton-sale.spec.ts`.
- **Écart trouvé** : le panier affichait bien « 34 unité(s) — 1 carton de 30 + 4 unité(s) », mais **aucun badge « Tarif carton »**, aucune économie, et le total restait **850 DZD** (34 × 25). Cause : le plancher ADR-136 `(facteur−1) × prix pièce` exigeait `29 × 25 = 725 ≤ 650`, donc le tarif carton 650 était ignoré. Avec ce prix, la baisse au seuil (29 = 725, 30 = 650) est pourtant le tarif de gros voulu.
- **Correctif racine** : `priceSaleLine` ne conserve que `prix carton < facteur × prix pièce` (le carton doit être une remise sur le plein au prix pièce) ; le plancher `(facteur−1)` est supprimé. `buildReopenDraft` aligné (plus de plancher, ajustement du prix pièce seulement si le tarif historique dépasse le plein actuel). ADR-141 révise ADR-136 décision 4. Aucune migration, aucun canal, aucun schéma.
- **Résultat E2E après correctif** : badge **Tarif carton**, économie **100,00 DZD**, total **750,00 DZD** (650 + 4 × 25), ticket avec `Carton de 30` et total 750, lignes `sale_items` = `1 × 30 @65000` (packaging_id non nul) + `4 × 1 @2500`, sous-total 85000, remise 10000, payé 75000, stock produit **0** et couches FIFO **0**.
- **Tests** : `packaging-rules` — cas propriétaire 29/30/34 (725 / 650 / 750), carton ≥ plein prix pièce ignoré ; E2E carton 1/1. Suite complète : **165 fichiers / 1156 tests 0**, typecheck/electron 0, eslint 0, build ✓. `verify:migrations` 56 inchangé.
- **Git** : même situation qu'en §45 (session 41 non commitée) — aucun commit global effectué.

## 47) Session 2026-10-26 — Formulaire produit simplifié

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة ادخال منتج » (simplifier et améliorer l'interface de saisie produit).
- **Refonte UI** (`src/features/products/dialogs/FormDialog.tsx`) : le formulaire est passé d'une colonne interminable à **deux colonnes** groupées — **Identification** (nom, codes-barres, catégorie, unité), **Prix** (achat/vente + marge), **Stock & seuils** (stock, seuil, péremption), **Conditionnement** — puis **Options avancées** repliées (fournisseurs liés avec filtre si > 6, stock maximum, produit actif en édition). Les codes-barres deviennent des puces compactes avec bouton d'ajout explicite ; la catégorie peut être créée à la demande (`+`) au lieu d'un champ toujours visible.
- **Gains ergonomiques** : aperçu de **marge en direct** (montant + %, vert ; rouge + « vente à perte » si sous coût), barre d'enregistrement **fixe** en bas (Annuler / Créer ou Enregistrer), raccourci **`Ctrl+Entrée`**, champs montants en police tabulaire, `scroll-margin` sous les champs pour que le focus clavier ne soit pas masqué par la barre fixe. Tous les libellés et `aria-label` utilisés par les tests existants sont conservés.
- **Correctif UX** : un code-barres saisi/scanné **sans Entrée** est désormais inclus dans la liste au moment d'enregistrer (avant, il était silencieusement perdu).
- **Contraintes** : interface 100 % FR, aucun import Electron/Node/SQLite, aucun canal IPC, aucun schéma, aucune migration, aucun ADR (polish UI). Le formulaire reste branché sur `productCreate`/`productUpdate` + `productSetSuppliers` + `productPackagingSave` existants.
- **Vérification réelle** : spec E2E temporaire (supprimée) — création d'un produit avec code-barres, prix 180/250 (marge 70,00 DZD · 38,89 %), conditionnement carton, enregistrement, puis réouverture en édition : valeurs rechargées (nom, prix, carton) confirmées. Captures : `test-results/product-form*.png` (artefacts non versionnés).
- **Portes** : `tsc -p tsconfig.json --noEmit` 0 · eslint (fichier) 0 · prettier 0 · **vitest 165 fichiers / 1156 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **233**) · `verify:fr` 0 (336 fichiers) · **E2E `carton-sale` 1/1 + `scan-flow` 6/6** · `graphify update .` rejoué.
- **Git** : commit **`4a993c2`** (formulaire seul) ; `handoff.md` laissé dans l'arbre car il contient aussi les modifications non commitées des sessions 41/45 (même pratique qu'en §43/§44).
- **Hors périmètre** : pas de modification des règles métier (validation, marge, stock, conditionnement), pas de nouvel écran ni de nouveau canal IPC.

## 48) Session 2026-10-26 — Réception fournisseur simplifiée

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة ادخال مخزون جديد » (simplifier et améliorer l'interface d'entrée de stock).
- **Refonte UI** (`src/features/stock/dialogs/IntakeDialog.tsx`, `Modal extraWide` dans `primitives.tsx`) : modale élargie à **960 px**, regroupée en **Facture fournisseur** (fournisseur replié derrière « Choisir », recherche + création inline, N° facture/date/livraison sur une ligne), **Articles reçus** (cartes de ligne compactes) et **Notes de réception** (repliables). Le **total et le bouton « Valider la réception » sont fixes** en bas ; le détail sous-total/livraison et l'alerte « ligne(s) à compléter » y restent visibles.
- **Lignes** : un seul champ de recherche produit (nom/code-barres, résultats avec stock), ou **« Nouveau produit par nom »** avec mention explicite de la création au catalogue (unité Pièce — comportement backend existant). Unité d'achat **pièce/carton** conservée (`aria-pressed`), libellés d'unité dynamiques et courts (pièce, kg, l…), quantités/prix en police tabulaire, résumé par ligne (net, total ligne, quote-part livraison si > 0, coût rendu, nouveau prix de vente). « Changer » remet à zéro unité, conditionnement, quantités et prix pour éviter de réutiliser les données du produit précédent.
- **Sécurité de saisie** : une ligne **commencée** mais invalide (produit/nom, quantité > 0, prix) bloque la validation avec un message FR listant les lignes et **défilement automatique** vers la première ligne fautive ; une ligne neuve laissée intacte reste ignorée. Le total affiche « — » tant qu'une ligne commencée est incomplète, qu'aucune ligne valide n'existe ou que la livraison est invalide. Le prix de vente vide indique « 0 DZD » en mode nouveau produit, « conserver » sinon. Les anciennes validations domaine/main (prix, facteur, unités, stock) sont inchangées.
- **Garde Entrée (bug latent corrigé)** : le panneau est désormais un `<form>` ; le raccourci global de `Modal` ne peut plus cliquer le bouton principal depuis un champ (avant, Entrée dans le N° facture ou la recherche produit déclenchait « Valider la réception »). Entrée dans un champ ne valide plus rien ; **`Ctrl+Entrée`** valide explicitement et reste un retour à la ligne dans les notes.
- **Tests** : nouveau test E2E dans `tests/e2e/stock-backup.spec.ts` — « Entrée ne valide pas » (N° facture + Entrée ⇒ aucune alerte) puis ligne commencée « zzz » + « Valider la réception » ⇒ alerte « Ligne(s) 1 incomplète(s) », dialogue toujours ouvert (aucune réception créée) ; le test existant « le stock augmente » passe. Vérification visuelle réelle (produit carton, réception 2 cartons + ligne libre 3 pièces, erreur ligne incomplète, puis succès 720 DZD) via spec temporaire supprimée ; artefacts `test-results/intake-*.png` non versionnés.
- **Portes** : `tsc -p tsconfig.json --noEmit` 0 · eslint (fichiers touchés) 0 · prettier 0 · **vitest 165 fichiers / 1156 tests 0** · gardes UI statiques (`a2`, `a3`, `import-export-ui`, `sql-guard`, `ui-dialog-focus`) **18/18** après les derniers ajustements · `build` ✓ · `build:electron` ✓ (manifeste **233**) · `verify:fr` 0 (336 fichiers) · **E2E `stock-backup` 4/4**. `graphify update` à rejouer après cette session.
- **Git** : commits **`c4a4208`** (refonte IntakeDialog + Modal `extraWide` + test E2E) et **`ebbd5c3`** (garde Entrée + test) ; `handoff.md` laissé dans l'arbre car il contient aussi les modifications non commitées des sessions 41/45 (même pratique qu'en §43/§44/§47).
- **Hors périmètre** : aucun changement backend/canal/schéma/migration ; la réception libre continue de créer un produit PIECE au catalogue (contrat existant), et la réédition d'une facture annulée conserve les limites antérieures (prix de vente non conservé).

## 49) Session 2026-10-26 — Coût rendu, prix carton auto, paramètres et formulaires

- **Demande propriétaire** : (1) champ coût produit automatique + répartition de la livraison sur les produits de la facture de réception ; (2) simplifier/reconstruire les Paramètres ; (3) calcul automatique pièce ↔ carton ; (4) simplifier le formulaire client ; (5) organiser les champs produit/client ; (6) code-barres en majuscules même sans Verr. Maj. Contrainte : respecter la session parallèle (retours/proforma non commitée).
- **Coût rendu (ADR-142)** : `receiveStockAtomic` répartit déjà la livraison au prorata exact (`allocateAmountByWeights`) ; `products.purchase_price_minor` reçoit désormais `landingUnit` (fret inclus) pour un produit existant **et** pour un produit créé par nom. La réception affiche la part livraison + coût rendu par ligne et un bloc « Répartition de la livraison » ; le catalogue et la fiche parlent de **Coût**. Test `intake-landed-cost.test.ts` (3 produits, parts 200/300/100, coûts 1 100/3 300/550) ; attente `packaging-slice` 1 941 → 1 971.
- **Prix carton auto (ADR-144)** : helper pur `carton-price-sync.ts` (× facteur, ÷ facteur arrondi centime). Le côté non saisi se calcule ; un prix **manuel** n'est jamais écrasé (le scénario œufs 25/650/30 reste à 750 DZD, E2E carton rejoué). Le bouton « Recalculer » force la conversion depuis les prix pièce. Formulaire réorganisé : Identification + Stock à gauche, Prix & coût + Conditionnement à droite.
- **Paramètres (ADR-143)** : `SettingsScreen` reconstruit — 7 rubriques en 3 groupes avec icônes/descriptions, recherche indexée (`searchSettings`, Ctrl+K), résultats vers la carte, sous-navigation par puces et ancres, en-tête collant ; informations fiscales repliées et ouvertes si déjà remplies. Libellés historiques conservés en `aria-label` (E2E). `Section` modernisée et `SettingsGroup` ajouté ; aucune fonctionnalité retirée.
- **Client (ADR-144)** : formulaire en sections Identité & contact / Adresse / Crédit & règlement / Notes repliées ; aperçu prénom/nom ; barre fixe + `Ctrl+Entrée` ; champs et `aria-label` existants conservés (`Nom complet`, `Créer le client`).
- **Code-barres (ADR-144)** : helper UI ASCII (`uppercaseBarcodeInput`), appliqué au champ produit et aux recherches caisse/catalogue/stock/réception ; normalisation au stockage main (`normalizeBarcodeText`) pour création, mise à jour et import CSV ; recherches existantes NOCASE/LIKE conservées. Tests unitaires + intégration + E2E `barcode-uppercase`.
- **Tests/portes** : `tsc -b` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · **vitest 169 fichiers / 1 170 tests 0** · `build` ✓ · `build:electron` ✓ · `verify:migrations` 56 ✓ (0055/0056 de la session 41, non modifiées) · `verify:domain`/`verify:fr` 340 fichiers/`verify:encoding` 941 fichiers ✓ · `graphify update .` ✓ (avertissement préexistant `TemplateSettingsPanel.tsx`). E2E ciblés : `navigation-smoke` + `component-smoke` 2/2, `carton-sale` 1/1 (750 DZD), `customer-invoice` 2/2, `settings-navigation` 1/1, `barcode-uppercase` 1/1.
- **Git** : commits **`bfef912`** (30 fichiers : code, tests, ADR 142/143/144) et **`5f33cac`** (nom composé préservé à l'édition client). **`packaging-slice.test.ts` a été indexé partiellement** (seule la ligne 1 941 → 1 971) pour ne pas emporter les modifications non commitées de la session 45 ; `handoff.md`, `docs/INDEX.md`, migrations 0055/0056, retours/proforma restent dans l'arbre (sessions 41/45). Aucun commit global.
- **Reste ouvert** : `docs/INDEX.md` à compléter jusqu'à 144 quand la session 41 sera commitée ; `TemplateSettingsPanel.tsx` signalé par graphify (syntaxe partielle, hors périmètre) ; recherche code-barres des dialogues de retours non appliquée pour ne pas toucher les fichiers modifiés par la session parallèle.

## 50) Session 2026-10-26 — Paramètres : composants unifiés et sections regroupées

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة صفحة الاعدادات بما فيها الاقسام و مكونات الاقسام » — simplifier la page Paramètres, ses sections et les composants internes (pas seulement la coquille).
- **Composants** (`bits.tsx`, ADR-145) : `Section` unifiée avec **icône**, **badge d'état** (crédit actif, copies, schéma, version…), **repli optionnel**, en-tête à deux niveaux (h3 conservé pour les E2E) et **pied d'enregistrement** `SaveBar` aligné à droite. `SettingsGroup` pour les sous-parties ; `Segmented` pour les choix de paiement ; `SwitchRow` compacté. Le bouton d'action n'est plus confondu avec « Enregistrer ».
- **Regroupements** : Vente + Sons → carte **Vente** (Caisse, Crédit, Sons) ; Produits + Stock → **Produits** (Catalogue, Stock) ; Clients + Fournisseurs → **Clients** (Crédit client, Fournisseurs). Commerce 5 → 3 cartes, Catalogue 2 → 1. Index de recherche mis à jour ; ancres `sound`/`stock`/`suppliers` retirées ; titres E2E « Vente » et « Produits » conservés.
- **Actions séparées** : Sauvegarde (bouton « Sauvegarder maintenant », dossier/export), Base (« Vérifier », « Optimiser », « Déplacer… », « Réinitialiser… »), Miroir (« Pousser maintenant » à côté d'« Enregistrer »), À propos (dossiers) utilisent des `Button` explicites ; `SaveBar` ne persiste que les formulaires.
- **Divulgation progressive** : fiscale entreprise, textes de facturation repliables, cartes Miroir/À propos repliables avec résumé ; badges d'état sur les cartes.
- **Contraintes** : aucun canal IPC, aucun schéma, aucune migration ; libellés/aria conservés. Seul locator E2E modifié : `full-loop-client` cible `[data-settings-card="sync"]` au lieu de `heading xpath=../..` (en-tête enrichi).
- **Vérification** : `tsc -b` 0 · eslint (fichiers touchés) 0 · prettier 0 · `verify:fr` 340 fichiers 0 · `build` ✓ · `build:electron` ✓ · **vitest 169 fichiers / 1 171 tests 0** (suite complète) · **E2E `settings-navigation` 1/1 · `stock-backup` 4/4 · `full-loop-client` 1/1** (Synchro enregistrée + 7 clichés poussés, 1 accès). Build renderer re-signé avant E2E (`build:electron`) — sans cela l'import de licence E2E refuse l'asset modifié.
- **Git** : commit **`71fbc77`** (9 fichiers : sections + composants + ADR-145 + locator E2E) ; `handoff.md`/`docs/INDEX.md` et le travail non commité des sessions 41/45 restent dans l'arbre.

## 51) Session 2026-10-27 — Studio d'impression : espace de travail unifié

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة صفحة الطباعة » — simplifier et développer la page Impression.
- **Nouvelle structure** (`PrintTemplatesScreen.tsx`, ADR-146) : barre de **tabs document** (ticket 58/80, devis A4, bon de livraison, reçu, retour, étiquettes) avec icônes et résumé du **modèle actif** (nom + version) ; colonne gauche dédiée à la **gestion des modèles** (liste avec badges Actif/usine/version, nom, statut À jour/Modifié, Enregistrer, Activer, Dupliquer, Supprimer, Restaurer l'usine, Import/Export) ; carte imprimante sous le panneau ; à droite, réglages + **aperçu collant** côte à côte sur grand écran.
- **Réglages** (`TemplateSettingsPanel.tsx`) : cinq groupes repliables pilotés par les capacités du domaine (Papier & exemplaires, En-tête & identité, Montants, Codes & étiquettes, Signatures & mentions), résumés d'état (TVA/prix/QR…), cases brutes remplacées par le `Switch` du produit, groupes avancés repliés par défaut. Libellés/aria conservés.
- **Aperçu** : badge **Mise à jour… / À jour** avec séquence anti-réponse périmée, note de format, iframe ou texte 80 mm, bouton **Impression test** séparé de l'enregistrement. Aucun backend/canal/migration modifié.
- **Vérification** : typecheck 0 · eslint 0 · prettier 0 · `verify:fr` 340 fichiers 0 · `build` ✓ · `build:electron` ✓ · **vitest 169 fichiers / 1 171 tests 0** · **E2E `print-studio` 1/1** (tabs, A4, groupe replié, renommage + sauvegarde, aperçu) · capture `test-results/print-studio.png` · `c6-studio` 18/18.
- **Git** : commit **`5b03d9d`** (2 composants + ADR-146 + E2E) ; `handoff.md`/`docs/INDEX.md` et le travail non commité des sessions 41/45 restent dans l'arbre.

## 52) Session 2026-10-27 — Tableau de bord : hiérarchie et détails par onglets

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة صفحة dashboard » — simplifier et développer la page Tableau de bord.
- **Période** (`PeriodToolbar`) : dates, presets avec **preset actif**, résumé de période, Actualiser et menu **Exporter** (PDF/Excel/CSV) réunis dans une carte ; raccourcis F4/F5/F8 conservés.
- **Hiérarchie** : 4 KPI principaux (ventes nettes, marge brute %, trésorerie, créances) + bande compacte de 4 métriques (achats, dépenses, dettes fournisseurs, stock) ; bande « Aujourd'hui » restructurée.
- **Analytique** : ventes/jour + comparaison, encaissements nets par moyen avec total, ventes/marge par catégorie avec filtre et total.
- **Détails** : une carte à onglets **Finances / Stock & dettes / Activité récente** remplace l'empilement interminable ; badge d'alertes sur Stock, icônes d'activité via `RecentCard`.
- **Vigilance** : alerte seulement si sauvegarde/intégrité manquante ; sinon ligne de statut discrète en pied.
- **Correctif de structure** : suppression du `h-full overflow-auto` interne (double défilement/zones cliquables interceptées) ; la page grandit dans le `main`.
- **Vérification** : typecheck 0 · eslint 0 · prettier 0 · verify:fr 340 fichiers 0 · build ✓ · build:electron ✓ · `dashboard.test` 1/1 · **vitest 169 fichiers / 1 171 tests 0** · **E2E `dashboard-ui` 1/1 + `component-smoke` 1/1** (vente réelle, presets, onglets, menu export) · captures `test-results/dashboard.png` et `dashboard-details.png`.
- **Git** : commit **`08a3ba1`** (dashboard + widgets + ADR-147 + E2E) ; `handoff.md`/`docs/INDEX.md` et le travail non commité des sessions 41/45 restent dans l'arbre. **E-35 (jour métier UTC) reste ouvert**, hors périmètre UI.

## 53) Session 2026-10-27 — Refonte visuelle transversale (ADR-148)

- **Demande propriétaire** : « قم باعادة تصميم كل واجهات صفحات البرنامج بسط و طور الواجهات » — refondre toutes les interfaces, simplifier et améliorer.
- **Socle partagé** (`src/shared/ui/primitives.tsx`) : `PageHeader` plat (sur-titre module, H1, période, actions) sans carte ni badge « Poste Principal » ; nouveau `StatsStrip` (une surface, 2 × 2 mobile / 4 ou 5 colonnes desktop, tons conditionnels) ; nouveau `Toolbar` (une rangée, recherche à gauche, filtres au centre, actions secondaires à droite) ; `Card`/`Button`/`Kpi`/`Modal` allégés (surfaces `#101f31`, rayons et ombres cohérents, moins de glow) ; `Kpi` compact pour le Dashboard et les Rapports.
- **Écrans de liste** : Catalogue, Clients, Stock, Dettes, Dépenses, Retours, Historique, Devis, Fournisseurs, Zakat. Suppression de la recherche dupliquée dans la barre d'outils, du bouton « Filtres » et de son état replié ; exports/imports déplacés dans la barre ; selects sans libellés au-dessus (options contextualisées) ; quatre cartes KPI remplacées par `StatsStrip`. `Zakat` utilise le bandeau 5 cellules. Les titres H1, `aria-label`, raccourcis F3/F8 et libellés E2E sont conservés (seul `barcode-uppercase` passe de « Recherche catalogue » à « Rechercher un produit »).
- **Coquille** (`App.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `ShellOverlays.tsx`) : la bande « Session » est fusionnée dans le bandeau (nom, rôle, bouton « Changer d'utilisateur ») ; le libellé du module quitte le bandeau (déjà dans le H1) ; la sidebar garde un état actif très lisible mais plus calme (surface + barre ambre au lieu de l'aplat ambre) ; le pied de raccourcis est plus discret ; les toasts passent en bas à droite pour ne plus masquer le bandeau. Le chrome de fenêtre, la porte session et les gardes licence sont inchangés.
- **Thème clair** (`globals.css`) : surcharges des nouvelles surfaces (`#101f31`), bordures `white/10`–`white/25`, textes `slate-50`/`white`, étiquettes de la sidebar, séparateurs de `StatsStrip` et en-têtes de tableaux sur bande crème. Le thème sombre reste la référence (ADR-033).
- **Vérification visuelle** : spec E2E temporaire supprimée après usage — captures réelles `test-results/ui/catalogue-v2.png`, `clients-v2.png`, `catalogue-clair-v2.png` (artefacts non versionnés) ; rendu vérifié en sombre et clair.
- **Portes** : `tsc -b` **0** · `typecheck:electron` **0** · `eslint src/features src/app/shell src/shared/ui --max-warnings 0` **0** · prettier **0** · `verify:fr` **0** (340 fichiers) · `verify:encoding` **0** (947 fichiers) · **vitest 169 fichiers / 1 171 tests 0** · `build` ✓ · `build:electron` ✓ · **E2E 6/6** (`navigation-smoke`, `component-smoke`, `barcode-uppercase`, `catalogue-labels`, `settings-navigation`, `dashboard-ui`).
- **Git** : commits **`9b7c564`** (UI + test + ADR-148, 20 fichiers) et **`2707f41`** (Devis). Le commit Devis a été indexé **hunk par hunk** pour laisser hors index l'addition de type de la session 45 (`unit_code`/`packaging_id`/`unit_factor`, inutilisée) ; `handoff.md`, `docs/INDEX.md` et les sessions 41/45 restent dans l'arbre. **ADR-148** ajouté ; `docs/INDEX.md` sera complété jusqu'à 148 avec les sessions 41/45.
- **Hors périmètre** : aucune règle métier, aucun canal IPC, aucun schéma, aucune migration, aucune dépendance UI nouvelle.
