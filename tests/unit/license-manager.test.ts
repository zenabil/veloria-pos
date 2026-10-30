// Veloria License Manager — Tests : durées, validateurs, émission vérifiable.
// Clés éphémères : la clé vendor réelle n'est jamais touchée par les tests.
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { addMonths, inTx, listLicenses } from "../../license-manager/ipc/licenses.ts";
import { missingManagerMigrations } from "../../license-manager/db/manager-db.ts";
import {
  licenseCreateSchema,
  licenseRenewSchema,
  licenseTransferSchema,
} from "../../license-manager/ipc/validators.ts";
import { buildSignedLicense } from "../../license-manager/signing.ts";
import {
  LICENSE_PRODUCT_ID,
  decodeVlic,
  verifyLicenseChain,
} from "../../electron/licensing/protocol.ts";

const FP = "f".repeat(64);

describe("License durations", () => {
  it("ajoute des mois calendaires (clamp fin de mois)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-06-15", 6)).toBe("2026-12-15");
  });
});

describe("Manager validators", () => {
  it("accepte une création complète", () => {
    const c = licenseCreateSchema.parse({
      customerRef: "Épicerie Ennour",
      edition: "professional",
      licenseType: "term",
      durationMonths: 12,
      hardwareFingerprint: FP,
      features: ["ocr"],
    });
    expect(c.edition).toBe("professional");
  });

  it("rejette empreinte, édition et périodes incohérentes", () => {
    expect(() =>
      licenseCreateSchema.parse({
        customerRef: "X",
        edition: "professional",
        licenseType: "term",
        durationMonths: 12,
        hardwareFingerprint: "trop-court",
      }),
    ).toThrow();
    expect(() =>
      licenseCreateSchema.parse({
        customerRef: "Client",
        edition: "gold",
        licenseType: "term",
        durationMonths: 12,
        hardwareFingerprint: FP,
      }),
    ).toThrow();
    expect(() =>
      licenseCreateSchema.parse({
        customerRef: "Client",
        edition: "basic",
        licenseType: "term",
        hardwareFingerprint: FP,
      }),
    ).toThrow();
    expect(() =>
      licenseRenewSchema.parse({ id: 1, licenseType: "term", durationMonths: 0 }),
    ).toThrow();
    expect(() => licenseTransferSchema.parse({ id: 1, newFingerprint: "zz" })).toThrow();
  });
});

describe("Manager emission (cross-module proof)", () => {
  it("une licence émise par le Manager se vérifie côté POS", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const { payload, vlic } = buildSignedLicense(
      {
        customerRef: "Client Test",
        edition: "enterprise",
        licenseType: "term",
        hardwareFingerprint: FP,
        startsAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        features: ["ocr"],
      },
      priv,
    );
    expect(payload.productId).toBe(LICENSE_PRODUCT_ID);
    expect(vlic.length).toBeGreaterThan(100);
    // Chaîne POS complète avec la clé publique appariée :
    const signed = decodeVlic(vlic);
    const st = verifyLicenseChain({
      signed,
      publicKeyPem: pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: FP,
      nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
    });
    expect(st).toBe("ACTIVE");
  });
});

