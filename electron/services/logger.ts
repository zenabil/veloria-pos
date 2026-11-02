// Veloria PoS — Electron: structured logger (main process).
// Logs to file under userData/logs + stdout. Never log secrets.

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { businessDayOf } from "../shared/business-day";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

let logFile = "";

// L9 : rétention des journaux. Un fichier par jour, écrit en append à chaque
// log → sans purge le dossier grossit sans borne. La purge se fait UNIQUEMENT
// au démarrage (jamais sur le chemin d'écriture : aucun coût par log).
const LOG_RETENTION_DAYS = 14;

/** Supprime les journaux `veloria-AAAA-MM-JJ.log` plus vieux que la rétention. */
function pruneOldLogs(dir: string, nowMs = Date.now()): void {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = nowMs - LOG_RETENTION_DAYS * 86_400_000;
  for (const name of entries) {
    if (!/^veloria-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      /* meilleur effort : un journal figé ne bloque jamais le démarrage */
    }
  }
}

export function initLogger(): string {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    pruneOldLogs(dir);
    const day = businessDayOf(new Date());
    logFile = path.join(dir, `veloria-${day}.log`);
  } catch {
    logFile = "";
  }
  return logFile;
}

export function getLogFile(): string {
  return logFile;
}

export function log(
  level: LogLevel,
  component: string,
  event: string,
  extra?: Record<string, unknown>,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    event,
    ...extra,
  };
  const line = JSON.stringify(entry);
  if (level === "ERROR" || level === "FATAL") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line + "\n");
    } catch {
      // never crash on logging
    }
  }
}
