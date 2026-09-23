// Veloria License Manager — IPC interne (outil vendor, canal explicites).
// Le renderer ne touche ni clé privée ni fs : dialogue + écriture .vlic main.

import { app, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { MANAGER_CHANNELS } from "./channels";
import * as V from "./validators";
import { exportManagerBackup, openManagerDb } from "../db/manager-db";
import {
  addMonths,
  getLicense,
  insertLicenseRecord,
  listLicenses,
  logEvent,
  rebindFingerprint,
} from "./licenses";
import { buildSignedLicense, editionFromPlan, loadVendorPrivateKey } from "../signing";
import { getManagerWindow } from "../main/window-manager";
import { validateVendorPrivateKeyPem, vendorKeysDir } from "../signing";

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function fail(err: unknown): { ok: false; code: string; message: string } {
  const msg = err instanceof Error ? err.message : "Erreur inattendue.";
  if (err instanceof Error && err.name === "ZodError") {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Données invalides. Vérifiez le formulaire.",
    };
  }
  return { ok: false, code: "MANAGER_ERROR", message: msg };
}

function handle<TInput>(
  channel: string,
  schema: { parse(v: unknown): TInput } | null,
  fn: (input: TInput) => unknown,
): void {
  ipcMain.handle(channel, (_event, raw: unknown) => {
    try {
      const input = schema ? schema.parse(raw ?? {}) : (raw as TInput);
      return ok(fn(input));
    } catch (err) {
      return fail(err);
    }
  });
}

function resolveDates(input: {
  licenseType: "term" | "lifetime";
  durationMonths?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  now: string;
}): { startsAt: string; expiresAt: string | null } {
  if (input.licenseType === "lifetime")
    return { startsAt: input.now.slice(0, 10), expiresAt: null };
  if (input.durationMonths != null) {
    const start = (input.startsAt ?? input.now.slice(0, 10)) as string;
    return { startsAt: start, expiresAt: addMonths(start, input.durationMonths) };
  }
  const startsAt = input.startsAt as string;
  const expiresAt = input.expiresAt as string;
  if (expiresAt <= startsAt) throw new Error("La fin doit être postérieure au début.");
  return { startsAt, expiresAt };
}

