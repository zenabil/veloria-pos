// Veloria Client (APK) — Appel `client-sync` (pur, fetch injecté).
// Un seul aller-retour : {phone, pin} → clichés. Les secrets restent en
// SecureStore côté APK (jamais loggés ici) ; les codes d'erreur sont stables
// pour le mappage ar/fr (voir i18n : loginError/lockedError/revokedError).
// Repli de configuration : voir src/config.ts (EXPO_PUBLIC_SYNC_URL/ANON_KEY).
import { ANON_KEY, SYNC_URL } from "./config.ts";

export type SyncErrorCode =
  | "AUTH_ERROR"
  | "LOCKED_ERROR"
  | "REVOKED_ERROR"
  | "OFFLINE_ERROR"
  | "NOT_FOUND_ERROR"
  | "SERVER_ERROR";

export class SyncError extends Error {
  readonly code: SyncErrorCode;
  constructor(code: SyncErrorCode, message: string) {
    super(message);
    this.name = "SyncError";
    this.code = code;
  }
}

export interface SyncPayloads {
  snapshot: unknown;
  invoices: unknown;
  payments: unknown;
  /** ADR-182 : catalogue du magasin (table `store_catalog`). */
  catalog?: unknown;
  /** ADR-182 : empreinte du catalogue — l'APK ne recharge que si elle change. */
  catalogVersion?: string | null;
  /** ADR-182 : date de publication du catalogue. */
  catalogPublishedAt?: string | null;
  syncedAt: string;
}

type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

/** En-têtes `client-sync` : Supabase (verify_jwt) exige `Authorization`. */
function syncHeaders(anonKey: string): Record<string, string> {
  return {
    apikey: anonKey,
    // Miroirs locaux : en-tête ignoré côté serveur (ils ne lisent que le corps).
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };
}

/** Valide la forme locale avant tout réseau (même règle que le POS). */
export function assertCredentials(phone: string, pin: string): void {
  if (phone.trim().length < 1 || phone.trim().length > 30 || !/^[0-9]{6}$/.test(pin)) {
    throw new SyncError("AUTH_ERROR", "Téléphone ou code incorrect.");
  }
}

