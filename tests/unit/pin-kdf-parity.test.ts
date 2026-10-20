// Veloria — #39 : parité KDF PIN (écriture POS / Edge / relais E2E / domaine)
// + parité KDF CODE (équipe) — preuve COMPORTEMENTALE (W4 / I-04).
//
// Avant : la parité était prouvée par `expect(src).toContain("...")` (comparaison
// de TEXTE) — un écart réel d'algorithme ou de paramètre pouvait passer.
//
// Maintenant : chaque implémentation est EXÉCUTÉE et son condensat est
// comparé à celui des autres. Les constantes sont comparées NUMÉRIQUEMENT
// (100_000 ≡ 100000), pas par recherche de chaîne littérale.
import { describe, expect, it, vi } from "vitest";
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

// Le main n'est pas importable tel quel (sqlite.service → electron) : la base
// est neutralisée (ce test n'écrit RIEN).
vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    throw new Error("Base indisponible : test de parité sans base.");
  },
  integrityCheck: () => ({ integrity: "ok", foreignKeys: [] }),
  getDbPath: () => "",
}));

import {
  pbkdf2PinHex,
  PIN_KDF_ITERATIONS as MAIN_PIN_ITERATIONS,
  PIN_KDF_KEYLEN_BYTES as MAIN_PIN_KEYLEN,
} from "../../electron/ipc/handlers/client-access.repo";
import {
  pbkdf2CodeHex,
  STAFF_KDF_ALGO,
  STAFF_KDF_ITERATIONS,
  STAFF_KDF_KEYLEN_BYTES,
} from "../../electron/ipc/handlers/staff.repo";

const root = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

const PIN = "654321";
const CODE = "123456";

function derive(pin: string, saltHex: string, iterations: number, keylen: number): string {
  return pbkdf2Sync(pin, Buffer.from(saltHex, "hex"), iterations, keylen, "sha256").toString("hex");
}

/** Constante numérique lue dans une source (100_000 → 100000). */
function numericConstant(src: string, name: string): number {
  const m = new RegExp(`const ${name}\\s*=\\s*([0-9_]+)\\s*;`).exec(src);
  if (!m?.[1]) throw new Error(`Constante ${name} introuvable.`);
  return Number(m[1].replace(/_/g, ""));
}

