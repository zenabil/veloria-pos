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
import { enforceStaffGates } from "./staff-gates";
import { getCurrentStaffUser, touchStaffSession } from "./handlers/staff-session";
import { mustChangeCode } from "./handlers/staff.repo";
import { IPC_CHANNELS } from "./channels";

/**
 * Canaux autorisés malgré un code à changer (0041 must_change_code = 1) :
 * le changement lui-même, la lecture de session et la sortie. Toute autre
 * action (y compris via IPC direct, sans passer par App.tsx) est refusée
 * jusqu'au changement — verrou main, pas seulement visuel.
 */
const MUST_CHANGE_ALLOWLIST = new Set<string>([
  IPC_CHANNELS["staff.changeCode"],
  IPC_CHANNELS["staff.session"],
  IPC_CHANNELS["staff.logout"],
]);

export function handle<TInput>(
  channel: string,
  schema: { parse(v: unknown): TInput } | null,
  fn: (input: TInput) => unknown,
): void {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    // M-2 CLARITY: this is a LOG-CORRELATION id per IPC request, never a
    // business operationId — business idempotency always uses the
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
      // Au moins une page de la liste suffit (ex. templates = settings OU invoices).
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
      // P1-6 : couche centrale — tout schéma qui EXIGE operationId le reçoit
      // du client, sinon refus FR explicite (jamais de génération main).
      if (V.schemaRequiresOperationId(schema)) {
        const op = (input as { operationId?: unknown }).operationId;
        if (typeof op !== "string" || op.trim().length === 0) {
          throw new Error("Opération non identifiée : veuillez réessayer l'action.");
        }
      }
      enforceCreditGates(channel, input, deps);
      enforceStaffGates(channel, input);
      // R2 RADICAL : session expirante (30 min d'inactivité) + verrou
      // must_change_code côté main (l'UI seule ne suffit pas).
      touchStaffSession();
      const sessionId = getCurrentStaffUser();
      if (sessionId != null && !MUST_CHANGE_ALLOWLIST.has(channel) && mustChangeCode(sessionId)) {
        throw new Error("Veuillez d'abord changer votre code d'accès.");
      }
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
