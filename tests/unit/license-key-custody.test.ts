// Veloria PoS — Preuves négatives de la CUSTODE DE CLÉ et du JEU DE CLÉS.
//
// Deux fixes P1 audit 2026-11-11 sont exercés ici :
//
//   LIC-02 : la clé privée correspondant à l'ancre PUBLIQUE embarquée doit
//            être IMPOSSIBLE à overlooked. Le garde de build
//            (`scripts/licensing/verify-key-custody.mjs`) doit REFUSER un
//            build dans ce cas — c'est la preuve que le défaut est
//            détectable, pas seulement documenté.
//
//   LIC-04 : la rotation de clé ne doit pas invalider les licences déjà
//            émises. Le jeu de clés résout la clé par `kid` ; une licence
//            v1 (sans `kid`) reste vérifiable ; un `kid` INCONNU est
//            REFUSÉ (jamais « essayé » contre les autres clés).
//
// Les tests s'exécutent sur un ARBRE JETABLE : la clé privée de production
// n'est jamais lue, et le dépôt n'est jamais modifié.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import {
  isUsablePublicKey,
  keySetFromSinglePem,
  parseKeySet,
  resolveVerificationKey,
  LEGACY_KEY_ID,
} from "../../electron/licensing/key-set.ts";

const CUSTODY_SCRIPT = path.resolve("scripts/licensing/verify-key-custody.mjs");

