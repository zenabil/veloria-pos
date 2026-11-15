// Veloria PoS — Electron: détection automatique d'une version plus récente.
//
// ADR-186 — RÔGLES (inviolables) :
//   1. LECTURE SEULE : on lit un manifeste JSON publié en asset de release.
//   2. L'APPLICATION N'INSTALLE JAMAIS : pas de téléchargement d'exécutable,
//      pas de `quitAndInstall`, pas d'écriture dans le dossier d'installation.
//      Elle annonce la version et ouvre la page de release dans le navigateur
//      du système. La décision d'installer reste celle du propriétaire.
//   3. SILENCIEUX : hors ligne, manifeste invalide ou serveur injoignable =>
//      aucun message à la caisse, une seule ligne de journal.
//   4. HÔTES RESTREINTS : https + liste blanche (voir `update-feed.ts`).
//
// L'URL du manifeste est vide tant que le dépôt distant n'existe pas : la
// fonction est alors DÉSACTIVÉE (fail-closed, aucun réseau inutile).

import { app, shell } from "electron";
import { log } from "./logger";
import {
  fetchUpdateManifest,
  isAllowedFeedUrl,
  isNewerVersion,
  type FetchLike,
  type UpdateManifest,
} from "./update-feed";

/** Variable d'environnement pilotant l'URL du manifeste (tests, build). */
export const UPDATE_MANIFEST_URL_ENV = "VELORIA_UPDATE_MANIFEST_URL";

/**
 * URL par défaut du manifeste.
 *
 * Format : `https://github.com/<owner>/<repo>/releases/latest/download/update-manifest.json`
 * — URL FIXE : elle suit la dernière release publiée sans API GitHub (60
 * requêtes/h par IP : un parc de clients Android la saturerait).
 *
 * Elle est VIDE tant qu'aucun dépôt de distribution n'existe : la détection
 * est alors désactivée (fail-closed, aucun appel réseau inutile). La
 * variable d'environnement `VELORIA_UPDATE_MANIFEST_URL` permet de la
 * surcharger (tests, déploiementspilotes).
 */
export const DEFAULT_UPDATE_MANIFEST_URL =
  "https://github.com/zenabil/veloria-pos/releases/latest/download/update-manifest.json";

/** Durée de validité d'une lecture (pas de fetch à chaque affichage). */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Rafraîchissement périodique en arrière-plan. */
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

export interface UpdateStatus {
  /** Le flux est-il configuré ? (sinon : rien à annoncer) */
  enabled: boolean;
  /** Une version strictement plus récente existe-t-elle ? */
  available: boolean;
  /** Version de l'application en cours d'exécution. */
  currentVersion: string;
  /** Version annoncée par le manifeste (si lisible). */
  latestVersion?: string;
  /** Notes de version (si publiées). */
  notes?: string;
  /** Date de la dernière lecture (epoch ms). */
  checkedAt: number;
  /** La dernière lecture a-t-elle échoué ? (l'UI reste silencieuse). */
  failed: boolean;
}

let cache: { at: number; manifest: UpdateManifest | null; failed: boolean } | null = null;
let watcher: ReturnType<typeof setInterval> | null = null;

/** URL de flux autorisée, ou `null` si la détection est désactivée. */
export function getUpdateManifestUrl(): string | null {
  const raw = (process.env[UPDATE_MANIFEST_URL_ENV] ?? DEFAULT_UPDATE_MANIFEST_URL).trim();
  if (raw === "") return null;
  // En paqueté, la boucle locale n'est jamais autorisée (production = GitHub).
  return isAllowedFeedUrl(raw, !app.isPackaged) ? raw : null;
}

/** `fetch` lu À L'APPEL (jamais capturé au chargement du module) : les
 *  tests remplacent le global, et un `fetch` absent doit rester détectable. */
const globalFetch = (): FetchLike | undefined => globalThis.fetch;

async function readManifest(
  force: boolean,
): Promise<{ manifest: UpdateManifest | null; failed: boolean }> {
  const url = getUpdateManifestUrl();
  if (!url) return { manifest: null, failed: false };
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { manifest: cache.manifest, failed: cache.failed };
  }
  const fetchImpl = globalFetch();
  if (!fetchImpl) {
    cache = { at: Date.now(), manifest: null, failed: true };
    return { manifest: null, failed: true };
  }
  const manifest = await fetchUpdateManifest(url, fetchImpl);
  const failed = manifest === null;
  cache = { at: Date.now(), manifest, failed };
  if (failed) {
    log("WARN", "update", "update.check_failed", { host: hostOf(url) });
  } else {
    log("INFO", "update", "update.check_ok", { version: manifest.suiteVersion });
  }
  return { manifest, failed };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

/** État de la mise à jour, destiné au propriétaire (écran « À propos »). */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  const currentVersion = app.getVersion();
  const url = getUpdateManifestUrl();
  if (!url) {
    return {
      enabled: false,
      available: false,
      currentVersion,
      checkedAt: Date.now(),
      failed: false,
    };
  }
  const { manifest, failed } = await readManifest(false);
  const latestVersion = manifest?.suiteVersion;
  const available = latestVersion != null && isNewerVersion(latestVersion, currentVersion);
  return {
    enabled: true,
    available,
    currentVersion,
    ...(latestVersion ? { latestVersion } : {}),
    ...(available && manifest?.notes ? { notes: manifest.notes } : {}),
    checkedAt: Date.now(),
    failed,
  };
}

/**
 * Ouvre la page de release dans le navigateur du système.
 * L'URL vient du manifeste lu par le processus principal (JAMAIS du renderer)
 * et est filtrée par la liste blanche : `openExternal` n'ouvre que du https.
 */
export async function openUpdatePage(): Promise<{ opened: boolean; message?: string }> {
  const { manifest } = await readManifest(true);
  const page = manifest?.releasePage;
  if (!page || !isAllowedFeedUrl(page, false)) {
    return { opened: false, message: "Page de mise à jour indisponible." };
  }
  await shell.openExternal(page);
  log("INFO", "update", "update.page_opened", { host: hostOf(page) });
  return { opened: true };
}

/**
 * Vérification périodique en arrière-plan (démarrage + intervalle).
 * Jamais bloquante pour la caisse : aucun `await` sur le chemin critique.
 */
export function startUpdateWatcher(): void {
  if (watcher) return;
  void readManifest(true);
  watcher = setInterval(() => {
    void readManifest(true);
  }, REFRESH_INTERVAL_MS);
  watcher.unref();
}

/** Réinitialise le cache (tests / reprise manuelle). */
export function resetUpdateCache(): void {
  cache = null;
}