export function registerManagerIpc(): void {
  handle(MANAGER_CHANNELS["manager.appInfo"], null, () => ({
    version: app.getVersion(),
    keyConfigured: keyConfigured(),
  }));
  handle(MANAGER_CHANNELS["manager.keyStatus"], null, () => ({ configured: keyConfigured() }));
  // Import guidé de la clé privée vendor (premier lancement) : dialogue
  // fichier main → validation Ed25519 stricte → copie dans userData/keys
  // (domicile lu en premier par loadVendorPrivateKey). La clé ne transite
  // JAMAIS par le renderer et n'est JAMAIS incluse dans l'installeur.
  handle(MANAGER_CHANNELS["manager.keyImport"], null, () => {
    const win = getManagerWindow();
    const opts = {
      title: "Importer la clé privée vendor",
      filters: [
        { name: "Clé privée (PEM)", extensions: ["key", "pem"] },
        { name: "Tous", extensions: ["*"] },
      ],
      properties: ["openFile" as const],
    };
    const picked = win ? dialog.showOpenDialogSync(win, opts) : dialog.showOpenDialogSync(opts);
    const file = picked?.[0];
    if (!file) return { imported: false, configured: keyConfigured() };
    let pem: string;
    try {
      const stat = fs.statSync(file);
      if (stat.size <= 0 || stat.size > 100_000) throw new Error("bad size");
      pem = fs.readFileSync(file, "utf-8");
    } catch {
      throw new Error("Fichier de clé illisible.");
    }
    validateVendorPrivateKeyPem(pem);
    const dir = vendorKeysDir();
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, "private.key");
    fs.writeFileSync(dest, pem, { encoding: "utf-8", mode: 0o600 });
    return { imported: true, configured: keyConfigured() };
  });
  // P3 : sauvegarde du registre vendor (rotation 10, sans secret).
  handle(MANAGER_CHANNELS["manager.backup"], null, () => exportManagerBackup());
  handle(MANAGER_CHANNELS["manager.licensesList"], null, () => listLicenses(openManagerDb(), ""));
  handle(MANAGER_CHANNELS["manager.licenseDetail"], V.licenseIdSchema, (input) => ({
    license: getLicense(openManagerDb(), input.id),
    events: openManagerDb()
      .prepare(`SELECT * FROM license_events WHERE license_row_id = ? ORDER BY id DESC LIMIT 100`)
      .all(input.id),
  }));
  handle(MANAGER_CHANNELS["manager.licenseCreate"], V.licenseCreateSchema, (input) => {
    const db = openManagerDb();
    const now = new Date().toISOString();
    const { startsAt, expiresAt } = resolveDates({ ...input, now });
    const priv = loadVendorPrivateKey();
    const plan = input.plan ?? null;
    const edition = plan ? editionFromPlan(plan) : input.edition;
    const { payload, vlic } = buildSignedLicense(
      {
        customerRef: input.customerRef,
        clientId: input.clientId ?? null,
        clientName: input.clientName ?? null,
        storeName: input.storeName ?? null,
        edition,
        plan,
        licenseType: input.licenseType,
        licenseStatus: input.licenseStatus ?? null,
        deviceBinding: input.deviceBinding,
        maxDevices: input.maxDevices ?? null,
        hardwareFingerprint: input.hardwareFingerprint,
        startsAt: `${startsAt}T00:00:00.000Z`,
        expiresAt: expiresAt ? `${expiresAt}T00:00:00.000Z` : null,
        features: input.features,
        pages: input.pages ?? null,
      },
      priv,
    );
    const id = insertLicenseRecord(db, {
      licenseId: payload.licenseId,
      customerRef: input.customerRef,
      clientId: input.clientId ?? null,
      clientName: input.clientName ?? null,
      storeName: input.storeName ?? null,
      edition,
      plan,
      licenseType: input.licenseType,
      licenseStatus: input.licenseStatus ?? "active",
      deviceBinding: input.deviceBinding,
      maxDevices: input.maxDevices ?? null,
      hardwareFingerprint: input.hardwareFingerprint,
      startsAt: `${startsAt}T00:00:00.000Z`,
      expiresAt: expiresAt ? `${expiresAt}T00:00:00.000Z` : null,
      features: [...input.features].sort(),
      pages: input.pages ?? null,
      envelopeVlic: vlic,
      notes: input.notes ?? null,
      now,
    });
    return { id, licenseId: payload.licenseId };
  });
  handle(MANAGER_CHANNELS["manager.licenseExport"], V.licenseIdSchema, (input) => {
    const db = openManagerDb();
    const row = getLicense(db, input.id);
    if (row.status === "revoked") throw new Error("Licence révoquée : export refusé.");
    const picked = dialog.showSaveDialogSync({
      title: "Exporter la licence (.vlic)",
      defaultPath: path.join(app.getPath("documents"), `Veloria-POS-${row.license_id}.vlic`),
      filters: [{ name: "Licence Veloria (.vlic)", extensions: ["vlic"] }],
    });
    if (!picked) return { exported: false, path: null };
    fs.writeFileSync(picked, row.envelope_vlic, "utf-8");
    logEvent(db, input.id, "exported", { path: picked }, new Date().toISOString());
    return { exported: true, path: picked };
  });
  handle(MANAGER_CHANNELS["manager.licenseRenew"], V.licenseRenewSchema, (input) => {
    const db = openManagerDb();
    const row = getLicense(db, input.id);
    if (row.status === "revoked") throw new Error("Licence révoquée : renouvellement refusé.");
    const now = new Date().toISOString();
    const { startsAt, expiresAt } = resolveDates({
      licenseType: input.licenseType,
      durationMonths: input.durationMonths,
      startsAt: now.slice(0, 10),
      expiresAt: input.expiresAt,
      now,
    });
    const priv = loadVendorPrivateKey();
    const { vlic } = buildSignedLicense(
      {
        customerRef: row.customer_ref,
        clientId: (row.client_id as string | null) ?? null,
        clientName: (row.client_name as string | null) ?? null,
        storeName: (row.store_name as string | null) ?? null,
        edition: row.edition as
          | "basic"
          | "standard"
          | "professional"
          | "pro"
          | "enterprise"
          | "custom",
        plan: (row.plan as "BASIC" | "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM" | null) ?? null,
        licenseType: input.licenseType,
        licenseStatus: null,
        deviceBinding: (row.device_binding as number | null) !== 0,
        maxDevices: (row.max_devices as number | null) ?? null,
        hardwareFingerprint: row.hardware_fingerprint,
        startsAt: `${startsAt}T00:00:00.000Z`,
        expiresAt: expiresAt ? `${expiresAt}T00:00:00.000Z` : null,
        features: JSON.parse(row.features_json) as string[],
        pages: row.pages_json ? (JSON.parse(row.pages_json) as Record<string, boolean>) : null,
      },
      priv,
    );
    // Renouvellement = même licenseId, nouvelles dates (l'ancien .vlic reste
    // valide jusqu'à sa propre expiration : chevauchement de grâce assumé).
    db.prepare(
      `UPDATE licenses SET license_type = ?, starts_at = ?, expires_at = ?, envelope_vlic = ?, issued_at = ?, status = 'active', updated_at = ? WHERE id = ?`,
    ).run(
      input.licenseType,
      `${startsAt}T00:00:00.000Z`,
      expiresAt ? `${expiresAt}T00:00:00.000Z` : null,
      vlic,
      now,
      now,
      input.id,
    );
    logEvent(db, input.id, "renewed", { startsAt, expiresAt }, now);
    return { renewed: true };
  });
  handle(MANAGER_CHANNELS["manager.licenseTransfer"], V.licenseTransferSchema, (input) => {
    const db = openManagerDb();
    const row = getLicense(db, input.id);
    if (row.status === "revoked") throw new Error("Licence révoquée : transfert refusé.");
    const now = new Date().toISOString();
    const priv = loadVendorPrivateKey();
    // Transfert = même licenseId ré-émis pour la nouvelle empreinte : l'ancien
    // poste devient INVALID_HARDWARE (transfert effectif, sans action client).
    const { vlic } = buildSignedLicense(
      {
        customerRef: row.customer_ref,
        clientId: (row.client_id as string | null) ?? null,
        clientName: (row.client_name as string | null) ?? null,
        storeName: (row.store_name as string | null) ?? null,
        edition: row.edition as
          | "basic"
          | "standard"
          | "professional"
          | "pro"
          | "enterprise"
          | "custom",
        plan: (row.plan as "BASIC" | "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM" | null) ?? null,
        licenseType: row.license_type as "term" | "lifetime",
        licenseStatus: null,
        deviceBinding: (row.device_binding as number | null) !== 0,
        maxDevices: (row.max_devices as number | null) ?? null,
        hardwareFingerprint: input.newFingerprint,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        features: JSON.parse(row.features_json) as string[],
        pages: row.pages_json ? (JSON.parse(row.pages_json) as Record<string, boolean>) : null,
      },
      priv,
    );
    rebindFingerprint(db, input.id, input.newFingerprint, now);
    db.prepare(
      `UPDATE licenses SET envelope_vlic = ?, issued_at = ?, updated_at = ? WHERE id = ?`,
    ).run(vlic, now, now, input.id);
    logEvent(
      db,
      input.id,
      "transferred",
      { from: row.hardware_fingerprint.slice(0, 8), reason: input.reason },
      now,
    );
    return { transferred: true };
  });
  handle(MANAGER_CHANNELS["manager.licenseRevoke"], V.licenseIdSchema, (input) => {
    // BL-39: révocation effective — ré-émission signée avec licenseStatus
    // revoked (même licenseId) + statut local. Sans cela l'enveloppe .vlic
    // déjà exportée restait ACTIVE offline indéfiniment (verifier ne voyait
    // que le payload signé). Le client doit importer le nouveau .vlic
    // (comme suspend) ; export/renew ultérieurs restent refusés.
    const db = openManagerDb();
    const row = getLicense(db, input.id);
    const now = new Date().toISOString();
    const priv = loadVendorPrivateKey();
    const { vlic } = buildSignedLicense(
      {
        customerRef: row.customer_ref,
        clientId: (row.client_id as string | null) ?? null,
        clientName: (row.client_name as string | null) ?? null,
        storeName: (row.store_name as string | null) ?? null,
        edition: row.edition as
          | "basic"
          | "standard"
          | "professional"
          | "pro"
          | "enterprise"
          | "custom",
        plan: (row.plan as "BASIC" | "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM" | null) ?? null,
        licenseType: row.license_type as "term" | "lifetime",
        licenseStatus: "revoked",
        deviceBinding: (row.device_binding as number | null) !== 0,
        maxDevices: (row.max_devices as number | null) ?? null,
        hardwareFingerprint: row.hardware_fingerprint,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        features: JSON.parse(row.features_json) as string[],
        pages: row.pages_json ? (JSON.parse(row.pages_json) as Record<string, boolean>) : null,
      },
      priv,
    );
    db.prepare(
      `UPDATE licenses SET status = 'revoked', license_status = 'revoked', envelope_vlic = ?, issued_at = ?, updated_at = ? WHERE id = ?`,
    ).run(vlic, now, now, input.id);
    logEvent(db, input.id, "revoked", {}, now);
    return { revoked: true };
  });
  // Mise à jour des capabilities (pages/features) : ré-émission signée du
  // même licenseId (dates inchangées). Le client importe le nouveau .vlic.
  handle(MANAGER_CHANNELS["manager.licenseCapabilities"], V.licenseCapabilitiesSchema, (input) => {
    const db = openManagerDb();
    const row = getLicense(db, input.id);
    if (row.status === "revoked") throw new Error("Licence révoquée : modification refusée.");
    const now = new Date().toISOString();
    const priv = loadVendorPrivateKey();
    const { vlic } = buildSignedLicense(
      {
        customerRef: row.customer_ref,
        clientId: (row.client_id as string | null) ?? null,
        clientName: (row.client_name as string | null) ?? null,
        storeName: (row.store_name as string | null) ?? null,
        edition: row.edition as
          | "basic"
          | "standard"
          | "professional"
          | "pro"
          | "enterprise"
          | "custom",
        plan: (row.plan as "BASIC" | "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM" | null) ?? null,
        licenseType: row.license_type as "term" | "lifetime",
        licenseStatus: null,
        deviceBinding: (row.device_binding as number | null) !== 0,
        maxDevices: (row.max_devices as number | null) ?? null,
        hardwareFingerprint: row.hardware_fingerprint,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        features: [...input.features].sort(),
        pages: input.pages ?? null,
      },
      priv,
    );
    db.prepare(
      `UPDATE licenses SET features_json = ?, pages_json = ?, envelope_vlic = ?, issued_at = ?, updated_at = ? WHERE id = ?`,
    ).run(
      JSON.stringify([...input.features].sort()),
      input.pages ? JSON.stringify(input.pages) : null,
      vlic,
      now,
      now,
      input.id,
    );
    logEvent(
      db,
      input.id,
      "capabilities_updated",
      { features: input.features, pages: input.pages },
      now,
    );
    return { updated: true };
  });
  // Suspension / réactivation : statut registral + enveloppe ré-émise avec
  // licenseStatus signé (effet offline dès import du nouveau .vlic).
  handle(MANAGER_CHANNELS["manager.licenseStanding"], V.licenseStatusSchema, (input) => {
    const db = openManagerDb();
    const row = getLicense(db, input.id);
    const now = new Date().toISOString();
    const priv = loadVendorPrivateKey();
    const standing = input.status === "active" ? null : (input.status as "suspended" | "revoked");
    const { vlic } = buildSignedLicense(
      {
        customerRef: row.customer_ref,
        clientId: (row.client_id as string | null) ?? null,
        clientName: (row.client_name as string | null) ?? null,
        storeName: (row.store_name as string | null) ?? null,
        edition: row.edition as
          | "basic"
          | "standard"
          | "professional"
          | "pro"
          | "enterprise"
          | "custom",
        plan: (row.plan as "BASIC" | "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM" | null) ?? null,
        licenseType: row.license_type as "term" | "lifetime",
        licenseStatus: standing,
        deviceBinding: (row.device_binding as number | null) !== 0,
        maxDevices: (row.max_devices as number | null) ?? null,
        hardwareFingerprint: row.hardware_fingerprint,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        features: JSON.parse(row.features_json) as string[],
        pages: row.pages_json ? (JSON.parse(row.pages_json) as Record<string, boolean>) : null,
      },
      priv,
    );
    db.prepare(
      `UPDATE licenses SET status = ?, license_status = ?, envelope_vlic = ?, issued_at = ?, updated_at = ? WHERE id = ?`,
    ).run(input.status, input.status, vlic, now, now, input.id);
    logEvent(db, input.id, `standing_${input.status}`, {}, now);
    return { updated: true };
  });
}

function keyConfigured(): boolean {
  try {
    loadVendorPrivateKey();
    return true;
  } catch {
    return false;
  }
}
