// Veloria PoS — Electron: contrat du manifeste de mise à jour (lecture seule).
//
// ADR-186 : la DÉTECTION d'une version plus récente est automatique, mais
// l'application n'installe JAMAIS rien. Elle annonce la version au
// propriétaire (écrans « À propos ») et ouvre la page de release dans le
// navigateur du système. Aucun exécutable n'est téléchargé, lancé ni
// remplacé par le processus : la décision reste humaine (ADR-161 §4 reste
// applicable — le téléchargement/exécution automatique reste refusé tant
// qu'aucun certificat de signature n'existe).
//
// Le manifeste est un fichier JSON publié comme ASSET d'une release GitHub,
// lu à une URL FIXE (`…/releases/latest/download/update-manifest.json`).
// Jamais l'API GitHub : elle est limitée à 60 requêtes/h par IP — un parc de
// clients Android la saturerait.
//
// Ce module est PUR (aucun import Electron) : il est testable sans runtime.

/**
 * Hôtes autorisés pour le manifeste ET pour la page de release.
 * Deny-by-default : un manifeste ne peut pas venir d'une origine arbitraire.
 * Pour ajouter un CDN, c'est une décision explicite (ADR), pas un défaut.
 */
export const ALLOWED_FEED_HOSTS: readonly string[] = [
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
];

export interface UpdateManifestAsset {
  /** Nom exact de l'asset (ex. `Veloria-PoS-Setup-1.0.5.exe`). */
  name: string;
  /** SHA-256 du livrable (hexadécimal minuscule, 64 caractères). */
  sha256?: string;
  /** Taille en octets. */
  size?: number;
  /** URL de téléchargement directe (https). */
  downloadUrl?: string;
}

export interface UpdateManifest {
  /** Version du schéma du manifeste (1 = format actuel). */
  schema: number;
  /** Version de la suite (ADR-161 : version unique POS + Manager + Client). */
  suiteVersion: string;
  /** `versionCode` Android (strictement croissant) — pour le client. */
  androidVersionCode?: number;
  /** Horodatage ISO de publication. */
  publishedAt?: string;
  /** Notes de version (texte court, affiché au propriétaire). */
  notes?: string;
  /** Page de release (https) ouverte dans le navigateur système. */
  releasePage?: string;
  /** Livrables publiés (clé → asset). */
  assets?: Record<string, UpdateManifestAsset>;
}

/** Version sémantique simplifiée : `X.Y.Z` (+ suffixe pré-release optionnel). */
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

interface ParsedVersion {
  numbers: [number, number, number];
  prerelease: string | null;
}

function parseVersion(version: string): ParsedVersion | null {
  const m = VERSION_RE.exec(version.trim());
  if (!m) return null;
  const numbers = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  return { numbers, prerelease: m[4] ?? null };
}

/**
 * Compare deux versions : -1 (a < b), 0 (égales), 1 (a > b).
 * Une version illisible ne vaut JAMAIS « plus récente » (comparaison neutre).
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    const na = pa.numbers[i] ?? 0;
    const nb = pb.numbers[i] ?? 0;
    if (na !== nb) return na > nb ? 1 : -1;
  }
  if (pa.prerelease === pb.prerelease) return 0;
  // Une version stable est TOUJOURS plus récente que sa pré-release.
  if (!pa.prerelease) return 1;
  if (!pb.prerelease) return -1;
  return pa.prerelease > pb.prerelease ? 1 : -1;
}

/** `true` si `latest` est strictement plus récente que `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

/**
 * URL de flux autorisée ? https + hôte de la liste ; en développement only,
 * la boucle locale est tolérée (serveur de test), jamais en paqueté.
 */
export function isAllowedFeedUrl(url: string, allowLoopback = false): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") {
    return ALLOWED_FEED_HOSTS.includes(parsed.hostname.toLowerCase());
  }
  if (allowLoopback && parsed.protocol === "http:") {
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  }
  return false;
}

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Valide un manifeste lu sur le réseau. Rejet ferme : un manifeste malformé
 * est traité comme « aucune information » (pas d'annonce, pas d'erreur).
 */
export function parseUpdateManifest(raw: unknown): UpdateManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj["schema"] !== 1) return null;
  const suiteVersion = obj["suiteVersion"];
  if (typeof suiteVersion !== "string" || !parseVersion(suiteVersion)) return null;

  const manifest: UpdateManifest = { schema: 1, suiteVersion };

  const code = obj["androidVersionCode"];
  if (typeof code === "number" && Number.isInteger(code) && code > 0) {
    manifest.androidVersionCode = code;
  }

  const publishedAt = obj["publishedAt"];
  if (typeof publishedAt === "string" && publishedAt.length <= 64) {
    manifest.publishedAt = publishedAt;
  }

  const notes = obj["notes"];
  if (typeof notes === "string" && notes.trim().length > 0 && notes.length <= 2000) {
    manifest.notes = notes.trim();
  }

  const releasePage = obj["releasePage"];
  if (typeof releasePage === "string" && releasePage.length <= 500) {
    manifest.releasePage = releasePage;
  }

  const assets = obj["assets"];
  if (typeof assets === "object" && assets !== null) {
    const parsedAssets: Record<string, UpdateManifestAsset> = {};
    for (const [key, value] of Object.entries(assets as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) continue;
      const asset = value as Record<string, unknown>;
      const name = asset["name"];
      if (typeof name !== "string" || name.length === 0 || name.length > 200) continue;
      if (name.includes("/") || name.includes("\\") || name.includes("..")) continue;
      const entry: UpdateManifestAsset = { name };
      const sha = asset["sha256"];
      if (typeof sha === "string" && SHA256_RE.test(sha)) entry.sha256 = sha;
      const size = asset["size"];
      if (typeof size === "number" && Number.isInteger(size) && size > 0) entry.size = size;
      const url = asset["downloadUrl"];
      if (typeof url === "string" && url.length <= 500) entry.downloadUrl = url;
      parsedAssets[key] = entry;
    }
    if (Object.keys(parsedAssets).length > 0) manifest.assets = parsedAssets;
  }

  return manifest;
}

/** `fetch` injectable (même contrat que l'API client Android). */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Lit le manifeste. Toute anomalie (réseau, HTTP, JSON, schéma) → `null`
 * (silencieux) : la détection d'une mise à jour ne doit JAMAIS bruiter.
 */
export async function fetchUpdateManifest(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs = 8000,
): Promise<UpdateManifest | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const raw = await res.json();
    return parseUpdateManifest(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