/** Exécute le garde de custode sur un arbre jetable. */
function runCustody(tree: {
  publicPem: string | null;
  keysJson?: string;
  privatePem?: string;
  privateFileName?: string;
}): { code: number; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-key-custody-"));
  try {
    const licDir = path.join(dir, "resources", "license");
    fs.mkdirSync(licDir, { recursive: true });
    if (tree.publicPem !== null) {
      fs.writeFileSync(path.join(licDir, "public.key"), tree.publicPem);
    }
    if (tree.keysJson !== undefined) {
      fs.writeFileSync(path.join(licDir, "keys.json"), tree.keysJson);
    }
    if (tree.privatePem !== undefined) {
      const privDir = path.join(dir, "private", "vendor-keys");
      fs.mkdirSync(privDir, { recursive: true });
      fs.writeFileSync(path.join(privDir, tree.privateFileName ?? "private.key"), tree.privatePem);
    }
    // Le script est COPIÉ dans l'arbre : il résout ses chemins depuis cwd.
    const scriptDir = path.join(dir, "scripts", "licensing");
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.copyFileSync(CUSTODY_SCRIPT, path.join(scriptDir, "verify-key-custody.mjs"));
    let out = "";
    let code = 0;
    try {
      out = execFileSync(process.execPath, [path.join(scriptDir, "verify-key-custody.mjs")], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      code = e.status ?? 1;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    return { code, out };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const kpA = generateKeyPairSync("ed25519");
const kpB = generateKeyPairSync("ed25519");
const pemA = kpA.publicKey.export({ type: "spki", format: "pem" }) as string;
const pemB = kpB.publicKey.export({ type: "spki", format: "pem" }) as string;
const privA = kpA.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const privB = kpB.privateKey.export({ type: "pkcs8", format: "pem" }) as string;

describe("LIC-02 — garde de custode de clé", () => {
  it("REFUSE un build quand la clé privée de l'ancre embarquée est présente", () => {
    const r = runCustody({ publicPem: pemA, privatePem: privA });
    expect(r.code).toBe(1);
    expect(r.out).toContain("KEY-CUSTODY ÉCHEC");
    expect(r.out).toContain("private.key");
  });

  it("REFUSE aussi quand la clé privée est ailleurs dans l'arbre (pas seulement au domicile vendor)", () => {
    const r = runCustody({
      publicPem: pemA,
      privatePem: privA,
      privateFileName: "prod-backup.key",
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("KEY-CUSTODY ÉCHEC");
  });

  it("REFUSE quand l'ancre embarquée vient du JEU de clés (keys.json)", () => {
    const r = runCustody({
      publicPem: null,
      keysJson: JSON.stringify({ schema: 1, active: "k1", keys: { k1: pemA } }),
      privatePem: privA,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("KEY-CUSTODY ÉCHEC");
  });

  it("AUTORISE une ancre dont la clé privée est ABSENTE (cas normal de build)", () => {
    const r = runCustody({ publicPem: pemA });
    expect(r.code).toBe(0);
    expect(r.out).toContain("OK");
  });

  it("AUTORISE une clé privée DIFFÉRENTE (le邸 de développement d'un autre projet)", () => {
    const r = runCustody({ publicPem: pemA, privatePem: privB });
    expect(r.code).toBe(0);
    expect(r.out).toContain("OK");
  });

  it("ÉCHOUE (fail-closed) si aucune ancre embarquée n'est lisible", () => {
    const r = runCustody({ publicPem: null });
    expect(r.code).toBe(2);
    expect(r.out).toContain("KEY-CUSTODY ÉCHEC");
  });
});

describe("LIC-04 — jeu de clés et rotation", () => {
  let set: ReturnType<typeof parseKeySet>;

  beforeEach(() => {
    set = parseKeySet(JSON.stringify({ schema: 1, active: "k2", keys: { k1: pemA, k2: pemB } }));
  });

  afterEach(() => {
    set = null;
  });

  it("analyse un jeu de clés valide et expose la clé active", () => {
    expect(set).not.toBeNull();
    expect(set?.active).toBe("k2");
    expect(Object.keys(set?.keys ?? {})).toEqual(["k1", "k2"]);
  });

  it("REFUSE un jeu de clés malformé (fail-closed)", () => {
    expect(parseKeySet("pas du json")).toBeNull();
    expect(parseKeySet("[]")).toBeNull();
    expect(parseKeySet(JSON.stringify({ keys: { k1: pemA } }))).toBeNull(); // pas de `active`
    expect(parseKeySet(JSON.stringify({ active: "k1", keys: {} }))).toBeNull(); // active absent
    expect(parseKeySet(JSON.stringify({ active: "k1", keys: { k1: 42 } }))).toBeNull();
  });

  it("résout la clé DÉSIGNÉE par le kid", () => {
    const r = resolveVerificationKey("k1", set, null);
    expect(r.reason).toBe("OK");
    expect(r.kid).toBe("k1");
    expect(r.pem).toBe(pemA);
  });

  it("REFUSE un kid INCONNU — jamais « essayé » contre les autres clés", () => {
    const r = resolveVerificationKey("k9", set, null);
    expect(r.pem).toBeNull();
    expect(r.reason).toBe("UNKNOWN_KID");
  });

  it("une licence v1 (sans kid) reste vérifiable avec la clé active", () => {
    const r = resolveVerificationKey(undefined, set, null);
    expect(r.reason).toBe("OK");
    expect(r.kid).toBe("k2");
    expect(r.pem).toBe(pemB);
  });

  it("SANS jeu de clés, retombe sur la clé unique historique (compatibilité 1.0.x)", () => {
    const r = resolveVerificationKey("k1", null, pemA);
    expect(r.reason).toBe("OK");
    expect(r.pem).toBe(pemA);
  });

  it("SANS jeu de clés NI clé historique : fail-closed", () => {
    const r = resolveVerificationKey("k1", null, null);
    expect(r.pem).toBeNull();
    expect(r.reason).toBe("KEY_SET_UNAVAILABLE");
  });

  it("la rotation CONSERVE l'ancienne clé (les licences émises restent valides)", () => {
    // Avant rotation : k1 est active.
    const before = parseKeySet(JSON.stringify({ schema: 1, active: "k1", keys: { k1: pemA } }));
    expect(resolveVerificationKey("k1", before, null).pem).toBe(pemA);
    // Après rotation : k2 est active, k1 est CONSERVÉE.
    const after = parseKeySet(
      JSON.stringify({ schema: 1, active: "k2", keys: { k1: pemA, k2: pemB } }),
    );
    expect(resolveVerificationKey("k1", after, null).pem).toBe(pemA); // licence v1
    expect(resolveVerificationKey("k2", after, null).pem).toBe(pemB); // licence neuve
  });

  it("rejette une PEM inexploitable", () => {
    expect(isUsablePublicKey("pas une clé")).toBe(false);
    expect(isUsablePublicKey(pemA)).toBe(true);
  });

  it("construit un jeu à partir d'une clé unique (chemin de migration)", () => {
    const s = keySetFromSinglePem(pemA);
    expect(s.active).toBe(LEGACY_KEY_ID);
    expect(resolveVerificationKey(undefined, s, null).pem).toBe(pemA);
  });
});
