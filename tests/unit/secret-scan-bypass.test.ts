// Veloria PoS — Preuve NÉGATIVE du scanner de secrets (GATE-01).
//
// Le scanner a été élargi (radical-fix 2026-11-11) : la famille « secret »
// scanne TOUS les fichiers (une clé planquée dans un `.md` reste une fuite),
// tandis que la famille « interruption de licence » ne scanne que le CODE
// (un interrupteur est une construction de code ; de la prose qui le NOMME
// n'en est pas un).
//
// Ce test prouve les DEUX propriétés à la fois — sans lui, la correction
// pourrait être «会上» (on aurait pu simplement élargir la liste d'exclusion
// ou affaiblir un motif) :
//   1. NÉGATIF : un vrai interrupteur dans un `.ts` est TOUJOURS détecté ;
//   2. NÉGATIF : une clé privée dans un `.md` est TOUJOURS détectée ;
//   3. NÉGATIF : un jeton de service dans un `.md` est TOUJOURS détecté ;
//   4. POSITIF : la documentation qui NOMME un contournement passe.
//
// Il vérifie aussi le PÉRIMÈTRE : le scanner doit rester « fail-closed » sur
// un arbre vide (plancher de non-vacuité), sinon il sourit sur zéro fichier.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCANNER = path.resolve("scripts/licensing/secret-scan.mjs");

/**
 * Les FIXTURES de ce fichier contiennent (par construction) des MOTIFS que le
 * scanner traque. Si on les écrivait en clair, le scanner les détecterait dans
 * ce fichier de test lui-même — et le dépôt deviendrait impossible à
 * empaqueter. Ils sont donc ASSEMBLÉS à l'exécution, comme le fait le scanner
 * pour ses propres motifs (le mot-clé complet n'apparaît jamais en littéral
 * dans le source).
 *
 * `part()` évite la concaténation directe pour que le linter n'exige pas de
 *_cleanup de type.
 */
function part(a: string, b: string): string {
  return a + b;
}

const PEM_HEADER = part("-----BEGIN ", part("PRIVATE", " KEY-----"));
const PEM_BODY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC";
const SB_SECRET = part(part("sb_", "secret"), "_abcdefghijklmnopqrstuvwxyz012345");
const SERVICE_ROLE = part("service", "_role");
const BYPASS_FLAG = part(part("bypass", "License"), " = true");

/**
 * Exécute le scanner sur un arbre jetable et renvoie { code, stdout, stderr }.
 * Le scanner travaille sur `process.cwd()` : on lui donne donc un racine
 * temporaire qui CONTIENT une copie du scanner (le scanner résout ses motifs)
 * et un dossier `scripts/` minimal.
 */
