// Veloria License Manager — Signature vendor (clé PRIVÉE, machine vendor).
// Sources : userData/keys/private.key (manager packagé) puis
// private/vendor-keys/private.key (dépôt, gitignoré). Refus net sinon.
// Le POS ne contient JAMAIS ce module (vérification seule, clé publique).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  LICENSE_PRODUCT_ID,
  LICENSE_SCHEMA_VERSION,
  encodeVlic,
  signPayload,
  type LicenseEdition,
  type LicensePayload,
  type LicensePlan,
  type LicenseStanding,
  type LicenseType,
} from "../electron/licensing/protocol";

function privateKeyCandidates(): string[] {
  const out: string[] = [];
  try {
    out.push(path.join(app.getPath("userData"), "keys", "private.key"));
  } catch {
    /* ignore */
  }
  try {
    out.push(path.join(app.getAppPath(), "private", "vendor-keys", "private.key"));
  } catch {
    /* ignore */
  }
  out.push(path.join(process.cwd(), "private", "vendor-keys", "private.key"));
  return out;
}

export function loadVendorPrivateKey(): string {
  for (const c of privateKeyCandidates()) {
    try {
      const pem = fs.readFileSync(c, "utf-8");
      if (pem.includes("PRIVATE KEY")) return pem;
    } catch {
      /* candidat suivant */
    }
  }
  throw new Error(
    "Clé privée vendor introuvable. Placez-la dans le dossier keys du Manager (voir KEY_MANAGEMENT).",
  );
}

/**
 * Valide un PEM candidat AVANT installation (pur, testable) : en-tête,
 * taille bornée, clé Ed25519 privée chargeable. Jamais de log du contenu.
 */
export function validateVendorPrivateKeyPem(pem: string): void {
  if (typeof pem !== "string" || pem.length < 64 || pem.length > 100_000) {
    throw new Error("Fichier de clé invalide (taille).");
  }
  if (!pem.includes("PRIVATE KEY")) {
    throw new Error("Fichier de clé invalide (PEM attendu).");
  }
  let key: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPrivateKey } = require("node:crypto") as typeof import("node:crypto");
    key = createPrivateKey(pem);
  } catch {
    throw new Error("Clé privée illisible ou corrompue.");
  }
  const kind = (key as { asymmetricKeyType?: unknown }).asymmetricKeyType;
  if (kind !== "ed25519") {
    throw new Error("La clé vendor doit être Ed25519.");
  }
}

/** Dossier keys du Manager (userData) — domicile installé de la clé privée. */
export function vendorKeysDir(): string {
  return path.join(app.getPath("userData"), "keys");
}

export interface NewLicenseInput {
  customerRef: string;
  clientId?: string | null;
  clientName?: string | null;
  storeName?: string | null;
  edition: LicenseEdition;
  plan?: LicensePlan | null;
  licenseType: LicenseType;
  licenseStatus?: LicenseStanding | null;
  deviceBinding?: boolean | null;
  maxDevices?: number | null;
  hardwareFingerprint: string;
  startsAt: string;
  expiresAt: string | null;
  features: string[];
  pages?: Record<string, boolean> | null;
}

export function buildSignedLicense(
  input: NewLicenseInput,
  privateKeyPem: string,
): {
  payload: LicensePayload;
  vlic: string;
} {
  const payload: LicensePayload = {
    schemaVersion: LICENSE_SCHEMA_VERSION,
    licenseId: `VLIC-${randomUUID().slice(0, 8).toUpperCase()}`,
    productId: LICENSE_PRODUCT_ID,
    edition: input.edition,
    licenseType: input.licenseType,
    hardwareFingerprint: input.hardwareFingerprint,
    issuedAt: new Date().toISOString(),
    startsAt: input.startsAt,
    ...(input.licenseType === "term" && input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    features: [...input.features].sort(),
    ...(input.clientId?.trim() ? { clientId: input.clientId.trim() } : {}),
    ...(input.clientName?.trim() ? { clientName: input.clientName.trim() } : {}),
    ...(input.storeName?.trim() ? { storeName: input.storeName.trim() } : {}),
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.licenseStatus && input.licenseStatus !== "active"
      ? { licenseStatus: input.licenseStatus }
      : {}),
    ...(input.deviceBinding === false ? { deviceBinding: false } : {}),
    ...(typeof input.maxDevices === "number" ? { maxDevices: input.maxDevices } : {}),
    ...(input.pages ? { pages: { ...input.pages } } : {}),
  };
  const signature = signPayload(payload, privateKeyPem);
  return { payload, vlic: encodeVlic({ payload, signature }) };
}

/** Édition legacy dérivée du plan (compatibilité ascendante). */
export function editionFromPlan(plan: LicensePlan): LicenseEdition {
  switch (plan) {
    case "BASIC":
      return "basic";
    case "STANDARD":
      return "standard";
    case "PRO":
      return "pro";
    case "ENTERPRISE":
      return "enterprise";
    default:
      return "custom";
  }
}
