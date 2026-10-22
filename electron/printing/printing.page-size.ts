// Veloria PoS — Electron : format de page RÉEL des tickets thermiques.
//
// Le ticket n'imposait aucun `pageSize` : Chromium imprimait au format par
// défaut du pilote (A4 / 297 mm sur la plupart des pilotes thermiques) alors
// que le contenu du ticket se TERMINE par le bloc codes (code-barres + QR) ⇒
// le rouleau sortait avec un grand blanc après le code-barres (constat
// propriétaire 2026-10-22). Le seul chemin qui imposait déjà des microns
// exacts était celui des étiquettes (`labelPageMicrons`).
//
// Politique opération → format (ADR-117) : la largeur est celle du papier
// (58/80 mm) et la hauteur est celle du CONTENU mesuré dans la fenêtre
// d'impression cachée — 1 ticket = 1 page = 1 avance papier, sans blanc.

import type { ThermalWidth } from "./receipt-documents";

/** 1 px CSS = 25,4/96 mm = 264,583 µm (Electron attend des microns). */
const CSS_PX_MICRONS = 264.583;

/** 25 400 µm = 1 pouce : unité attendue par `webContents.printToPDF`. */
const MICRONS_PER_INCH = 25_400;

/** Conversion microns → pouces (pageSize/marges de `printToPDF`). */
export function micronsToInches(microns: number): number {
  return microns / MICRONS_PER_INCH;
}

const PAPER_MICRONS: Record<ThermalWidth, number> = { "58mm": 58_000, "80mm": 80_000 };

/** Marge d'avance/coupe ajoutée à la hauteur du contenu (3 mm). */
const CUT_MARGIN_MICRONS = 3_000;

/** Plancher de hauteur (30 mm) : jamais de page dégénérée. */
const MIN_HEIGHT_MICRONS = 30_000;

/** Fenêtre d'impression minimale attendue (webContents Electron). */
export interface MeasurableContents {
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
}

/**
 * Taille de page d'un ticket : largeur du papier + hauteur du contenu mesuré.
 * `contentPx` = hauteur réelle du document imprimé (px CSS).
 */
export function thermalPageSize(
  width: ThermalWidth,
  contentPx: number,
): { width: number; height: number } {
  const px = Number.isFinite(contentPx) && contentPx > 0 ? contentPx : 0;
  const height = Math.round(px * CSS_PX_MICRONS) + CUT_MARGIN_MICRONS;
  return { width: PAPER_MICRONS[width], height: Math.max(MIN_HEIGHT_MICRONS, height) };
}

/**
 * Hauteur du contenu imprimé (px CSS) : bas réel du contenu + marges du document.
 *
 * On n'utilise VOLONTAIREMENT ni `document.body.scrollHeight` ni
 * `documentElement.scrollHeight` : quand le ticket est plus court que la fenêtre
 * d'impression, ils renvoient la hauteur de la FENÊTRE (600 px) et la page
 * garderait un grand blanc — exactement le défaut corrigé.
 */
const CONTENT_HEIGHT_JS = `(() => {
  const body = document.body;
  if (!body) return 0;
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  // Bas RÉEL du contenu = plus bas enfant du body. En mode quirks (HTML sans
  // <!doctype>, cas des tickets) le body est étiré à la hauteur de la fenêtre :
  // sa boîte ne dit rien de la hauteur du contenu.
  let bottom = 0;
  for (const el of body.children) {
    const r = el.getBoundingClientRect();
    if (r.bottom > bottom) bottom = r.bottom;
  }
  if (!bottom) bottom = body.getBoundingClientRect().bottom;
  const bs = getComputedStyle(body);
  const hs = getComputedStyle(document.documentElement);
  return Math.ceil(bottom + num(bs.marginBottom) + num(hs.marginBottom));
})()`;

/**
 * Hauteur réelle du document (px CSS) telle qu'elle sera imprimée.
 * Le contenu thermique est à largeur fixe (200/280 px) : la mesure ne dépend
 * pas de la taille de la fenêtre. 0 = mesure impossible (l'appelant garde
 * alors le comportement historique, jamais de page tronquée).
 */
export async function measureContentPx(contents: MeasurableContents): Promise<number> {
  try {
    const raw = await contents.executeJavaScript(CONTENT_HEIGHT_JS, true);
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}