describe("#39 : parité KDF PIN — preuve COMPORTEMENTALE (4 implémentations)", () => {
  it("main (écriture POS) ≡ domaine (mêmes itérations, clé, digest)", () => {
    const salt = randomBytes(PIN_KDF_SALT_BYTES).toString("hex");
    expect(MAIN_PIN_ITERATIONS).toBe(PIN_KDF_ITERATIONS);
    expect(MAIN_PIN_KEYLEN).toBe(PIN_KDF_KEYLEN_BYTES);
    // Le digest est calculé par le MAIN, comparé au digest du DOMAINE.
    expect(pbkdf2PinHex(PIN, salt)).toBe(
      derive(PIN, salt, PIN_KDF_ITERATIONS, PIN_KDF_KEYLEN_BYTES),
    );
    expect(PIN_KDF_ALGO).toContain("pbkdf2");
    expect(PIN_KDF_DIGEST.toLowerCase()).toBe("sha-256");
  });

  it("relais E2E ≡ domaine (constantes numériques + même condensat)", () => {
    const src = read("scripts/e2e-mirror-relay.mjs");
    const iterations = numericConstant(src, "PIN_KDF_ITERATIONS");
    const keylen = numericConstant(src, "PIN_KDF_KEYLEN_BYTES");
    expect(iterations).toBe(PIN_KDF_ITERATIONS);
    expect(keylen).toBe(PIN_KDF_KEYLEN_BYTES);
    // La fonction du relais est EXÉCUTÉE telle qu'écrite dans le script
    // (source du PROJET, jamais une entrée externe : `no-implied-eval` est
    // désactivé ici volontairement, la preuve est le but du test).
    const fn = /const pbkdf2PinHex = \(pin, saltHex\) =>[\s\S]*?\.toString\("hex"\);/.exec(src);
    if (!fn?.[0]) throw new Error("Fonction pbkdf2PinHex du relais introuvable.");
    const relaySource = fn[0].replace(/^const pbkdf2PinHex =/, "return");
    /* eslint-disable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call */
    const relayHash = new Function(
      "pbkdf2Sync",
      "Buffer",
      "PIN_KDF_ITERATIONS",
      "PIN_KDF_KEYLEN_BYTES",
      relaySource,
    )(pbkdf2Sync, Buffer, iterations, keylen) as (pin: string, saltHex: string) => string;
    /* eslint-enable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call */
    const salt = randomBytes(PIN_KDF_SALT_BYTES).toString("hex");
    expect(relayHash(PIN, salt)).toBe(derive(PIN, salt, PIN_KDF_ITERATIONS, PIN_KDF_KEYLEN_BYTES));
  });

  it("Edge (client-sync) ≡ domaine (constantes numériques + même condensat)", async () => {
    const src = read("cloud/supabase/functions/client-sync/index.ts");
    const iterations = numericConstant(src, "PIN_KDF_ITERATIONS");
    const keylenBits = numericConstant(src, "PIN_KDF_KEYLEN_BITS");
    expect(iterations).toBe(PIN_KDF_ITERATIONS);
    expect(keylenBits / 8).toBe(PIN_KDF_KEYLEN_BYTES);
    // La fonction Edge est EXÉCUTÉE (webcrypto dispo en Node) après retrait des
    // annotations TypeScript : le condensat comparé est bien celui du Edge.
    const start = src.indexOf("function hexToBytes");
    const end = src.indexOf("function fail(");
    if (start < 0 || end <= start) throw new Error("Code Edge introuvable.");
    const snippet = src
      .slice(start, end)
      .replace(/:\s*Uint8Array/g, "")
      .replace(/:\s*Promise<string>/g, "")
      .replace(/:\s*string/g, "");
    // Les constantes EXTRAITES de la source Edge sont injectées : le digest
    // comparé dépend donc bien des paramètres réellement écrits dans l'Edge.
    const edgeSource = snippet + "; return pbkdf2PinHex;";
    /* eslint-disable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call */
    const edgeHash = new Function(
      "crypto",
      "TextEncoder",
      "PIN_KDF_ITERATIONS",
      "PIN_KDF_KEYLEN_BITS",
      edgeSource,
    )(globalThis.crypto, TextEncoder, iterations, keylenBits) as (
      pin: string,
      saltHex: string,
    ) => Promise<string>;
    /* eslint-enable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call */
    const salt = randomBytes(PIN_KDF_SALT_BYTES).toString("hex");
    await expect(edgeHash(PIN, salt)).resolves.toBe(
      derive(PIN, salt, PIN_KDF_ITERATIONS, PIN_KDF_KEYLEN_BYTES),
    );
  });
});

describe("#39 : parité KDF CODE (équipe) — preuve COMPORTEMENTALE", () => {
  it("le hachage du code d'accès utilise bien les paramètres documentés", () => {
    expect(STAFF_KDF_ITERATIONS).toBe(100_000);
    expect(STAFF_KDF_KEYLEN_BYTES).toBe(32);
    expect(STAFF_KDF_ALGO).toBe("pbkdf2-sha256-100k");
    const salt = randomBytes(16).toString("hex");
    // Le condensat réellement produit par le main = celui attendu des
    // paramètres documentés (aucune dépendance à une constante exportée).
    expect(pbkdf2CodeHex(CODE, salt)).toBe(derive(CODE, salt, 100_000, 32));
    // Deux sels différents ⇒ deux condensats différents (jamais de sel fixe).
    const salt2 = randomBytes(16).toString("hex");
    expect(pbkdf2CodeHex(CODE, salt2)).not.toBe(pbkdf2CodeHex(CODE, salt));
  });
});

describe("#39 : comportement PBKDF2 (lenteur + unicité par sel)", () => {
  it("déterministe, sel unique, faux PIN rejeté", () => {
    const saltA = randomBytes(PIN_KDF_SALT_BYTES).toString("hex");
    const saltB = randomBytes(PIN_KDF_SALT_BYTES).toString("hex");
    expect(saltA).not.toBe(saltB);
    const t0 = Date.now();
    const h1 = derive(PIN, saltA, PIN_KDF_ITERATIONS, PIN_KDF_KEYLEN_BYTES);
    const h2 = derive(PIN, saltA, PIN_KDF_ITERATIONS, PIN_KDF_KEYLEN_BYTES);
    const h3 = derive(PIN, saltB, PIN_KDF_ITERATIONS, PIN_KDF_KEYLEN_BYTES);
    const h4 = derive("123456", saltA, PIN_KDF_ITERATIONS, PIN_KDF_KEYLEN_BYTES);
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
