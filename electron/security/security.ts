// Veloria PoS — Electron: security helpers (navigation + path allow-lists).
import path from "node:path";

export const ALLOWED_EXTERNAL_PREFIXES: readonly string[] = [];

export function isExternalNavigationAllowed(url: string): boolean {
  if (url.startsWith("file://")) return true;
  if (url.startsWith("http://localhost:")) return true;
  if (url.startsWith("http://127.0.0.1:")) return true;
  return ALLOWED_EXTERNAL_PREFIXES.some((p) => url.startsWith(p));
}

/** Restore/relocation file validation (shallow, before SQLite open). */
export function isAllowedDatabaseFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (path.basename(lower).length === 0) return false;
  return lower.endsWith(".sqlite") || lower.endsWith(".vposdb");
}
