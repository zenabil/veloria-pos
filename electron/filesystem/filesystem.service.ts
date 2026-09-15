// Veloria PoS — Electron: filesystem service (validated paths only).
import fs from "node:fs";
import path from "node:path";
import { app, dialog, shell } from "electron";

export function pickFolder(): string | null {
  const res = dialog.showOpenDialogSync({ properties: ["openDirectory", "createDirectory"] });
  if (!res || res.length === 0) return null;
  const first = res.at(0);
  if (first === undefined) return null;
  return first;
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function openPathSafe(target: string, allowedRoots: string[]): void {
  const normalized = path.normalize(target);
  const ok = allowedRoots.some((r) => normalized.startsWith(path.normalize(r)));
  if (!ok) throw new Error("Chemin non autorisé.");
  void shell.openPath(normalized);
}

export function userDataDir(): string {
  return app.getPath("userData");
}