export async function syncNow(
  baseUrl: string = SYNC_URL,
  anonKey: string = ANON_KEY,
  phone: string,
  pin: string,
  fetchImpl: FetchImpl,
  timeoutMs = 10_000,
): Promise<SyncPayloads> {
  assertCredentials(phone, pin);
  const url = `${baseUrl.replace(/\/+$/, "")}/functions/v1/client-sync`;
  let res: {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  };
  try {
    const controller = new AbortController();
    let onTimeout = (_err: Error): void => {};
    const timeout = new Promise<never>((_, reject) => {
      onTimeout = reject;
    });
    const timerId = setTimeout(() => {
      // Annulation réelle : sans AbortController la requête continue après le
      // timeout. On annule PUIS on rejette (mappage OFFLINE_ERROR inchangé).
      controller.abort();
      onTimeout(new Error("timeout"));
    }, timeoutMs);
    try {
      res = await Promise.race([
        fetchImpl(url, {
          method: "POST",
          headers: syncHeaders(anonKey),
          body: JSON.stringify({ phone: phone.trim(), pin }),
          signal: controller.signal,
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timerId);
    }
  } catch {
    throw new SyncError("OFFLINE_ERROR", "Magasin hors ligne.");
  }
  if (!res.ok) {
    let code: SyncErrorCode = "SERVER_ERROR";
    try {
      const err = (await res.json()) as { code?: string };
      if (
        err.code === "AUTH_ERROR" ||
        err.code === "LOCKED_ERROR" ||
        err.code === "REVOKED_ERROR"
      ) {
        code = err.code;
      } else if (err.code === "NOT_FOUND") {
        code = "NOT_FOUND_ERROR";
      }
    } catch {
      /* corps illisible : SERVER_ERROR */
    }
    const messages: Record<SyncErrorCode, string> = {
      AUTH_ERROR: "Téléphone ou code incorrect.",
      LOCKED_ERROR: "Compte verrouillé 5 minutes (5 échecs).",
      REVOKED_ERROR: "Accès coupé. Contactez votre magasin.",
      OFFLINE_ERROR: "Magasin hors ligne.",
      NOT_FOUND_ERROR: "Facture indisponible.",
      SERVER_ERROR: "Échec de la synchronisation.",
    };
    throw new SyncError(code, messages[code]);
  }
  const data = (await res.json()) as { ok?: boolean; data?: SyncPayloads } | null;
  if (!data || data.ok !== true || !data.data || typeof data.data.syncedAt !== "string") {
    throw new SyncError("SERVER_ERROR", "Réponse inattendue du miroir.");
  }
  return data.data;
}

export interface DetailPayloads {
  detail: unknown;
  syncedAt: string;
}

/**
 * Détail d'une facture à la demande (même endpoint, `saleId` en plus).
 * Le POS pousse les clichés `invoice_detail` ; le miroir renvoie le dernier
 * correspondant à la vente, sinon NOT_FOUND (demander au commerçant de
 * synchroniser). Lecture seule, timeout 10 s comme `syncNow`.
 */
export async function fetchInvoiceDetail(
  baseUrl: string = SYNC_URL,
  anonKey: string = ANON_KEY,
  phone: string,
  pin: string,
  saleId: number,
  fetchImpl: FetchImpl,
  timeoutMs = 10_000,
): Promise<DetailPayloads> {
  assertCredentials(phone, pin);
  if (!Number.isInteger(saleId) || saleId <= 0) {
    throw new SyncError("NOT_FOUND_ERROR", "Facture indisponible.");
  }
  const url = `${baseUrl.replace(/\/+$/, "")}/functions/v1/client-sync`;
  let res: {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  };
  try {
    const controller = new AbortController();
    let onTimeout = (_err: Error): void => {};
    const timeout = new Promise<never>((_, reject) => {
      onTimeout = reject;
    });
    const timerId = setTimeout(() => {
      // Idem syncNow : annulation réelle + rejet → OFFLINE_ERROR stable.
      controller.abort();
      onTimeout(new Error("timeout"));
    }, timeoutMs);
    try {
      res = await Promise.race([
        fetchImpl(url, {
          method: "POST",
          headers: syncHeaders(anonKey),
          body: JSON.stringify({ phone: phone.trim(), pin, saleId }),
          signal: controller.signal,
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timerId);
    }
  } catch {
    throw new SyncError("OFFLINE_ERROR", "Magasin hors ligne.");
  }
  if (!res.ok) {
    let code: SyncErrorCode = "SERVER_ERROR";
    try {
      const err = (await res.json()) as { code?: string };
      if (
        err.code === "AUTH_ERROR" ||
        err.code === "LOCKED_ERROR" ||
        err.code === "REVOKED_ERROR"
      ) {
        code = err.code;
      } else if (err.code === "NOT_FOUND") {
        code = "NOT_FOUND_ERROR";
      }
    } catch {
      /* corps illisible : SERVER_ERROR */
    }
    const messages: Record<SyncErrorCode, string> = {
      AUTH_ERROR: "Téléphone ou code incorrect.",
      LOCKED_ERROR: "Compte verrouillé 5 minutes (5 échecs).",
      REVOKED_ERROR: "Accès coupé. Contactez votre magasin.",
      OFFLINE_ERROR: "Magasin hors ligne.",
      NOT_FOUND_ERROR: "Facture indisponible.",
      SERVER_ERROR: "Échec de la synchronisation.",
    };
    throw new SyncError(code, messages[code]);
  }
  const data = (await res.json()) as { ok?: boolean; data?: DetailPayloads } | null;
  if (!data || data.ok !== true || !data.data || typeof data.data.syncedAt !== "string") {
    throw new SyncError("SERVER_ERROR", "Réponse inattendue du miroir.");
  }
  return data.data;
}
