// Veloria Owner — appels réseau purs (fetch injecté, aucun secret loggé).
// Contrat futur de l'Edge Function `owner-sync` : un POST authentifié par
// jeton Supabase Auth renvoie la liasse agrégée calculée par le POS.
import { OWNER_ANON_KEY, OWNER_SYNC_URL } from "./config.ts";
import type { OwnerSnapshot } from "./store.ts";

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
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
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

/**
 * Liasse agrégée — lecture PostgREST (RLS `authenticated`), jamais d'écriture.
 * La plus récente publication (`generated_at DESC`) est servie.
 */
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
  const url =
    `${baseUrl.replace(/\/+$/, "")}/rest/v1/owner_snapshots` +
    "?shop_key=eq.veloria&select=payload,generated_at&order=generated_at.desc&limit=1";
  let res: Awaited<ReturnType<FetchImpl>>;
  try {
    res = await withTimeout(
      (signal) =>
        fetchImpl(url, {
          method: "GET",
          headers: headers(anonKey, accessToken),
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
  const rows = (await res.json()) as { payload?: unknown; generated_at?: string }[] | null;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row.generated_at !== "string") {
    throw new OwnerError("SERVER_ERROR", "Aucune liasse de supervision publiée.");
  }
  return { snapshot: row.payload ?? null, generatedAt: row.generated_at };
}

/**
 * Garde de forme de la liasse : la liasse arrive du cloud PUIS est cachée
 * localement (`cache.ts`) et rendue telle quelle par cinq écrans. Une seule
 * valeur absente ou flottante (un `*Minor` non entier) tuait le rendu à CHAQUE
 * lancement — la barrière d'erreur ne fait que limiter la casse, la validation
 * est le vrai garde-fou. Elle vérifie donc ce que les écrans LISENT : présence
 * des blocs, tableaux qui sont des tableaux, montants en entiers sûrs.
 * Un nombre décimal (`sharePercent`, `quantity` en kg, `lateDays`) n'est PAS un
 * montant : il est contrôlé fini, pas entier (même distinction que le POS).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(o: Record<string, unknown>, key: string): boolean {
  return typeof o[key] === "string";
}

function strOrNull(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  return typeof v === "string" || v === null;
}

/** Centime DZD : entier sûr, jamais de flottant (règle 4 d'AGENTS.md). */
function minor(o: Record<string, unknown>, key: string): boolean {
  return Number.isSafeInteger(o[key]);
}

function minorOrNull(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  return Number.isSafeInteger(v) || v === null;
}

function count(o: Record<string, unknown>, key: string): boolean {
  return typeof o[key] === "number" && Number.isFinite(o[key]);
}

function countOrNull(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  return (typeof v === "number" && Number.isFinite(v)) || v === null;
}

function oneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

/** Un tableau dont CHAQUE ligne respecte `check` (une ligne vide est admissible). */
function rows(value: unknown, check: (row: Record<string, unknown>) => boolean): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((item) => isRecord(item) && check(item));
}

function isMethodTotal(v: unknown): boolean {
  return (
    isRecord(v) &&
    oneOf(v["method"], ["cash", "card", "credit"]) &&
    str(v, "label") &&
    minor(v, "count") &&
    minor(v, "totalMinor") &&
    count(v, "sharePercent")
  );
}

function isTransactionLine(v: unknown): boolean {
  return (
    isRecord(v) &&
    str(v, "name") &&
    count(v, "qty") &&
    minor(v, "unitMinor") &&
    minor(v, "totalMinor")
  );
}

/** Détail d'une opération : l'union discriminée que lit `TransactionDetail.tsx`. */
function isTransactionDetail(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const kind = v["kind"];
  if (kind === "sale") {
    const payment = v["payment"];
    return (
      str(v, "invoiceNumber") &&
      rows(v["lines"], isTransactionLine) &&
      minor(v, "subtotalMinor") &&
      minor(v, "discountMinor") &&
      minor(v, "totalMinor") &&
      isRecord(payment) &&
      str(payment, "label") &&
      minor(payment, "receivedMinor") &&
      minor(payment, "changeMinor") &&
      minor(payment, "creditMinor") &&
      str(v, "cashier") &&
      str(v, "session")
    );
  }
  if (kind === "return") {
    const refund = v["refund"];
    return (
      str(v, "originInvoice") &&
      rows(v["lines"], isTransactionLine) &&
      str(v, "reason") &&
      isRecord(refund) &&
      str(refund, "label") &&
      minor(refund, "amountMinor") &&
      minor(refund, "toDebtMinor") &&
      minor(v, "totalMinor") &&
      str(v, "operator")
    );
  }
  if (kind === "payment" || kind === "expense") {
    return (
      str(v, "label") &&
      str(v, "method") &&
      str(v, "reference") &&
      minor(v, "amountMinor") &&
      str(v, "operator") &&
      strOrNull(v, "note")
    );
  }
  return false;
}

function isJournalRow(v: unknown): boolean {
  return (
    isRecord(v) &&
    str(v, "id") &&
    str(v, "at") &&
    oneOf(v["kind"], ["sale", "return", "payment", "expense"]) &&
    str(v, "ref") &&
    str(v, "detail") &&
    minor(v, "amountMinor") &&
    isTransactionDetail(v["tx"])
  );
}

function isDayBlock(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const comparison = v["comparison"];
  return (
    str(v, "date") &&
    minor(v, "salesMinor") &&
    minor(v, "salesCount") &&
    minor(v, "returnsMinor") &&
    minor(v, "returnsCount") &&
    minor(v, "profitMinor") &&
    minor(v, "cashMinor") &&
    minor(v, "basketMinor") &&
    countOrNull(v, "ticketsDelta") &&
    minorOrNull(v, "objectiveMinor") &&
    isRecord(comparison) &&
    str(comparison, "previousLabel") &&
    count(comparison, "deltaPercent") &&
    rows(v["methods"], isMethodTotal) &&
    rows(v["journal"], isJournalRow)
  );
}

function isCashSession(v: unknown): boolean {
  if (v === null) return true;
  return (
    isRecord(v) &&
    str(v, "id") &&
    str(v, "label") &&
    str(v, "operator") &&
    str(v, "post") &&
    str(v, "openedAt") &&
    strOrNull(v, "closedAt") &&
    minorOrNull(v, "expectedMinor") &&
    minorOrNull(v, "countedMinor") &&
    minorOrNull(v, "varianceMinor") &&
    oneOf(v["status"], ["open", "closed"]) &&
    strOrNull(v, "note")
  );
}

function isExpenseRow(v: unknown): boolean {
  return (
    isRecord(v) &&
    str(v, "id") &&
    str(v, "at") &&
    str(v, "category") &&
    str(v, "label") &&
    minor(v, "amountMinor")
  );
}

function isDebtInvoice(v: unknown): boolean {
  return (
    isRecord(v) &&
    str(v, "ref") &&
    str(v, "issuedAt") &&
    str(v, "dueAt") &&
    minor(v, "totalMinor") &&
    minor(v, "depositMinor") &&
    minor(v, "remainingMinor") &&
    count(v, "lateDays")
  );
}

function isDebtor(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const aging = v["aging"];
  return (
    str(v, "id") &&
    str(v, "code") &&
    str(v, "name") &&
    str(v, "segment") &&
    strOrNull(v, "manager") &&
    str(v, "phone") &&
    minor(v, "totalMinor") &&
    minor(v, "overdueMinor") &&
    minorOrNull(v, "limitMinor") &&
    minorOrNull(v, "lastPaymentMinor") &&
    strOrNull(v, "lastPaymentAt") &&
    strOrNull(v, "lastPaymentNote") &&
    count(v, "lateDays") &&
    isRecord(aging) &&
    minor(aging, "d0to30Minor") &&
    minor(aging, "d31to60Minor") &&
    minor(aging, "d60plusMinor") &&
    rows(v["invoices"], isDebtInvoice)
  );
}

function isMoneyBlock(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const audit = v["audit"];
  const expenses = v["expenses"];
  const debts = v["debts"];
  return (
    isRecord(audit) &&
    minor(audit, "fundsMinor") &&
    minor(audit, "varianceNetMinor") &&
    count(audit, "conformityPercent") &&
    minor(audit, "activeRegisters") &&
    isCashSession(v["activeSession"]) &&
    rows(v["sessions"], isCashSession) &&
    isRecord(expenses) &&
    str(expenses, "monthLabel") &&
    minor(expenses, "totalMinor") &&
    minor(expenses, "count") &&
    rows(expenses["rows"], isExpenseRow) &&
    isRecord(debts) &&
    minor(debts, "totalMinor") &&
    minor(debts, "overdueMinor") &&
    minor(debts, "count") &&
    rows(debts["rows"], isDebtor)
  );
}

function isStockMovement(v: unknown): boolean {
  return (
    isRecord(v) &&
    str(v, "id") &&
    str(v, "at") &&
    oneOf(v["kind"], ["vente", "retour", "inventaire", "reception"]) &&
    str(v, "ref") &&
    strOrNull(v, "note") &&
    strOrNull(v, "badge") &&
    count(v, "qty") &&
    count(v, "balance")
  );
}

function isProduct(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const unit = v["unit"];
  return (
    str(v, "id") &&
    str(v, "ref") &&
    strOrNull(v, "ean") &&
    str(v, "name") &&
    str(v, "subtitle") &&
    isRecord(unit) &&
    str(unit, "singular") &&
    str(unit, "plural") &&
    count(v, "quantity") &&
    count(v, "minLevel") &&
    minor(v, "valueMinor") &&
    minor(v, "purchaseUnitMinor") &&
    minor(v, "saleUnitMinor") &&
    minor(v, "marginUnitMinor") &&
    count(v, "marginPercent") &&
    count(v, "sold30") &&
    count(v, "perDay") &&
    count(v, "autonomyDays") &&
    count(v, "suggestedRestock") &&
    strOrNull(v, "lastInventoryAt") &&
    rows(v["movements"], isStockMovement)
  );
}

function isStockBlock(v: unknown): boolean {
  return (
    isRecord(v) &&
    minor(v, "valueMinor") &&
    minor(v, "references") &&
    minor(v, "lowCount") &&
    minor(v, "outCount") &&
    minor(v, "deadCount") &&
    strOrNull(v, "lastInventoryAt") &&
    rows(v["products"], isProduct)
  );
}

function isPeriodBlock(v: unknown): boolean {
  return (
    isRecord(v) &&
    minor(v, "totalMinor") &&
    minor(v, "tickets") &&
    minor(v, "basketMinor") &&
    minor(v, "marginTotalMinor") &&
    count(v, "marginPercent") &&
    rows(v["days"], (d) => isRecord(d) && str(d, "date") && minor(d, "totalMinor")) &&
    rows(
      v["categories"],
      (c) =>
        isRecord(c) &&
        str(c, "name") &&
        minor(c, "salesMinor") &&
        minor(c, "profitMinor") &&
        count(c, "sharePercent") &&
        count(c, "marginPercent"),
    ) &&
    rows(
      v["top"],
      (t) => isRecord(t) && str(t, "name") && count(t, "qty") && minor(t, "totalMinor"),
    )
  );
}

function isAlertsBlock(v: unknown): boolean {
  return (
    isRecord(v) &&
    minor(v, "critical") &&
    minor(v, "watch") &&
    minor(v, "ok") &&
    str(v, "anomaliesTitle") &&
    str(v, "anomaliesDetail") &&
    rows(
      v["stock"],
      (s) =>
        isRecord(s) &&
        str(s, "id") &&
        str(s, "productId") &&
        str(s, "name") &&
        str(s, "ref") &&
        oneOf(s["severity"], ["critical", "watch"]) &&
        str(s, "headline") &&
        str(s, "detail") &&
        minorOrNull(s, "lossPerDayMinor"),
    ) &&
    rows(
      v["debts"],
      (d) =>
        isRecord(d) &&
        str(d, "debtorId") &&
        str(d, "name") &&
        str(d, "ref") &&
        count(d, "lateDays") &&
        minor(d, "remainingMinor"),
    ) &&
    rows(
      v["system"],
      (s) =>
        isRecord(s) &&
        str(s, "id") &&
        str(s, "label") &&
        str(s, "detail") &&
        strOrNull(s, "at") &&
        oneOf(s["state"], ["ok", "watch", "critical"]),
    )
  );
}

/**
 * Validation structurale complète de la liasse (voir le commentaire ci-dessus).
 * Garde de type : l'appelant n'a plus besoin d'assertion (`as OwnerSnapshot`),
 * et un refus signifie « on garde la liasse précédente, on n'affiche rien ».
 */
export function isSnapshotShape(value: unknown): value is OwnerSnapshot {
  if (!isRecord(value)) return false;
  return (
    value["version"] === 1 &&
    str(value, "shopName") &&
    str(value, "generatedAt") &&
    isDayBlock(value["day"]) &&
    isMoneyBlock(value["money"]) &&
    isStockBlock(value["stock"]) &&
    isPeriodBlock(value["periods"]) &&
    isAlertsBlock(value["alerts"])
  );
}
