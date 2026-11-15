// Veloria Client (APK) — détection d'une version plus récente (ADR-186).
//
// ANDROID INTERDIT l'installation silencieuse d'un APK téléchargé hors magasin
// (sécurité système) : l'application peut donc PROPOSER le téléchargement,
// jamais l'installer seule. Elle compare la version publiée — la version
// unique de la suite (ADR-161) — à la sienne, puis ouvre le lien.
//
// SILENCIEUX : hors ligne, manifeste illisible ou réponse inattendue =>
// aucun bandeau, aucun message d'erreur. Le client ne doit jamais dérouter
// un utilisateur pour une information de maintenance.

import { UPDATE_MANIFEST_URL } from "./config.ts";

export interface ClientUpdateAsset {
  name: string;
  sha256?: string;
  size?: number;
  downloadUrl?: string;
}

export interface ClientUpdateManifest {
  schema: number;
  suiteVersion: string;
  androidVersionCode?: number;
  notes?: string;
  releasePage?: string;
  assets?: Record<string, ClientUpdateAsset>;
}

export interface ClientUpdateInfo {
  /** Version publiée (identique à la version de la suite). */
  version: string;
  /** `versionCode` Android publié (information de traçabilité). */
  versionCode?: number;
  /** Notes de version. */
  notes?: string;
  /** Lien de téléchargement (APK) ou page de release. */
  url: string;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Compare deux versions `X.Y.Z` : -1, 0 ou 1. Version illisible = 0. */
export function compareVersions(a: string, b: string): number {
  const ma = VERSION_RE.exec(a.trim());
  const mb = VERSION_RE.exec(b.trim());
  if (!ma || !mb) return 0;
  for (let i = 1; i <= 3; i += 1) {
    const na = Number(ma[i]);
    const nb = Number(mb[i]);
    if (na !== nb) return na > nb ? 1 : -1;
  }
  return 0;
}

/** Valide le manifeste publié (rejet ferme : rien n'est annoncé si invalide). */
export function parseClientManifest(raw: unknown): ClientUpdateManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj["schema"] !== 1) return null;
  const suiteVersion = obj["suiteVersion"];
  if (typeof suiteVersion !== "string" || !VERSION_RE.test(suiteVersion.trim())) return null;
  const manifest: ClientUpdateManifest = { schema: 1, suiteVersion: suiteVersion.trim() };
  const code = obj["androidVersionCode"];
  if (typeof code === "number" && Number.isInteger(code) && code > 0) {
    manifest.androidVersionCode = code;
  }
  const notes = obj["notes"];
  if (typeof notes === "string" && notes.trim().length > 0 && notes.length <= 2000) {
    manifest.notes = notes.trim();
  }
  const releasePage = obj["releasePage"];
  if (typeof releasePage === "string" && releasePage.startsWith("https://")) {
    manifest.releasePage = releasePage;
  }
  const assets = obj["assets"];
  if (typeof assets === "object" && assets !== null) {
    const parsed: Record<string, ClientUpdateAsset> = {};
    for (const [key, value] of Object.entries(assets as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) continue;
      const asset = value as Record<string, unknown>;
      const name = asset["name"];
      if (typeof name !== "string" || name.length === 0 || name.length > 200) continue;
      if (name.includes("/") || name.includes("\\") || name.includes("..")) continue;
      const downloadUrl = asset["downloadUrl"];
      const entry: ClientUpdateAsset = { name };
      if (typeof downloadUrl === "string" && downloadUrl.startsWith("https://")) {
        entry.downloadUrl = downloadUrl;
      }
      const sha = asset["sha256"];
      if (typeof sha === "string" && /^[0-9a-f]{64}$/.test(sha)) entry.sha256 = sha;
      parsed[key] = entry;
    }
    if (Object.keys(parsed).length > 0) manifest.assets = parsed;
  }
  return manifest;
}

/**
 * Information de mise à jour si la version publiée est plus récente.
 * `null` sinon (rien à annoncer).
 */
export function resolveClientUpdate(
  manifest: ClientUpdateManifest | null,
  currentVersion: string,
): ClientUpdateInfo | null {
  if (!manifest) return null;
  if (compareVersions(manifest.suiteVersion, currentVersion) <= 0) return null;
  const apk = manifest.assets?.["apk"];
  const url = apk?.downloadUrl ?? manifest.releasePage;
  if (!url) return null;
  return {
    version: manifest.suiteVersion,
    ...(manifest.androidVersionCode ? { versionCode: manifest.androidVersionCode } : {}),
    ...(manifest.notes ? { notes: manifest.notes } : {}),
    url,
  };
}

/** `fetch` injectable (même contrat que `api.ts`). */
export type FetchImpl = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Cherche une version plus récente. Toute anomalie => `null` (silencieux).
 * Sans URL configurée (build non configuré) => `null` immédiat, sans réseau.
 */
export async function checkClientUpdate(options: {
  currentVersion: string;
  url?: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}): Promise<ClientUpdateInfo | null> {
  const url = (options.url ?? UPDATE_MANIFEST_URL).trim();
  if (url === "" || !url.startsWith("https://")) return null;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl | undefined);
  if (!fetchImpl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const manifest = parseClientManifest(await res.json());
    return resolveClientUpdate(manifest, options.currentVersion);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
