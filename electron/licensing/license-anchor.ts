// Veloria Licensing — Ancre indépendante anti-suppression (H-3).
// Second evidence store, independent from `license-state.dat`:
//   - production: row `app_settings.license_anchor` in the BUSINESS SQLite DB.
//     Deleting the .dat file alone leaves the anchor → TAMPER_DETECTED.
//     Wiping both requires wiping business data too (visible data loss).
//   - tests: in-memory anchor via injected callbacks (never this module).
// Contents (never secrets): licenseId + firstSeenUtc + monotonicSeq + hw.
// Best-effort reads (DB closed in recovery → null = "no evidence", never throw).

export interface LicenseAnchor {
  licenseId: string;
  firstSeenUtc: string;
  monotonicSeq: number;
  hardwareFingerprint: string;
  updatedAt: string;
}

export const ANCHOR_SETTINGS_KEY = "license_anchor";

export function parseAnchor(raw: unknown): LicenseAnchor | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a: Record<string, unknown> = raw as Record<string, unknown>;
  const licenseId: unknown = a["licenseId"];
  const firstSeenUtc: unknown = a["firstSeenUtc"];
  const monotonicSeq: unknown = a["monotonicSeq"];
  const hardwareFingerprint: unknown = a["hardwareFingerprint"];
  const updatedAt: unknown = a["updatedAt"];
  if (typeof licenseId !== "string" || licenseId.length < 8) return null;
  if (typeof firstSeenUtc !== "string" || Number.isNaN(Date.parse(firstSeenUtc))) return null;
  if (typeof monotonicSeq !== "number" || !Number.isSafeInteger(monotonicSeq) || monotonicSeq < 0) {
    return null;
  }
  if (typeof hardwareFingerprint !== "string") return null;
  return {
    licenseId,
    firstSeenUtc,
    monotonicSeq,
    hardwareFingerprint,
    updatedAt: typeof updatedAt === "string" ? updatedAt : firstSeenUtc,
  };
}

/** Production SQLite anchor (best-effort, never throws). */
export function loadAnchorFromDb(
  getDb: () => {
    prepare(sql: string): { get(...p: unknown[]): unknown };
  },
): LicenseAnchor | null {
  try {
    // RADICAL-FIX: prepared `?` (pas d'interpolation même pour une constante).
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = ?`)
      .get(ANCHOR_SETTINGS_KEY) as { value_json: string } | undefined;
    if (!row) return null;
    return parseAnchor(JSON.parse(row.value_json));
  } catch {
    return null;
  }
}

export function saveAnchorToDb(
  getDb: () => {
    prepare(sql: string): { run(...p: unknown[]): unknown };
  },
  anchor: LicenseAnchor,
  nowIso: string,
): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(ANCHOR_SETTINGS_KEY, JSON.stringify(anchor), nowIso);
  } catch {
    /* best effort: anchor loss must never block licensing decisions */
  }
}
