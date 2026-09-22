// Veloria PoS — Electron OCR: moteur local Tesseract (zéro réseau).
// WASM embarqué (tesseract.js, licence Apache-2.0), données linguistiques
// livrées avec l'application (resources/ocr/lang). Aucune requête HTTP :
// langPath local + gzip:false (pas de téléchargement CDN).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export const OCR_LANG_DIR_DEV = path.join("resources", "ocr", "lang");
export const OCR_TIMEOUT_MS = 180_000;

/** Langues embarquées : toute autre valeur = erreur FR explicite. */
export function ocrLangDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "ocr", "lang");
  return path.join(process.cwd(), OCR_LANG_DIR_DEV);
}

export function assertOcrLanguagesAvailable(langs: readonly string[]): void {
  const dir = ocrLangDir();
  for (const lang of langs) {
    const file = path.join(dir, `${lang}.traineddata`);
    let ok = false;
    try {
      ok = fs.statSync(file).isFile();
    } catch {
      ok = false;
    }
    if (!ok) {
      if (lang === "ara") {
        throw new Error(
          "Langue arabe non installée dans cette version (français + anglais inclus).",
        );
      }
      throw new Error("Données OCR manquantes : réinstallez Veloria PoS.");
    }
  }
}

/**
 * Chemin worker explicite en mode empaqueté : les worker_threads Node ne
 * chargent pas depuis l'archive asar (fichiers dépaquetés via asarUnpack).
 */
function tesseractWorkerPath(): string | undefined {
  if (!app.isPackaged) return undefined;
  return path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "tesseract.js",
    "src",
    "worker-script",
    "node",
    "index.js",
  );
}

export interface OcrEngineHooks {
  onProgress: (ratio: number) => void;
  registerWorker: (terminate: () => Promise<unknown>) => void;
}

type TessWorker = {
  recognize: (
    image: string,
    options?: Record<string, unknown>,
  ) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

/** Reconnaissance d'une image PNG/JPEG normalisée. Lève des messages FR. */
export async function recognizeImage(
  imagePath: string,
  langs: readonly string[],
  hooks: OcrEngineHooks,
): Promise<{ text: string; confidence: number }> {
  assertOcrLanguagesAvailable(langs);
  let tess: {
    createWorker: (
      langs: string,
      oem: number,
      options?: Record<string, unknown>,
    ) => Promise<TessWorker>;
    OEM: { LSTM_ONLY: number };
  };
  try {
    tess = (await import("tesseract.js")) as unknown as {
      createWorker: (
        langs: string,
        oem: number,
        options?: Record<string, unknown>,
      ) => Promise<TessWorker>;
      OEM: { LSTM_ONLY: number };
    };
  } catch {
    throw new Error("Moteur OCR indisponible : réinstallez Veloria PoS.");
  }
  const workerPath = tesseractWorkerPath();
  let worker: TessWorker | null = null;
  try {
    worker = await tess.createWorker(langs.join("+"), tess.OEM.LSTM_ONLY, {
      langPath: ocrLangDir(),
      gzip: false,
      ...(workerPath ? { workerPath } : {}),
      logger: (m: { status?: unknown; progress?: unknown }) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          hooks.onProgress(Math.min(1, Math.max(0, m.progress)));
        }
      },
    });
  } catch {
    throw new Error("Initialisation OCR impossible (données locales illisibles).");
  }
  const current = worker;
  hooks.registerWorker(() => current.terminate());
  const state: { timer?: ReturnType<typeof setTimeout> } = {};
  const timeout = new Promise<never>((_, reject) => {
    state.timer = setTimeout(() => reject(new Error("OCR_TIMEOUT")), OCR_TIMEOUT_MS);
    state.timer.unref();
  });
  try {
    const res = (await Promise.race([current.recognize(imagePath), timeout])) as {
      data: { text: string; confidence: number };
    };
    return { text: res.data.text, confidence: Number(res.data.confidence) };
  } catch (err) {
    if (err instanceof Error && err.message === "OCR_TIMEOUT") {
      throw new Error("Analyse trop longue : image illisible ou trop lourde.");
    }
    throw new Error("Échec de la reconnaissance du texte.");
  } finally {
    if (state.timer !== undefined) clearTimeout(state.timer);
    try {
      await current.terminate();
    } catch {
      /* meilleur effort */
    }
  }
}
