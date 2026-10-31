// Veloria Owner — appels réseau purs (fetch injecté, aucun secret loggé).
// Contrat futur de l'Edge Function `owner-sync` : un POST authentifié par
// jeton Supabase Auth renvoie la liasse agrégée calculée par le POS.
import { OWNER_ANON_KEY, OWNER_SYNC_URL } from "./config.ts";

export type OwnerErrorCode = "AUTH_ERROR" | "UNAUTHORIZED" | "OFFLINE_ERROR" | "SERVER_ERROR";

export class OwnerError extends Error {
  readonly code: OwnerErrorCode;
  constructor(code: OwnerErrorCode, message: string) {
    super(message);
    this.name = "OwnerError";
    this.code = code;
  }
}

const MESSAGES: Record<OwnerErrorCode, string> = {
  AUTH_ERROR: "Adresse e-mail ou mot de passe incorrect.",
  UNAUTHORIZED: "Session expirée. Veuillez vous réauthentifier.",
  OFFLINE_ERROR: "Serveur injoignable. Vérifiez votre connexion.",
  SERVER_ERROR: "Échec de la récupération des données.",
};

type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validation locale avant tout réseau (messages français). */
export function assertLoginFields(email: string, password: string): void {
  if (!EMAIL_RE.test(email.trim())) {
    throw new OwnerError("AUTH_ERROR", "Adresse e-mail invalide.");
  }
  if (password.length < 8) {
    throw new OwnerError("AUTH_ERROR", "Le mot de passe doit contenir au moins 8 caractères.");
  }
}

function headers(anonKey: string, token: string): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let rejectTimeout: (err: Error) => void = () => undefined;
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectTimeout(new Error("timeout"));
  }, timeoutMs);
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface AuthResult {
  accessToken: string;
  expiresAt: string | null;
}

/** Connexion Supabase Auth (grant_type=password). */
export async function signInWithPassword(
  email: string,
  password: string,
  fetchImpl: FetchImpl,
  baseUrl: string = OWNER_SYNC_URL,
  anonKey: string = OWNER_ANON_KEY,
  timeoutMs = 12_000,
): Promise<AuthResult> {
  assertLoginFields(email, password);
  const url = `${baseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`;
  let res: Awaited<ReturnType<FetchImpl>>;
  try {
    res = await withTimeout(
      (signal) =>
        fetchImpl(url, {
          method: "POST",
          headers: headers(anonKey, anonKey),
          body: JSON.stringify({ email: email.trim(), password }),
          signal,
        }),
      timeoutMs,
    );
  } catch {
    throw new OwnerError("OFFLINE_ERROR", MESSAGES.OFFLINE_ERROR);
  }
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      throw new OwnerError("AUTH_ERROR", MESSAGES.AUTH_ERROR);
    }
    if (res.status === 429) {
      throw new OwnerError("AUTH_ERROR", "Trop de tentatives. Réessayez dans quelques minutes.");
    }
    throw new OwnerError("SERVER_ERROR", MESSAGES.SERVER_ERROR);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_at?: number;
  } | null;
  if (!data?.access_token) {
    throw new OwnerError("SERVER_ERROR", "Réponse d'authentification inattendue.");
  }
  return {
    accessToken: data.access_token,
    expiresAt:
      typeof data.expires_at === "number" ? new Date(data.expires_at * 1000).toISOString() : null,
  };
}

export interface SnapshotResult {
  snapshot: unknown;
  generatedAt: string;
}

/** Liasse agrégée — lecture seule, jamais d'écriture. */
export async function fetchOwnerSnapshot(
  accessToken: string,
  fetchImpl: FetchImpl,
  baseUrl: string = OWNER_SYNC_URL,
  anonKey: string = OWNER_ANON_KEY,
  timeoutMs = 12_000,
): Promise<SnapshotResult> {
  if (accessToken.trim() === "") {
    throw new OwnerError("UNAUTHORIZED", MESSAGES.UNAUTHORIZED);
  }
  const url = `${baseUrl.replace(/\/+$/, "")}/functions/v1/owner-sync`;
  let res: Awaited<ReturnType<FetchImpl>>;
  try {
    res = await withTimeout(
      (signal) =>
        fetchImpl(url, {
          method: "POST",
          headers: headers(anonKey, accessToken),
          body: "{}",
          signal,
        }),
      timeoutMs,
    );
  } catch {
    throw new OwnerError("OFFLINE_ERROR", MESSAGES.OFFLINE_ERROR);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new OwnerError("UNAUTHORIZED", MESSAGES.UNAUTHORIZED);
    }
    throw new OwnerError("SERVER_ERROR", MESSAGES.SERVER_ERROR);
  }
  const data = (await res.json()) as {
    ok?: boolean;
    data?: { snapshot?: unknown; generatedAt?: string };
  } | null;
  if (!data || data.ok !== true || !data.data || typeof data.data.generatedAt !== "string") {
    throw new OwnerError("SERVER_ERROR", "Réponse inattendue du service de supervision.");
  }
  return { snapshot: data.data.snapshot, generatedAt: data.data.generatedAt };
}

/** Garde de forme minimale : une liasse sans jour ni stock est inutilisable. */
export function isSnapshotShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  const day = o["day"] as Record<string, unknown> | undefined;
  const stock = o["stock"] as Record<string, unknown> | undefined;
  const money = o["money"] as Record<string, unknown> | undefined;
  return (
    typeof o["shopName"] === "string" &&
    typeof o["generatedAt"] === "string" &&
    typeof day?.["salesMinor"] === "number" &&
    typeof stock?.["valueMinor"] === "number" &&
    typeof money?.["debts"] === "object"
  );
}
