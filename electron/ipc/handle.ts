// Veloria PoS - IPC: enveloppe handle() (extrait de registry.ts, deplacement pur).
// Guards licence + validation Zod + operationId + credit-gates + reponse ok/FR.

import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import * as V from "./validators";
import { log } from "../services/logger";
import { prodLicenseDeps } from "../licensing/prod-deps";
import {
  requireLicensedFeature,
  requireLicensedMutation,
  requireLicensedPage,
} from "../licensing/license-service";
import {
  DEBT_PAYMENT_CHANNELS,
  FEATURE_GATED_CHANNELS,
  LICENSE_PROTECTED_CHANNELS,
  PAGE_GATED_CHANNELS,
} from "./license-gates";
import { ok, toUserMessage } from "./ipc-errors";
import { enforceCreditGates } from "./credit-gates";

export function handle<TInput>(
  channel: string,
  schema: { parse(v: unknown): TInput } | null,
  fn: (input: TInput) => unknown,
): void {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    // M-2 CLARITY: this is a LOG-CORRELATION id per IPC request, never a
    // business operationId �?" business idempotency always uses the
    // caller-owned `input.operationId` (see handlers). Named distinctly so no
    // future handler mistakes it for retry identity.
    const requestId = randomUUID();
    const started = Date.now();
    try {
      const deps = prodLicenseDeps();
      // Garde licence (main uniquement) : les canaux protégés exigent une
      // licence active. Dev non packagé : journalisé, non bloquant.
      if (LICENSE_PROTECTED_CHANNELS.has(channel)) {
        requireLicensedMutation(deps);
      }
      // Capabilities : pages d'abord (routage/filtrage), puis features.
      // Au moins une page de la liste suffit (ex. breadOrders OU pain).
      const pages = PAGE_GATED_CHANNELS[channel];
      if (pages) {
        let allowed = false;
        let lastErr: unknown = null;
        for (const page of pages) {
          try {
            requireLicensedPage(deps, page);
            allowed = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!allowed)
          throw lastErr instanceof Error
            ? lastErr
            : new Error("Fonction non disponible dans votre licence. Contactez votre fournisseur.");
      }
      const feature = FEATURE_GATED_CHANNELS[channel];
      if (feature) {
        requireLicensedFeature(deps, feature);
      }
      if (DEBT_PAYMENT_CHANNELS.has(channel)) {
        requireLicensedFeature(deps, "debt-management");
      }
      const input = schema ? schema.parse(raw ?? {}) : (raw as TInput);
      // P1-6 : couche centrale �?" tout schéma qui EXIGE operationId le reçoit
      // du client, sinon refus FR explicite (jamais de génération main).
      if (V.schemaRequiresOperationId(schema)) {
        const op = (input as { operationId?: unknown }).operationId;
        if (typeof op !== "string" || op.trim().length === 0) {
          throw new Error("Opération non identifiée : veuillez réessayer l'action.");
        }
      }
      enforceCreditGates(channel, input, deps);
      const data = await fn(input);
      return ok(data);
    } catch (err) {
      log("ERROR", "ipc", "handler.failed", {
        channel,
        operation_id: requestId,
        duration_ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
      const user = toUserMessage(err);
      return { ok: false, ...user };
    }
  });
}