describe("inTx (registre vendor atomique)", () => {
  const stubDb = (): {
    prepare: (sql: string) => {
      run: (...p: unknown[]) => { changes: number; lastInsertRowid: number };
      get: (...p: unknown[]) => undefined;
      all: (...p: unknown[]) => unknown[];
    };
  } => ({
    prepare: (_sql: string) => ({
      run: (..._p: unknown[]) => ({ changes: 1, lastInsertRowid: 1 }),
      get: (..._p: unknown[]) => undefined,
      all: (..._p: unknown[]) => [],
    }),
  });
  it("exécute directement sans capacité transaction", () => {
    let ran = false;
    inTx(stubDb(), () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
  it("passe par transaction quand disponible, propage l'erreur", () => {
    const calls: string[] = [];
    const db = {
      ...stubDb(),
      transaction: (fn: () => void) => () => {
        calls.push("begin");
        try {
          fn();
          calls.push("commit");
        } catch (e) {
          calls.push("rollback");
          throw e;
        }
      },
    };
    inTx(db, () => calls.push("work"));
    expect(calls).toEqual(["begin", "work", "commit"]);
    expect(() =>
      inTx(db, () => {
        throw new Error("panne");
      }),
    ).toThrow("panne");
    expect(calls[calls.length - 1]).toBe("rollback");
  });
});

describe("upgrade du registre manager", () => {
  it("ne rejoue que les colonnes absentes (parc 1.0.0 → 1.0.4)", () => {
    const all = missingManagerMigrations([]);
    expect(all).toHaveLength(8);
    expect(all[0]).toContain("client_id");
    const complete = [
      "client_id",
      "client_name",
      "store_name",
      "plan",
      "license_status",
      "device_binding",
      "max_devices",
      "pages_json",
    ];
    expect(missingManagerMigrations(complete)).toEqual([]);
    expect(missingManagerMigrations(complete.slice(1))).toEqual([all[0]]);
  });
});

describe("L1/L2 : standing conservé par transfert/capabilities, réaligné par renouvellement", () => {
  // Même motif que bridge-shape.test.ts : contrat source statique (registry.ts
  // importe Electron, injouable tel quel en vitest).
  const src = fs.readFileSync(
    path.join(process.cwd(), "license-manager", "ipc", "registry.ts"),
    "utf-8",
  );
  const block = (name: string): string =>
    src
      .split("handle(MANAGER_CHANNELS[")
      .slice(1)
      .find((b) => b.startsWith(`"${name}"`)) ?? "";

  it("aucune ré émission ne repasse licenseStatus à null côté transfert/capabilities", () => {
    // Le renouvellement lève la suspension (RENEWAL.md) : `licenseStatus: null`
    // n'est licite QUE dans le bloc renew. Transfert et capabilities doivent
    // propager `standing` (suspension conservée hors ligne).
    const renew = block("manager.licenseRenew");
    const transfer = block("manager.licenseTransfer");
    const caps = block("manager.licenseCapabilities");
    expect(renew.length).toBeGreaterThan(0);
    expect(transfer.length).toBeGreaterThan(0);
    expect(caps.length).toBeGreaterThan(0);
    expect(transfer).toContain("licenseStatus: standing");
    expect(transfer).not.toContain("licenseStatus: null");
    expect(caps).toContain("licenseStatus: standing");
    expect(caps).not.toContain("licenseStatus: null");
  });

  it("le renouvellement écrit les deux colonnes de statut (P12)", () => {
    const renew = block("manager.licenseRenew");
    expect(renew).toContain("status = 'active', license_status = 'active'");
  });

  it("#32 : renouvellement et transfert conservent pages_json (jamais d'escalade ni de perte)", () => {
    // LEGACY_PAGES_CUTOFF (protocol.ts) : sans `pages`, seules les licences
    // émises avant le cutoff sont grandfathered — une ré-émission qui
    // laisserait tomber pages_json offrirait (ou retirerait) silencieusement
    // des capabilities. Les deux blocs doivent donc re-signer avec les pages
    // stockées (pages: row.pages_json ? … : null), jamais `pages: null` en dur.
    for (const name of ["manager.licenseRenew", "manager.licenseTransfer"]) {
      const b = block(name);
      expect(b.length).toBeGreaterThan(0);
      expect(b).toContain("pages: row.pages_json ?");
      expect(b).not.toContain("pages: null");
    }
  });

  it("#33 : garde revoked uniforme sur les cinq voies (aucune réactivation silencieuse)", () => {
    // Export/renew/transfer/capabilities/standing refusent toute transition
    // depuis 'revoked' (révocation terminale : seul un nouveau licenseId
    // ré-équipe le poste). Aucune voie sans le garde explicite.
    for (const name of [
      "manager.licenseExport",
      "manager.licenseRenew",
      "manager.licenseTransfer",
      "manager.licenseCapabilities",
      "manager.licenseStanding",
    ]) {
      const b = block(name);
      expect(b.length).toBeGreaterThan(0);
      expect(b).toContain('row.status === "revoked"');
    }
  });

  it("#40 : recherche par magasin (placeholder tenu : référence, identifiant, magasin)", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(
      "CREATE TABLE licenses (id INTEGER PRIMARY KEY, license_id TEXT, customer_ref TEXT, store_name TEXT)",
    );
    db.prepare("INSERT INTO licenses (license_id, customer_ref, store_name) VALUES (?, ?, ?)").run(
      "LIC-001",
      "CLI-ENNOUR-001",
      "Épicerie Ennour",
    );
    db.prepare("INSERT INTO licenses (license_id, customer_ref, store_name) VALUES (?, ?, ?)").run(
      "LIC-002",
      "CLI-AUTRE-002",
      "Superette Lumière",
    );
    expect(listLicenses(db, "ennour").total).toBe(1);
    expect(listLicenses(db, "LIC-002").total).toBe(1);
    expect(listLicenses(db, "lumière").total).toBe(1);
    expect(listLicenses(db, "introuvable").total).toBe(0);
    expect(listLicenses(db, "").total).toBe(2);
    db.close();
  });
});
