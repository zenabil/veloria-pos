-- Veloria PoS — Migration 0053 : identité d'encaissement persistée avec le panier.
-- Une tentative de vente interrompue (crash/reload) doit rejouer le MÊME
-- operationId au redémarrage : `createSaleAtomic` reconnaît alors la vente
-- déjà commitée au lieu d'en créer une seconde. Aucun backfill : les
-- brouillons existants restent sans identité (nouvelle tentative = nouvel id).
ALTER TABLE cart_drafts ADD COLUMN sale_operation_id TEXT;
