// Veloria PoS — Electron: database path service.
// Default: %PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite (all-users, survives updates).
// Fallback: app.getPath('userData') when PROGRAMDATA is not writable (per-user install).
// User can relocate from Settings; path persisted in userData/config.json.

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

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
  try {
    const raw = fs.readFileSync(configFile(), "utf-8");
    const cfg = JSON.parse(raw) as DbConfig;
    if (typeof cfg.dbPath === "string" && cfg.dbPath.endsWith(".sqlite")) {
      fs.mkdirSync(path.dirname(cfg.dbPath), { recursive: true });
      return cfg.dbPath;
    }
  } catch {
    // fall through to default
  }
  return defaultDbPath();
}

/** Persist a new DB path ONLY after the new location has been verified by the caller. */
export function persistDbPath(newPath: string): void {
  const normalized = path.normalize(newPath);
  if (!normalized.toLowerCase().endsWith(".sqlite")) {
    throw new Error("Le chemin de la base doit se terminer par .sqlite");
  }
  fs.mkdirSync(path.dirname(normalized), { recursive: true });
  fs.writeFileSync(
    configFile(),
    JSON.stringify({ dbPath: normalized } satisfies DbConfig, null, 2),
    "utf-8",
  );
}

export function getDataFolder(): string {
  return path.dirname(getConfiguredDbPath());
}
