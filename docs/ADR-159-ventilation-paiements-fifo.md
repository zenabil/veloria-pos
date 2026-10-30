# ADR-159 — Encaissement standalone ventilé FIFO sur les factures ouvertes

- **Date** : 2026-10-30
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : repo main (`electron/ipc/handlers/customers.repo.ts`), deux
  libellés d'aide UI. Aucune migration SQLite, aucun changement de domaine
  financier, aucun nouveau canal IPC.

## Contexte

Le client a UNE dette agrégée (`customers.outstanding_balance_minor`), mais le
grand-livre des créances est tenu PAR FACTURE (`sales.remaining_balance_minor`,
`sales.due_date`) : la liste des dettes, le statut « En retard », la carte du
tableau de bord et les reçus s'appuient tous sur les ventes ouvertes.

Deux chemins de paiement coexistaient :

1. **Lié à une facture** (`saleId` fourni, écran Dettes) : met à jour la vente
   ET le solde client — cohérent.
2. **Standalone** (`saleId: null`, fiche client « Règlement » et écran de
   vente « Régler la dette ») : ne décrémentait QUE le solde client. Aucune
   écriture sur les ventes, aucune ventilation (pas de FIFO).

Conséquence du chemin 2 : après un encaissement standalone, la liste des
dettes continuait d'afficher les mêmes factures (mêmes restes dus, mêmes
échéances dépassées), et la somme des restes dus par facture ne correspondait
plus au solde client. Le kiosque et le tableau de bord mentaient jusqu'au
prochain paiement lié.

## Décision

**La ventilation FIFO est exécutée dans la MÊME transaction que le paiement.**
Un encaissement standalone est réparti sur les factures ouvertes du client de
la plus ancienne à la plus récente (`ORDER BY created_at ASC, id ASC`,
annulées exclues, `remaining_balance_minor > 0`).

### 1. Écriture comptable : une ligne par facture bénéficiaire

- Ligne `sale_payments` par facture, `sale_id` renseigné, `operation_id =
${operationId}:${saleId}` (déterministe), montant = part allouée.
- Chaque vente est mise à jour (`amount_paid_minor`, `remaining_balance_minor`,
  `payment_status`) avec la même instruction que le chemin lié.
- Le reliquat éventuel (solde sans facture ouverte, ex. solde initial) reste
  une ligne standalone à l'`operationId` exact — comportement historique.
- Le solde client est décrémenté UNE fois, du montant total, et son
  `debt_status` est recalculé après les mises à jour de ventes (E-30).

### 2. Idempotence

`findExisting` cherche d'abord l'`operationId` exact, puis le préfixe
`${operationId}:` (échappé pour LIKE) et retourne la première ligne allouée —
ligne d'ancrage stable entre le premier appel et tout rejeu. La contrainte
UNIQUE existante tranche les courses ; en cas de conflit, le catch retrouve le
gagnant via la même recherche.

### 3. Effets

- Liste des dettes, « En retard », carte du jour et créances top 5 reflètent
  immédiatement l'encaissement (les créances soldées disparaissent, les
  échéances dépassées se nettoient).
- Somme des restes dus par facture = solde client après tout paiement
  standalone (tant que les données historiques sont cohérentes).
- Aide UI FR ajoutée : « Le montant est réparti automatiquement sur les
  factures les plus anciennes. » (fiche client) et « Montant borné par la
  dette et réparti sur les factures les plus anciennes. » (caisse).

### 4. Ce qui n'est PAS fait

- **Aucun backfill** des encaissements standalone antérieurs : leurs factures
  restent ouvertes dans l'historique. Le passé n'est pas réécrit ; un écart
  éventuel est un état historique, pas un bug de lecture.
- Pas de table d'allocation dédiée ni de reçu « multi-factures » : un
  encaissement standalone apparaît comme plusieurs lignes de paiement liées
  aux factures. Le reçu papier imprimé à chaud reste unique (données client),
  mais un re-reçu depuis l'historique se rapporte à une ligne (étape) de la
  ventilation.

## Alternatives écartées

- **Paiement à une seule ligne + table `sale_payment_allocations`** : plus
  propre pour le reçu historique, mais migration + jointures dans le détail
  des dettes et le relevé, sans gain fonctionnel immédiat.
- **Interdire l'encaissement standalone** : force le passage par l'écran
  Dettes, plus de clics et rupture du flux caisse.
- **Liste des dettes agrégée par client** : simplifie l'affichage mais
  supprime les échéances par facture.

## Tests

`tests/integration/customer-payment-fifo.test.ts` (base migrée réelle) :
ventilation la plus ancienne d'abord + alignement liste des dettes, reliquat
sans facture, rejeu `operationId`, refus > solde avec rollback, exclusion des
ventes annulées. Suites adjacentes (reçu, idempotence LWW, atomic slices,
dashboard paiements annulés, boucle client) vertes.
