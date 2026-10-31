// Veloria PoS - IPC: clients + acces APK + synchro miroir (extrait de registry.ts, deplacement pur).

import { randomUUID } from "node:crypto";
import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as Customers from "./handlers/customers.repo";
import { importCustomersAtomic } from "./handlers/import.repo";
import * as ClientAccess from "./handlers/client-access.repo";
import { getCurrentStaffUser } from "./handlers/staff-session";
import {
  enqueueCustomerRefresh,
  enqueueInvoiceDetailRefresh,
  enqueueSaleRefresh,
  getShopEndpoint,
  getSyncView,
  pushNowAtomic,
  saveOwnerAccountAtomic,
  saveSyncConfigAtomic,
} from "../sync/sync.service";
import { handle } from "./handle";

export function registerCustomersChannels(): void {
  // customers (repository : handlers/customers.repo.ts)
  handle(
    IPC_CHANNELS["customers.search"],
    V.paginationSchema.extend({
      query: V.productSearchSchema.shape.query,
      includeArchived: V.productSearchSchema.shape.includeArchived,
      debtFilter: V.customerDebtFilterSchema.default("all"),
      archivedOnly: V.archivedOnlySchema,
      sort: V.customerSortSchema,
    }),
    (input) =>
      Customers.searchCustomers(
        input.query,
        input.page,
        input.pageSize,
        input.includeArchived,
        input.debtFilter,
        input.archivedOnly,
        input.sort,
      ),
  );
  handle(IPC_CHANNELS["customers.stats"], V.emptyPayloadSchema, () => Customers.getCustomerStats());
  handle(IPC_CHANNELS["customers.restore"], V.idempotentIdSchema, (input) => {
    Customers.restoreCustomer(input.id, new Date().toISOString(), input.operationId);
    return { restored: true };
  });
  handle(IPC_CHANNELS["customers.create"], V.customerCreateSchema, (input) => ({
    id: Customers.createCustomer({
      operationId: input.operationId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      address: input.address ?? null,
      creditLimitMinor: input.creditLimitMinor,
      initialBalanceMinor: input.initialBalanceMinor,
      settlementDay: input.settlementDay ?? null,
      isBreadClient: input.isBreadClient,
      creditAllowed: input.creditAllowed,
      notes: input.notes ?? null,
      now: new Date().toISOString(),
    }),
  }));
  // Import CSV clients (lot) : validation totale puis UNE transaction
  // (tout-ou-rien) — même règle que l'import produits.
  handle(IPC_CHANNELS["customers.import"], V.customersImportSchema, (input) =>
    importCustomersAtomic(
      input.rows.map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
      })),
      new Date().toISOString(),
      input.operationId,
    ),
  );
  handle(IPC_CHANNELS["customers.update"], V.customerUpdateSchema, (input) => {
    Customers.updateCustomer({
      id: input.id,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      address: input.address ?? null,
      creditLimitMinor: input.creditLimitMinor,
      creditAllowed: input.creditAllowed,
      settlementDay: input.settlementDay ?? null,
      notes: input.notes ?? null,
      now: new Date().toISOString(),
      operationId: input.operationId ?? null,
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["customers.archive"], V.idempotentIdSchema, (input) => {
    Customers.archiveCustomer(input.id, new Date().toISOString(), input.operationId);
    return { archived: true };
  });
  handle(IPC_CHANNELS["customers.recordPayment"], V.recordPaymentSchema, (input) => {
    const now = new Date().toISOString();
    // P08: paymentDate est une businessDate YYYY-MM-DD — jamais un ISO datetime.
    const paymentDate = input.paymentDate ?? now.slice(0, 10);
    const { paymentId, allocatedSaleIds } = Customers.recordCustomerPaymentAtomic({
      operationId: input.operationId,
      customerId: input.customerId ?? null,
      saleId: input.saleId ?? null,
      amountMinor: input.amountMinor,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paymentDate,
      now,
      // R2 (0046) : l'encaissement porte son auteur.
      staffUserId: getCurrentStaffUser(),
    });
    // Miroir APK (best-effort) : listes + détail de la facture réglée. Un
    // encaissement standalone est ventilé FIFO sur plusieurs factures : leur
    // détail (montant payé/reste) doit repartir aussi, pas seulement les listes.
    if (input.saleId != null) {
      enqueueSaleRefresh(input.saleId);
    } else {
      if (input.customerId != null) enqueueCustomerRefresh(input.customerId);
      for (const sid of allocatedSaleIds) enqueueInvoiceDetailRefresh(sid);
    }
    return { recorded: true, paymentId };
  });
  handle(IPC_CHANNELS["customers.statement"], V.idSchema, (input) =>
    Customers.getCustomerStatement(input.id),
  );
  handle(IPC_CHANNELS["customers.paymentReceipt"], V.idSchema, (input) =>
    Customers.getCustomerPaymentReceipt(input.id),
  );

  // Accès clients APK (V1 lecture seule, miroir ADR-053) : activation QR/PIN
  // (condensats côté main), révocation, état, file de synchro, annonces.
  // Le PIN transite en clair uniquement sur ce pont local chiffré (jamais
  // stocké ni loggé) ; le miroir ne reçoit que des condensats + clichés.
  handle(IPC_CHANNELS["customers.accessActivate"], V.clientAccessActivateSchema, (input) => {
    const result = ClientAccess.activateClientAccessAtomic({
      operationId: input.operationId,
      customerId: input.customerId,
      phone: input.phone,
      pin: input.pin,
      now: new Date().toISOString(),
    });
    // Le client se connecte en général aussitôt : sans poussée immédiate, le
    // miroir ignore la ligne jusqu'au prochain cycle (5 à 1440 min) et répond
    // « téléphone ou code incorrect » alors que le PIN est juste.
    void pushNowAtomic({ operationId: randomUUID(), now: new Date().toISOString() }).catch(
      () => undefined,
    );
    return result;
  });
  handle(IPC_CHANNELS["customers.accessRevoke"], V.idempotentIdSchema, (input) =>
    ClientAccess.revokeClientAccessAtomic({
      customerId: input.id,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["customers.accessStatus"], V.idSchema, (input) => ({
    status: ClientAccess.getClientAccessStatus(input.id),
  }));
  // QR d'activation scannable (ADR-054, V2 ADR-068) : lecture seule.
  // V2 universel : l'endpoint du magasin (URL + anon) est embarqué depuis la
  // config sync du POS — un seul build APK pour tous les magasins.
  // Sans endpoint configuré : erreur FR guidant vers Réglages → Miroir Android.
  handle(IPC_CHANNELS["customers.accessQrSvg"], V.clientAccessQrSchema, (input) => {
    const endpoint = getShopEndpoint();
    if (!endpoint) {
      throw new Error(
        "Miroir non configuré : renseignez l'URL + la clé anon (Réglages → Miroir Android).",
      );
    }
    const payload = ClientAccess.buildActivationQrPayloadV2(
      endpoint.supabaseUrl,
      endpoint.anonKey,
      input.phone,
      input.pin,
      input.code,
    );
    return { svg: ClientAccess.buildActivationQrSvg(payload), payload };
  });
  handle(IPC_CHANNELS["sync.enqueue"], V.syncEnqueueSchema, (input) =>
    ClientAccess.enqueueSnapshotAtomic({
      operationId: input.operationId,
      customerId: input.customerId,
      kind: input.kind,
      saleId: input.saleId ?? null,
      monthKey: input.monthKey ?? null,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["announcements.save"], V.announcementSaveSchema, (input) =>
    ClientAccess.saveAnnouncementAtomic({
      operationId: input.operationId,
      text: input.text,
      now: new Date().toISOString(),
    }),
  );
  // Q1 (UI annonce) : lecture de l'annonce courante — sans elle, le gérant
  // écrirait dans le vide. Lecture seule, même permission que l'écriture.
  handle(IPC_CHANNELS["announcements.get"], V.emptyPayloadSchema, () =>
    ClientAccess.getCurrentAnnouncement(),
  );
  // Poussée miroir : manuelle (bouton commerçant) + auto (timer 60 s).
  // Best-effort : un échec réseau rend une erreur FR, jamais de donnée perdue
  // (la file reste `pending` et sera rejouée).
  handle(IPC_CHANNELS["sync.pushNow"], V.syncPushNowSchema, (input) =>
    pushNowAtomic({ operationId: input.operationId, now: new Date().toISOString() }),
  );
  handle(IPC_CHANNELS["sync.getConfig"], V.emptyPayloadSchema, () => getSyncView());
  handle(IPC_CHANNELS["sync.saveOwnerAccount"], V.ownerAccountSaveSchema, (input) =>
    saveOwnerAccountAtomic({
      operationId: input.operationId,
      email: input.email,
      password: input.password,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["sync.saveConfig"], V.syncConfigSchema, (input) =>
    saveSyncConfigAtomic({
      config: {
        enabled: input.enabled,
        supabaseUrl: input.supabaseUrl,
        serviceKey: input.serviceKey,
        anonKey: input.anonKey,
        intervalMinutes: input.intervalMinutes,
      },
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
}
