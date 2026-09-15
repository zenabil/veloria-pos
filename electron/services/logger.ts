// Veloria PoS — Electron: structured logger (main process).
// Logs to file under userData/logs + stdout. Never log secrets.

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

let logFile = "";

export function initLogger(): string {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
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
