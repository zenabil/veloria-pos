// Veloria PoS - IPC: catalogue publié dans l'application client (ADR-182).
//
// L'écran « Produits publiés dans l'application » vit côté POS ; la publication
// elle-même est un envoi réseau (service de synchronisation), pas une écriture
// métier : les prix, les noms et la disponibilité sont RELUS en base à chaque
// publication (le renderer ne fait jamais foi).

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as ClientCatalog from "./handlers/client-catalog.repo";
import { getClientActivityStats } from "../sync/sync.service";
import { publishCatalogAtomic } from "../sync/sync.service";
import { handle } from "./handle";

export function registerClientCatalogChannels(): void {
  // Réglages de publication (lecture — l'écran Paramètres).
  handle(IPC_CHANNELS["clientCatalog.getSettings"], V.emptyPayloadSchema, () =>
    ClientCatalog.getCatalogSettings(),
  );
  // Aperçu : ce que l'application client verra réellement (lecture).
  handle(IPC_CHANNELS["clientCatalog.preview"], V.emptyPayloadSchema, () =>
    ClientCatalog.listCatalogPreview(),
  );
  // Sauvegarde des réglages (mutation idempotente par `operationId`).
  handle(IPC_CHANNELS["clientCatalog.saveSettings"], V.clientCatalogSettingsSaveSchema, (input) =>
    ClientCatalog.saveCatalogSettingsAtomic({
      enabled: input.enabled,
      excludedCategoryIds: input.excludedCategoryIds,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  // Publication vers le miroir (upsert `store_catalog` + version).
  handle(IPC_CHANNELS["sync.publishCatalog"], V.clientCatalogPublishSchema, (input) =>
    publishCatalogAtomic({ operationId: input.operationId, now: new Date().toISOString() }),
  );
  // ADR-182 tranche E : usage de l'application (lecture, best-effort).
  handle(IPC_CHANNELS["sync.getClientActivity"], V.emptyPayloadSchema, () =>
    getClientActivityStats(),
  );
}
