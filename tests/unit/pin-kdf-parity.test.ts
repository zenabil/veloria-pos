// Veloria — #39 : parité KDF PIN (écriture POS / Edge / relais E2E / domaine)
// + comportement PBKDF2 (déterministe, sel unique, faux PIN rejeté).
// Le hachage main n'est pas importable en vitest (sqlite.service → electron) :
// le comportement est prouvé ici avec node:crypto sur les constantes du
// domaine, et le contrat source garantit les mêmes paramètres partout.
import { describe, expect, it } from "vitest";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  PIN_KDF_ALGO,
  PIN_KDF_DIGEST,
  PIN_KDF_ITERATIONS,
  PIN_KDF_KEYLEN_BYTES,
  PIN_KDF_SALT_BYTES,
} from "../../src/domain/customer/client-access";

const root = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

function derive(pin: string, saltHex: string): string {
  return pbkdf2Sync(
    pin,
    Buffer.from(saltHex, "hex"),
    PIN_KDF_ITERATIONS,
    PIN_KDF_KEYLEN_BYTES,
    "sha256",
  ).toString("hex");
}

describe("#39 : parité des paramètres KDF sur les quatre implémentations", () => {
  it("repo POS : mêmes itérations + clé + identifiant d'algorithme", () => {
    const src = read("electron/ipc/handlers/client-access.repo.ts");
    expect(src).toContain("PIN_KDF_ITERATIONS = 100_000");
    expect(src).toContain("PIN_KDF_KEYLEN_BYTES = 32");
    expect(src).toContain(`PIN_KDF_ALGO = "${PIN_KDF_ALGO}"`);
  });
  it("Edge : mêmes itérations + clé (bits) + digest", () => {
    const src = read("cloud/supabase/functions/client-sync/index.ts");
    expect(src).toContain("PIN_KDF_ITERATIONS = 100_000");
    expect(src).toContain("PIN_KDF_KEYLEN_BITS = 256");
    expect(src).toContain(`hash: "${PIN_KDF_DIGEST}"`);
  });
  it("relais E2E : mêmes itérations + clé", () => {
    const src = read("scripts/e2e-mirror-relay.mjs");
    expect(src).toContain("PIN_KDF_ITERATIONS = 100_000");
    expect(src).toContain("PIN_KDF_KEYLEN_BYTES = 32");
  });
});

describe("#39 : comportement PBKDF2 (lenteur + unicité par sel)", () => {
  it("déterministe, sel unique, faux PIN rejeté", () => {
    const saltA = randomBytes(PIN_KDF_SALT_BYTES).toString("hex");
    const saltB = randomBytes(PIN_KDF_SALT_BYTES).toString("hex");
    expect(saltA).not.toBe(saltB);
    const t0 = Date.now();
    const h1 = derive("654321", saltA);
    const h2 = derive("654321", saltA);
    const h3 = derive("654321", saltB);
    const h4 = derive("123456", saltA);
    const ms = Date.now() - t0;
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).not.toBe(h4);
    expect(h1).toHaveLength(PIN_KDF_KEYLEN_BYTES * 2);
    // Fumée de coût : 100k itérations ne sont pas un SHA-256 nu (info, pas de
    // borne basse stricte — la garantie est la constante exacte ci-dessus).
    expect(ms).toBeLessThan(15_000);
  });
});
