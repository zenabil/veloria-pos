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

// ---------------------------------------------------------------------------
// OBS-01 : COUCHE DE RÉDACTION (confidentialité).
//
// Le logger ne doit JAMAIS persiste un secret ou une donnée personnelle non
// nécessaire au diagnostic. La rédaction s'applique AVANT la sérialisation :
// elle ne modifie jamais le code appelant (qui peut continuer à passer des
// objets riches), elle ne fait que masquer les valeurs sensibles au moment
// d'écrire la ligne.
//
// Deux niveaux :
//   1. par CLÉ — tout champ dont le nom évoque un secret ou une credential
//      (password, pin, token, secret, apikey, authorization, service_key…)
//      est remplacé par « [redacted] » ;
//   2. par VALEUR — un jeton JWT (3 segments base64url) ou une chaîne longue
//      ressemblant à un secret Supabase (`sb_secret_…`) est masqué même s'il
//      est passé sous une clé innocente (défense en profondeur).
// La rédaction ne doit JAMAIS lever (elle est sur le chemin d'écriture).
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_RE =
  /(pass(word)?|pin|token|secret|apikey|api_key|authorization|auth|credential|bearer|service_role|servicekey|service_key)/i;

const JWT_RE = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const SUPABASE_SECRET_RE = /sb_secret_[A-Za-z0-9_-]+/g;
const LONG_HEX_RE = /\b[0-9a-f]{32,}\b/gi;

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[redacted-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (JWT_RE.test(value)) return "[redacted-jwt]";
    let out = value.replace(SUPABASE_SECRET_RE, "[redacted-secret]");
    out = out.replace(LONG_HEX_RE, "[redacted-hex]");
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (SENSITIVE_KEY_RE.test(k)) out[k] = "[redacted]";
      else out[k] = redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
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
    ...(extra ? (redactValue(extra) as Record<string, unknown>) : {}),
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
