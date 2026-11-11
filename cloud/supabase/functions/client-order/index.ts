// Veloria PoS — Edge Function `client-order` (ADR-182, tranche F).
//
// ECRITURE depuis l'application client : c'est la PREMIERE fois que le
// téléphone écrit dans le miroir. Il n'écrit qu'une INTENTION (une demande) :
// le POS la transforme en commande (`client_orders`, SQLite = master) et
// seule la VENTE porte un montant réel.
//
// Sécurité :
//   - authentification IDENTIQUE à `client-sync` (telephone + PIN, PBKDF2
//     100 000 itérations, sel par ligne, comparaison en temps constant,
//     verrou 5 échecs / 5 minutes) — une seule implémentation de la règle,
//     jamais deux ;
//   - la clé `service_role` reste côté serveur : elle ne part JAMAIS dans le
//     téléphone ;
//   - `anon`/`authenticated` n'ont aucun droit sur `order_intents` (RLS).
//
// Idempotence : l'APK envoie un `operationId` (UUID) ; la table a un UNIQUE
// sur `operation_id` ⇒ un rejeu (réseau instable, double-clic) ne crée
// jamais une seconde intention.
//
// Secrets : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (jamais dans l'APK).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

type Json = Record<string, unknown>;

const PIN_KDF_ITERATIONS = 100_000;
const PIN_KDF_KEYLEN_BITS = 256;
const MAX_FAILED = 5;
const LOCK_MS = 5 * 60_000;

function sha256Hex(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

/** Comparaison en temps constant (identique à `client-sync`). */
function constantTimeEquals(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error("bad salt");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2PinHex(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: PIN_KDF_ITERATIONS, hash: "SHA-256" },
    key,
    PIN_KDF_KEYLEN_BITS,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, Content-Type, Prefer",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function fail(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface IntentLine {
  productId: number;
  quantity: number;
  unitCode: string;
}

/** Validation des lignes demandees (mêmes bornes que le POS). */
function parseLines(raw: unknown): IntentLine[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return null;
  const out: IntentLine[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    const productId = Number(r["productId"]);
    const quantity = Number(r["quantity"]);
    const unitCode = typeof r["unitCode"] === "string" ? r["unitCode"].slice(0, 24) : "PIECE";
    if (!Number.isInteger(productId) || productId <= 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return null;
    out.push({ productId, quantity, unitCode: unitCode === "" ? "PIECE" : unitCode });
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS sur TOUTES les réponses (succès ET erreurs : le code d'erreur est
  // lu par l'application).
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return fail("METHOD_ERROR", "Méthode invalide.", 405);

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return fail("VALIDATION_ERROR", "Requête illisible.", 400);
  }

  const phone = typeof body["phone"] === "string" ? body["phone"].trim() : "";
  const pin = typeof body["pin"] === "string" ? body["pin"] : "";
  const operationId = typeof body["operationId"] === "string" ? body["operationId"].trim() : "";
  const note = typeof body["note"] === "string" ? body["note"].slice(0, 300) : "";
  const totalMinor = Number(body["totalMinor"] ?? 0);

  if (!/^[0-9a-fA-F-]{36}$/.test(operationId)) {
    return fail("VALIDATION_ERROR", "Identifiant d'opération invalide.", 400);
  }
  if (!Number.isFinite(totalMinor) || totalMinor < 0 || totalMinor > 100_000_000_000) {
    return fail("VALIDATION_ERROR", "Total de commande invalide.", 400);
  }
  const lines = parseLines(body["lines"]);
  if (lines === null) return fail("VALIDATION_ERROR", "Lignes de commande invalides.", 400);
  if (phone.length < 1 || phone.length > 30 || !/^[0-9]{6}$/.test(pin)) {
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("client-order: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absent");
    return fail("SERVER_ERROR", "Service de commande indisponible.", 500);
  }
  const supa = createClient(supabaseUrl, serviceKey);

  // --- Authentification (identique à `client-sync`) -----------------------
  const phoneHash = await sha256Hex(phone);
  const { data: matches, error: lookupError } = await supa
    .from("client_access")
    .select("customer_id, pin_hash, pin_salt, revoked_at, locked_until, failed_attempts")
    .eq("phone_hash", phoneHash)
    .order("revoked_at", { ascending: true, nullsFirst: true })
    .limit(2);
  if (lookupError) {
    console.error("client-order: lecture client_access impossible", lookupError.code);
    return fail("SERVER_ERROR", "Service de commande indisponible.", 500);
  }
  const foundRows = matches ?? [];
  const actives = foundRows.filter((r) => r.revoked_at == null);
  if (actives.length > 1) {
    console.error("client-order: phone_hash ambigu -> echec ferme");
    return fail("SERVER_ERROR", "Service de commande indisponible.", 500);
  }
  const access = actives[0] ?? null;
  if (!access) {
    if (foundRows.length > 0)
      return fail("REVOKED_ERROR", "Accès coupé. Contactez votre magasin.", 403);
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }
  const now = new Date();
  if (typeof access.locked_until === "string" && Date.parse(access.locked_until) > now.getTime()) {
    return fail("LOCKED_ERROR", "Compte verrouillé 5 minutes (5 échecs).", 429);
  }
  const rowSalt =
    typeof access.pin_salt === "string" && access.pin_salt.length > 0 ? access.pin_salt : null;
  let expectedHash: string;
  try {
    expectedHash = rowSalt ? await pbkdf2PinHex(pin, rowSalt) : await sha256Hex(pin);
  } catch {
    console.error("client-order: sel PIN illisible");
    return fail("SERVER_ERROR", "Service de commande indisponible.", 500);
  }
  if (!constantTimeEquals(expectedHash, access.pin_hash)) {
    // Verrou : on compte l'échec (même machine d'état que `client-sync`).
    const lockExpired =
      typeof access.locked_until === "string" && Date.parse(access.locked_until) <= now.getTime();
    const base = lockExpired ? 0 : (access.failed_attempts ?? 0);
    const attempts = base + 1;
    const lockedUntil =
      attempts >= MAX_FAILED ? new Date(now.getTime() + LOCK_MS).toISOString() : null;
    await supa
      .from("client_access")
      .update({ failed_attempts: attempts, locked_until: lockedUntil })
      .eq("customer_id", access.customer_id);
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }
  // Réussite : le compteur d'échecs repart à zéro.
  await supa
    .from("client_access")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("customer_id", access.customer_id);

  // --- Écriture de l'INTENTION (jamais une commande) ----------------------
  const { error: insertError } = await supa.from("order_intents").insert({
    operation_id: operationId,
    customer_id: access.customer_id,
    lines,
    total_minor: Math.round(totalMinor),
    note: note === "" ? null : note,
    status: "pending",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (insertError) {
    // 23505 = clé en double = rejeu du même `operationId` : ce n'est PAS une
    // erreur (le client a déjà envoyé cette commande).
    if (insertError.code === "23505") {
      return new Response(JSON.stringify({ ok: true, data: { accepted: true, duplicate: true } }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    console.error("client-order: ecriture impossible", insertError.code);
    return fail("SERVER_ERROR", "Commande impossible à enregistrer.", 500);
  }

  // Compteur d'usage : une commande est un usage de l'application (tranche E).
  try {
    await supa.from("client_activity").insert({
      customer_id: access.customer_id,
      kind: "order",
      at: now.toISOString(),
    });
  } catch {
    console.error("client-order: compteur d'usage non ecrit");
  }

  return new Response(
    JSON.stringify({
      ok: true,
      data: { accepted: true, duplicate: false, sentAt: now.toISOString() },
    }),
    { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
  );
});