function scanTree(files: Record<string, string>): { code: number; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-secret-scan-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts", "licensing"), { recursive: true });
    fs.copyFileSync(SCANNER, path.join(dir, "scripts", "licensing", "secret-scan.mjs"));
    // Le scanner exige la clé publique embarquée (fail-closed) et un plancher
    // de 600 fichiers : on lui fournit une clé factice (le motif ne cherche
    // qu'un EN-tête PEM) et un remplissage de fichiers vides pour franchir le
    // plancher — le but est d'exercer la LOGIQUE de détection, pas le
    // périmètre de production.
    fs.mkdirSync(path.join(dir, "resources", "license"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "resources", "license", "public.key"),
      "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----\n",
    );
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    // Plancher de non-vacuité : on noie l'arbre de fichiers vides.
    const filler = path.join(dir, "src", "filler");
    fs.mkdirSync(filler, { recursive: true });
    for (let i = 0; i < 700; i++) {
      fs.writeFileSync(path.join(filler, `f${i}.ts`), "export const x = 1;\n");
    }
    let out = "";
    let code = 0;
    try {
      out = execFileSync(
        process.execPath,
        [path.join(dir, "scripts", "licensing", "secret-scan.mjs")],
        {
          cwd: dir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
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

describe("secret-scan — preuve négative (GATE-01)", () => {
  it("DÉTECTE un vrai interrupteur de licence dans un fichier .ts (la famille code reste active)", () => {
    const r = scanTree({
      "src/evil.ts": `export const ${BYPASS_FLAG};\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("evil.ts");
  });

  it("DÉTECTE une clé privée collée dans un fichier .md (la famille secret reste globale)", () => {
    const r = scanTree({
      "docs/leak.md": `${PEM_HEADER}\n${PEM_BODY}\n-----END PRIVATE KEY-----\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("leak.md");
  });

  it("DÉTECTE un jeton de service collé dans un fichier .md (la famille secret reste globale)", () => {
    const r = scanTree({
      "docs/token.md": `const k = "${SB_SECRET}";\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("token.md");
  });

  it("DÉTECTE un jeton de service Supabase dans un fichier .json (forme clé NOTÉE)", () => {
    const r = scanTree({
      "config/creds.json": `{ "${SERVICE_ROLE}": "abcdefghijklmnopqrstuvwxyz0123456789" }\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("creds.json");
  });

  it("DÉTECTE un jeton de service Supabase dans un fichier .yaml (forme clé NU)", () => {
    const r = scanTree({
      "config/creds.yaml": `${SERVICE_ROLE}: "abcdefghijklmnopqrstuvwxyz0123456789"\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("creds.yaml");
  });

  it("DÉTECTE un JWT à rôle PRIVILÉGIÉ (service_role) dans un fichier .md (détection sémantique du payload)", () => {
    // JWT réel à 3 segments dont le payload déclare un rôle privilégié :
    // c'est ce contrôle-là (et non le motif de préfixe) qui doit rester actif.
    const payload = Buffer.from(JSON.stringify({ role: part("service", "_role") })).toString(
      "base64url",
    );
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.c2lnbmF0dXJlLXBsYWNlaG9sZGVy`;
    const r = scanTree({
      "docs/token.md": `clé relevée : ${jwt}\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("token.md");
    expect(r.out).toContain("role=");
  });

  it("AUTORISE un JWT à rôle PUBLIC (clé anon, présente par conception dans l'APK)", () => {
    const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.c2lnbmF0dXJlLXBsYWNlaG9sZGVy`;
    const r = scanTree({
      "docs/public.md": `clé anon publique : ${jwt}\n`,
    });
    expect(r.code).toBe(0);
  });

  it("AUTORISE la documentation qui NOMME un contournement sans le contenir (c'est le cas du bundle de compétences)", () => {
    // Reproduit la situation qui faisait échouer le scan avant le correctif :
    // une question d'abus en anglais, dans un threat-model checklist, qui
    // NOMME un contournement sans en contenir aucun.
    const prose = [
      "- Can deleting one local state file " +
        part("bypass", " ") +
        part("licen", "se") +
        " checks or destroy data?\n" +
        "- Review whether an operator could " +
        part("ski", "p") +
        " activation in the field.\n",
    ].join("");
    const r = scanTree({ "docs/audit.md": prose });
    expect(r.code).toBe(0);
    expect(r.out).toContain("OK");
  });

  it("AUTORISE une source .ts qui ne contient aucun interrupteur", () => {
    const r = scanTree({
      "src/ok.ts": "export function activate(): boolean {\n  return true;\n}\n",
    });
    expect(r.code).toBe(0);
  });

  it("ÉCHOUE si le périmètre est cassé (porte non-vacue) — un scanner qui ne regarde rien doit échouer", () => {
    // Arbre SANS le fichier de remplissage : le plancher de 600 fichiers
    // doit déclencher l'échec (fail-closed), pas un « aucun secret » vert.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-secret-scan-vac-"));
    try {
      fs.mkdirSync(path.join(dir, "scripts", "licensing"), { recursive: true });
      fs.copyFileSync(SCANNER, path.join(dir, "scripts", "licensing", "secret-scan.mjs"));
      fs.mkdirSync(path.join(dir, "resources", "license"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "resources", "license", "public.key"),
        "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----\n",
      );
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src", "a.ts"), "export const x = 1;\n");
      let out = "";
      let code = 0;
      try {
        out = execFileSync(
          process.execPath,
          [path.join(dir, "scripts", "licensing", "secret-scan.mjs")],
          { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
      } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        code = e.status ?? 1;
        out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(code).toBe(1);
      expect(out).toContain("seuil");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
