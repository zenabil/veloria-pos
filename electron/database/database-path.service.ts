// Veloria PoS — Electron: database path service.
// Default: %PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite (all-users, survives updates).
// Fallback: app.getPath('userData') when PROGRAMDATA is not writable (per-user install).
// User can relocate from Settings; path persisted in userData/config.json.

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { assertSafeUserFolder, isAllowedDatabaseFile } from "../security/security";

export const LOGICAL_DB_NAME = "veloria POS DB";
export const PHYSICAL_DB_FILENAME = "Veloria POS DB.sqlite";

interface DbConfig {
  dbPath: string;
}

function configFile(): string {
  return path.join(app.getPath("userData"), "config.json");
}

function programDataDir(): string {
  const base = process.env.PROGRAMDATA ?? path.join(app.getPath("appData"), "..", "ProgramData");
  return path.join(base, "Veloria PoS", "Data");
}

export function defaultDbPath(): string {
  const preferred = path.join(programDataDir(), PHYSICAL_DB_FILENAME);
  try {
    fs.mkdirSync(path.dirname(preferred), { recursive: true });
    // writability probe
    fs.accessSync(path.dirname(preferred), fs.constants.W_OK);
    return preferred;
  } catch {
    const fallbackDir = path.join(app.getPath("userData"), "Data");
    fs.mkdirSync(fallbackDir, { recursive: true });
    return path.join(fallbackDir, PHYSICAL_DB_FILENAME);
  }
}

export function getConfiguredDbPath(): string {
  // P6: config.json non fiable par construction (même utilisateur) : schéma
  // strict + politique centrale sur le DOSSIER PARENT (pas de mkdir aveugle).
  try {
    const raw = fs.readFileSync(configFile(), "utf-8");
    const cfg = JSON.parse(raw) as Partial<DbConfig>;
    if (typeof cfg.dbPath === "string" && isAllowedDatabaseFile(cfg.dbPath)) {
      assertSafeUserFolder(path.dirname(path.normalize(cfg.dbPath)));
      fs.mkdirSync(path.dirname(path.normalize(cfg.dbPath)), { recursive: true });
      return path.normalize(cfg.dbPath);
    }
  } catch {
    // fall through to default
  }
  return defaultDbPath();
}

/** Persist a new DB path ONLY after the new location has been verified by the caller. */
export function persistDbPath(newPath: string): void {
  // P6: validation atomique (extension + dossier sûr) AVANT mkdir/write.
  // Seul .sqlite est persistable (contrat historique) ; .vposdb reste lisible
  // (sauvegardes/restaurations) sans devenir chemin de travail.
  const normalized = path.normalize(newPath);
  if (!normalized.toLowerCase().endsWith(".sqlite")) {
    throw new Error("Le chemin de la base doit se terminer par .sqlite");
  }
  assertSafeUserFolder(path.dirname(normalized));
  fs.mkdirSync(path.dirname(normalized), { recursive: true });
  const tmp = `${configFile()}.tmp`;
  fs.writeFileSync(
    tmp,
    JSON.stringify({ dbPath: normalized } satisfies DbConfig, null, 2),
    "utf-8",
  );
  fs.renameSync(tmp, configFile());
}

export function getDataFolder(): string {
  return path.dirname(getConfiguredDbPath());
}
