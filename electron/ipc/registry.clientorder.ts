// Veloria PoS - IPC: commandes clients (ADR-182, tranche C).
//
// Le commerçant enregistre la commande reçue (par WhatsApp ou par l'app), la
// fait préparer, puis l'encaisse : la vente lie la commande (une seule
// transaction, migration 0063). Aucune écriture financière ici : ce canal ne
// vend rien, il prépare la vente.

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as Orders from "./handlers/client-order.repo";
import { handle } from "./handle";

export function registerClientOrderChannels(): void {
  // File des commandes (toutes, ou filtrée par état / client).
  handle(IPC_CHANNELS["orders.list"], V.clientOrderListSchema, (input) =>
    Orders.listClientOrders({
      status: input.status ?? null,
      customerId: input.customerId ?? null,
      limit: input.limit,
    }),
  );
  // Une commande + ses lignes.
  handle(IPC_CHANNELS["orders.get"], V.clientOrderIdSchema, (input) =>
    Orders.getClientOrder(input.id),
  );
  // Enregistrement d'une commande (mutation idempotente).
  handle(IPC_CHANNELS["orders.create"], V.clientOrderCreateSchema, (input) =>
    Orders.createClientOrderAtomic({
      operationId: input.operationId,
      customerId: input.customerId,
      lines: input.lines,
      note: input.note ?? null,
      source: input.source,
      now: new Date().toISOString(),
    }),
  );
  // Changement d'état (le trigger SQL reste l'arbitre final).
  handle(IPC_CHANNELS["orders.setStatus"], V.clientOrderSetStatusSchema, (input) =>
    Orders.setClientOrderStatusAtomic({
      orderId: input.orderId,
      status: input.status,
      cancelReason: input.cancelReason ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
}
