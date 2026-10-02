// Veloria Licensing — Hardware fingerprint (node builtins only, no Electron).
// Windows : MachineGuid (registre) + SystemUUID (SMBIOS) + ProcessorId + disque
// système. Normalisation → SHA-256 hex. Au moins 2 sources requises, sinon
// erreur FR (identifiant indisponible — pas de licence "best effort").

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";

export const FINGERPRINT_MIN_SOURCES = 2;

function norm(v: string): string {
  return v
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .trim();
}

function run(cmd: string, args: string[]): string | null {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const t = String(out).trim();
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

function regValue(path: string, name: string): string | null {
  const out = run("reg", ["query", path, "/v", name]);
  if (!out) return null;
  const m = out.match(/REG_\w+\s+(.+)\s*$/m);
  return m?.[1]?.trim() || null;
}

function wmic(alias: string, prop: string): string | null {
  const out = run("wmic", [alias, "get", prop, "/value"]);
  if (!out) return null;
  const m = out.match(new RegExp(`${prop}=(.+)`, "i"));
  const v = m?.[1]?.trim();
  return v ? v : null;
}

function powershell(query: string, prop: string): string | null {
  const out = run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `(Get-CimInstance -ClassName ${query} | Select-Object -First 1 -ExpandProperty ${prop})`,
  ]);
  return out?.trim() || null;
}

/** Sources brutes (exporté pour tests/diag — jamais stocké dans la licence). */
export function collectHardwareSources(): { name: string; value: string }[] {
  const sources: { name: string; value: string }[] = [];
  // Utilisateur OS (stable, toutes plateformes ; renforce aussi win32).
  // NOTE : les adresses MAC sont VOLONTAIREMENT exclues — les adaptateurs
  // virtuels/VPN (WSL, Hyper-V, VPN) apparaissent/disparaissent et rendraient
  // l'empreinte instable entre deux processus (mismatch de licence).
  try {
    const user = norm(os.userInfo().username);
    if (user.length >= 2) sources.push({ name: "os-user", value: user });
  } catch {
    /* ignore */
  }
  if (os.platform() !== "win32") {
    const h = norm(os.hostname());
    if (h.length >= 2) sources.push({ name: "hostname", value: h });
    // Identifiant machine Linux (fichier standard, stable entre reboots).
    if (os.platform() === "linux") {
      try {
        const mid = norm(fs.readFileSync("/etc/machine-id", "utf8"));
        if (mid.replace(/-/g, "").length >= 8) sources.push({ name: "machine-id", value: mid });
      } catch {
        /* conteneur sans machine-id */
      }
    }
    return sources;
  }
  const machineGuid = regValue("HKLM\\SOFTWARE\\Microsoft\\Cryptography", "MachineGuid");
  if (machineGuid && norm(machineGuid).length >= 8) {
    sources.push({ name: "machine-guid", value: norm(machineGuid) });
  }
  const sysUuid = wmic("csproduct", "UUID") ?? powershell("Win32_ComputerSystemProduct", "UUID");
  if (sysUuid && norm(sysUuid).length >= 8 && !/^0+-0+-0+-0+-0+$/.test(norm(sysUuid))) {
    sources.push({ name: "system-uuid", value: norm(sysUuid) });
  }
  const cpu = wmic("cpu", "ProcessorId") ?? powershell("Win32_Processor", "ProcessorId");
  if (cpu && norm(cpu).length >= 4) sources.push({ name: "cpu-id", value: norm(cpu) });
  const disk = wmic("diskdrive", "SerialNumber") ?? powershell("Win32_DiskDrive", "SerialNumber");
  if (disk && norm(disk).replace(/-/g, "").length >= 4) {
    sources.push({ name: "disk-serial", value: norm(disk) });
  }
  return sources;
}

export function fingerprintFromSources(sources: { name: string; value: string }[]): string {
  const usable = sources
    .filter((s) => s.value.length > 0)
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((s) => `${s.name}=${s.value}`)
    .join("\n");
  return createHash("sha256").update(usable, "utf8").digest("hex");
}

/**
 * PERF (cause racine E2E/boucle gardes) : chaque appel engendrait jusqu'à 7
 * processus fils (reg + wmic×3 + replis powershell) — plusieurs SECONDES par
 * IPC gardé sur les postes où wmic échoue lentement (Win11 sans la
 * fonctionnalité optionnelle), alors que la Charte exige recherche <500ms et
 * barcode <50ms. L'identité matérielle ne change jamais pendant la vie d'un
 * processus (un changement de disque/CM exige reboot/réinstall → nouveau
 * processus qui relit) : mémoïsation sûre, `clearFingerprintCache` pour tests.
 *
 * P0-3 : l'ÉCHEC n'est plus jamais mémorisé définitivement (un raté transitoire
 * reg/wmic bloquait toute la session). 3 tentatives avec backoff, puis échec
 * mémorisé BRIÈVEMENT (TTL, perf des gardes IPC) : après expiration, le
 * prochain appel réessaie réellement.
 */
export const FINGERPRINT_MAX_ATTEMPTS = 3;
export const FINGERPRINT_FAILURE_TTL_MS = 30_000;

let cachedFingerprint: { fingerprint: string; sources: number } | null = null;
let cachedFailure: { message: string; atMs: number } | null = null;

export function clearFingerprintCache(): void {
  cachedFingerprint = null;
  cachedFailure = null;
}

/** Pause synchrone courte (chemin d'échec uniquement — jamais sur succès). */
function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    /* ignore */
  }
}

/** Empreinte SHA-256 hex (64 car.). Lève un message FR si indisponible. */
export function getHardwareFingerprint(): { fingerprint: string; sources: number } {
  if (cachedFingerprint) return cachedFingerprint;
  if (cachedFailure && Date.now() - cachedFailure.atMs < FINGERPRINT_FAILURE_TTL_MS) {
    throw new Error(cachedFailure.message);
  }
  cachedFailure = null;
  const message =
    "Identifiant matériel indisponible sur cet ordinateur. Vérifiez les droits d'accès système.";
  let sources: { name: string; value: string }[] = [];
  for (let attempt = 1; attempt <= FINGERPRINT_MAX_ATTEMPTS; attempt += 1) {
    sources = collectHardwareSources();
    if (sources.length >= FINGERPRINT_MIN_SOURCES) break;
    if (attempt < FINGERPRINT_MAX_ATTEMPTS) sleepSync(attempt * 150);
  }
  if (sources.length < FINGERPRINT_MIN_SOURCES) {
    cachedFailure = { message, atMs: Date.now() };
    throw new Error(message);
  }
  cachedFingerprint = {
    fingerprint: fingerprintFromSources(sources),
    sources: sources.length,
  };
  return cachedFingerprint;
}

/** Affichage court non sensible : 4 groupes de 4 (16 premiers car.). */
export function formatFingerprintShort(fingerprint: string): string {
  const h = fingerprint
    .replace(/[^a-f0-9]/gi, "")
    .toUpperCase()
    .slice(0, 16)
    .padEnd(16, "0");
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}`;
}
