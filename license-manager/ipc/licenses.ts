// Veloria License Manager — Registre des licences émises (vendor).
// Création / renouvellement / transfert / révocation. Chaque émission signe
// une enveloppe .vlic persistée (ré-export possible). Révocation = statut
// local (limite offline documentée : honorée aux renouvellements/exports).

import { randomUUID } from "node:crypto";

type Db = {
  prepare(sql: string): {
    run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...p: unknown[]): unknown;
    all(...p: unknown[]): unknown[];
  };
};

/**
 * Transaction best-effort (better-sqlite3 en prod, interface minimale en test).
 * Les flux multi-écritures (création + event, update + event) passent par ici :
 * jamais de registre/event divergents après crash intercalé.
 */
export function inTx(db: Db, fn: () => void): void {
  const tx = (db as { transaction?: unknown }).transaction;
  if (typeof tx === "function") {
    (tx as (f: () => void) => () => void).call(db, fn)();
    return;
  }
  fn();
}

export type ManagerEdition =
  "basic" | "standard" | "professional" | "pro" | "enterprise" | "custom";
export type ManagerLicenseType = "term" | "lifetime";

export interface LicenseRow {
  id: number;
  license_id: string;
  customer_ref: string;
  client_id: string | null;
  client_name: string | null;
  store_name: string | null;
  edition: string;
  plan: string | null;
  license_type: string;
  license_status: string | null;
  device_binding: number | null;
  max_devices: number | null;
  hardware_fingerprint: string;
  issued_at: string;
  starts_at: string;
  expires_at: string | null;
  features_json: string;
  pages_json: string | null;
  status: string;
  envelope_vlic: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function event(db: Db, rowId: number, name: string, details: unknown, now: string): void {
  db.prepare(
    `INSERT INTO license_events (license_row_id, event, details_json, created_at) VALUES (?, ?, ?, ?)`,
  ).run(rowId, name, JSON.stringify(details ?? {}), now);
}

export function listLicenses(db: Db, query: string): { rows: LicenseRow[]; total: number } {
  const q = query.trim();
  // #40 : le placeholder promet (référence, identifiant, magasin) — le WHERE
  // couvre les trois (jamais de promesse de recherche mensongère).
  const where = q
    ? `WHERE customer_ref LIKE ? ESCAPE '\\' OR license_id LIKE ? ESCAPE '\\' OR store_name LIKE ? ESCAPE '\\'`
    : "";
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const params: unknown[] = q ? [like, like, like] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM licenses ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(`SELECT * FROM licenses ${where} ORDER BY id DESC LIMIT 200`)
    .all(...params) as LicenseRow[];
  return { rows, total };
}

export function getLicense(db: Db, id: number): LicenseRow {
  const row = db.prepare(`SELECT * FROM licenses WHERE id = ?`).get(id) as LicenseRow | undefined;
  if (!row) throw new Error("Licence introuvable.");
  return row;
}

export interface CreateRecordInput {
  licenseId: string;
  customerRef: string;
  clientId: string | null;
  clientName: string | null;
  storeName: string | null;
  edition: ManagerEdition;
  plan: string | null;
  licenseType: ManagerLicenseType;
  licenseStatus: string | null;
  deviceBinding: boolean;
  maxDevices: number | null;
  hardwareFingerprint: string;
  startsAt: string;
  expiresAt: string | null;
  features: string[];
  pages: Record<string, boolean> | null;
  envelopeVlic: string;
  notes: string | null;
  now: string;
}

export function insertLicenseRecord(db: Db, input: CreateRecordInput): number {
  // P12: status registral = licenseStatus signé (jamais deux vérités).
  const standing = input.licenseStatus ?? "active";
  const r = db
    .prepare(
      `INSERT INTO licenses (uuid, license_id, customer_ref, client_id, client_name, store_name, edition, plan, license_type, license_status, device_binding, max_devices, hardware_fingerprint, issued_at, starts_at, expires_at, features_json, pages_json, status, envelope_vlic, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.licenseId,
      input.customerRef.trim(),
      input.clientId?.trim() || null,
      input.clientName?.trim() || null,
      input.storeName?.trim() || null,
      input.edition,
      input.plan,
      input.licenseType,
      standing,
      input.deviceBinding ? 1 : 0,
      input.maxDevices,
      input.hardwareFingerprint.toLowerCase(),
      input.now,
      input.startsAt,
      input.expiresAt,
      JSON.stringify(input.features),
      input.pages ? JSON.stringify(input.pages) : null,
      standing,
      input.envelopeVlic,
      input.notes?.trim() || null,
      input.now,
      input.now,
    );
  const id = Number(r.lastInsertRowid);
  event(db, id, "created", { licenseId: input.licenseId }, input.now);
  return id;
}

// P12: updateEnvelope/setStatus supprimés (remplacés par SQL inline dans
// registry : revoke ré-émet avec statut signé, standing met à jour les deux
// colonnes ; helpers morts sans appelant vérifié sur tout l'arbre source).
export function logEvent(db: Db, id: number, name: string, details: unknown, now: string): void {
  getLicense(db, id);
  event(db, id, name, details, now);
  db.prepare(`UPDATE licenses SET updated_at = ? WHERE id = ?`).run(now, id);
}

export function rebindFingerprint(db: Db, id: number, fingerprint: string, now: string): void {
  const r = db
    .prepare(`UPDATE licenses SET hardware_fingerprint = ?, updated_at = ? WHERE id = ?`)
    .run(fingerprint.toLowerCase(), now, id);
  if (Number(r.changes) === 0) throw new Error("Licence introuvable.");
}

/** Échéance = date de début + N mois calendaires (jour clampé fin de mois). */
export function addMonths(dateYmd: string, months: number): string {
  const [y, m, d] = dateYmd.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const dim = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, dim);
  const out = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day));
  return out.toISOString().slice(0, 10);
}
