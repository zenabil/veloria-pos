// HARNESS E2E LOCAL — Relais miroir (remplace Supabase, données de test).
// Reproduit EXACTEMENT le contrat consommé par le POS et l'APK :
//  - POST /rest/v1/client_access?on_conflict=customer_id (upsert)
//  - POST /rest/v1/client_payloads?on_conflict=operation_id (insert, doublons ignorés)
//  - POST /functions/v1/client-sync (logique de la fonction Edge : condensats
//    SHA-256, verrou 5 échecs/5 min, derniers clichés + détail par saleId)
// AUCUNE donnée réelle : ce relais ne sert qu'aux essais E2E en boucle locale.
// Usage : node scripts/e2e-mirror-relay.mjs [port=8100]
import { createHash, pbkdf2Sync } from "node:crypto";
import http from "node:http";

const PORT = Number(process.argv[2] ?? 8100);
const MAX_FAILED = 5;
const LOCK_MS = 5 * 60_000;
// PARITÉ STRICTE avec la fonction Edge (`cloud/supabase/functions/client-sync`) :
// même borne de balayage du détail à la demande, sinon l'E2E passerait là où la
// production répondrait 404 (voir DETAIL_SCAN_LIMIT côté Edge).
const DETAIL_SCAN_LIMIT = 50;

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// #39 : dérivation PIN lente — MIROIR du domaine
// (`src/domain/customer/client-access.ts`, PIN_KDF_*) : mêmes paramètres que
// l'écriture POS et la fonction Edge (tout écart = test contrat rouge).
const PIN_KDF_ITERATIONS = 100_000;
const PIN_KDF_KEYLEN_BYTES = 32;
const pbkdf2PinHex = (pin, saltHex) =>
  pbkdf2Sync(
    pin,
    Buffer.from(saltHex, "hex"),
    PIN_KDF_ITERATIONS,
    PIN_KDF_KEYLEN_BYTES,
    "sha256",
  ).toString("hex");
const verifyPin = (pin, row) => {
  if (typeof row.pin_salt === "string" && row.pin_salt.length > 0) {
    try {
      return pbkdf2PinHex(pin, row.pin_salt) === row.pin_hash;
    } catch {
      return false;
    }
  }
  return sha256(pin) === row.pin_hash;
};

/** customer_id -> access row */
const access = new Map();
/** operation_id -> payload row */
const payloads = new Map();

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "apikey, authorization, Content-Type, Prefer",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        reject(e);
      }
    });
  });
}

function fail(code, message, status) {
  return { status, body: { ok: false, code, message } };
}

async function handleSync(body) {
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";
  // Même contrat que l'Edge : `saleId` fourni mais invalide = VALIDATION_ERROR
  // (le laisser tomber en `null` répondrait 200 sans `detail`, puis NOT_FOUND
  // mensonger côté APK). Absent/null = requête de snapshot.
  const rawSaleId = body?.saleId;
  let saleId = null;
  if (rawSaleId !== undefined && rawSaleId !== null) {
    if (typeof rawSaleId !== "number" || !Number.isInteger(rawSaleId) || rawSaleId <= 0) {
      return fail("VALIDATION_ERROR", "Identifiant de facture invalide.", 400);
    }
    saleId = rawSaleId;
  }
  if (phone.length < 1 || phone.length > 30 || !/^[0-9]{6}$/.test(pin)) {
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }
  // Miroir EXACT de la lecture Edge : actives d'abord (migration 0034 : au
  // plus UNE ligne active par condensat, les révoquées historiques restent),
  // 2 lignes consultées, plus d'une ACTIVE = incohérence → échec fermé.
  const candidates = [...access.values()].filter((a) => a.phone_hash === sha256(phone));
  candidates.sort((a, b) => (a.revoked_at == null ? 0 : 1) - (b.revoked_at == null ? 0 : 1));
  const seen = candidates.slice(0, 2);
  const actives = seen.filter((a) => a.revoked_at == null);
  if (actives.length > 1) {
    return fail("SERVER_ERROR", "Service de synchronisation indisponible.", 500);
  }
  const row = actives[0] ?? null;
  if (!row) {
    if (seen.length > 0) return fail("REVOKED_ERROR", "Accès coupé.", 403);
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }
  const now = Date.now();
  if (row.locked_until && Date.parse(row.locked_until) > now) {
    return fail("LOCKED_ERROR", "Compte verrouillé 5 minutes (5 échecs).", 429);
  }
  if (!verifyPin(pin, row)) {
    // Miroir EXACT de la logique Edge corrigée : quand le verrou précédent a
    // expiré, le compteur repart de 0 AVANT d'appliquer la nouvelle tentative —
    // sinon le 1er mauvais PIN après l'expiration reverrouille instantanément
    // (1 essai / 5 min pour toujours au lieu de 5 échecs / 5 min).
    const lockExpired = row.locked_until && Date.parse(row.locked_until) <= now;
    const base = lockExpired ? 0 : (row.failed_attempts ?? 0);
    row.failed_attempts = base + 1;
    row.locked_until =
      row.failed_attempts >= MAX_FAILED ? new Date(now + LOCK_MS).toISOString() : null;
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }
  row.failed_attempts = 0;
  row.locked_until = null;
  const mine = [...payloads.values()].filter((p) => p.customer_id === row.customer_id);
  const latest = (kind) => {
    const rows = mine.filter((p) => p.kind === kind);
    rows.sort((a, b) => (a.id < b.id ? 1 : -1));
    return rows[0]?.payload ?? null;
  };
  if (saleId != null) {
    const details = mine.filter((p) => p.kind === "invoice_detail");
    details.sort((a, b) => (a.id < b.id ? 1 : -1));
    // Même borne que la production (DETAIL_SCAN_LIMIT) : au-delà, 404.
    const match = details
      .slice(0, DETAIL_SCAN_LIMIT)
      .find((p) => String(p.payload?.sale?.id) === String(saleId));
    if (!match) return fail("NOT_FOUND", "Facture indisponible.", 404);
    return {
      status: 200,
      body: { ok: true, data: { detail: match.payload, syncedAt: new Date().toISOString() } },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      data: {
        snapshot: latest("customer_snapshot"),
        invoices: latest("invoice_list"),
        payments: latest("payment_list"),
        syncedAt: new Date().toISOString(),
      },
    },
  };
}

let seq = 0;
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "apikey, authorization, Content-Type, Prefer",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      });
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/") {
      send(res, 200, {
        ok: true,
        service: "e2e-mirror-relay",
        access: access.size,
        payloads: payloads.size,
      });
      return;
    }
    if (req.method === "POST" && req.url?.startsWith("/rest/v1/client_access")) {
      const rows = await readJson(req);
      for (const r of Array.isArray(rows) ? rows : [rows]) {
        access.set(r.customer_id, { ...r });
      }
      send(res, 201, []);
      return;
    }
    if (req.method === "POST" && req.url?.startsWith("/rest/v1/client_payloads")) {
      const rows = await readJson(req);
      for (const r of Array.isArray(rows) ? rows : [rows]) {
        if (!payloads.has(r.operation_id)) payloads.set(r.operation_id, { ...r, id: ++seq });
      }
      send(res, 201, []);
      return;
    }
    if (req.method === "POST" && req.url === "/functions/v1/client-sync") {
      const body = await readJson(req);
      const r = await handleSync(body);
      send(res, r.status, r.body);
      return;
    }
    send(res, 404, { ok: false, code: "METHOD_ERROR", message: "Introuvable." });
  } catch {
    send(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "Requête illisible." });
  }
});

// 127.0.0.1 explicite : sans hôte, `listen` écoute TOUTES les interfaces alors
// que les en-têtes annoncent 127.0.0.1 — les identifiants de test partiraient
// sur le LAN.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`e2e-mirror-relay on http://127.0.0.1:${PORT}`);
});
