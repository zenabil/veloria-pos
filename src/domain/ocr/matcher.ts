// Veloria PoS — Domain OCR: rapprochement produit (100 % local).
// Priorité : code-barres exact → référence exacte → nom normalisé → flou.
// Le nom d'origine n'est JAMAIS réécrit en base ; le score n'écrit jamais.

import type { OcrConfidence, OcrMatch, OcrMatchCandidate, OcrMatchKind } from "./types.ts";

/**
 * Normalisation : minuscules, sans accents (latins + arabes/tachkîl),
 * chiffres arabes → 0-9, « 1 L » → « 1l », ponctuation → espace.
 * L'arabe (U+0600–U+06FF) est PRÉSERVÉ : le détruire rend tout rapprochement
 * de nom arabe impossible (marché DZ).
 */
export function normalizeProductName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/(\d)\s+([a-z]{1,3}\b|[\u0600-\u06FF]{1,4})/g, "$1$2")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return s.split(" ").filter((t) => t.length > 0);
}

/** Dice sur multi-ensembles de tokens (0–1). */
export function tokenDice(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of ta) counts.set(t, (counts.get(t) ?? 0) + 1);
  let common = 0;
  for (const t of tb) {
    const left = counts.get(t) ?? 0;
    if (left > 0) {
      common += 1;
      counts.set(t, left - 1);
    }
  }
  return (2 * common) / (ta.length + tb.length);
}

function bigrams(s: string): Set<string> {
  const compact = s.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 1 < compact.length; i++) out.add(compact.slice(i, i + 2));
  return out;
}

/** Dice sur bigrammes (filet de sécurité des fautes de frappe). */
export function bigramDice(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let common = 0;
  for (const g of ga) if (gb.has(g)) common += 1;
  return (2 * common) / (ga.size + gb.size);
}

function scoreOf(query: string, candidate: string): number {
  if (query.length === 0 || candidate.length === 0) return 0;
  const token = tokenDice(query, candidate);
  if (token >= 0.5) return token;
  return bigramDice(query, candidate) * 0.9;
}

function confidenceFor(kind: OcrMatchKind, score: number): OcrConfidence {
  if (kind === "barcode" || kind === "exact" || kind === "normalized") return "high";
  if (kind === "fuzzy" && score >= 0.6) return "medium";
  return "low";
}

/**
 * Meilleure correspondance NOM parmi des candidats (recherche SQLite faite par
 * l'appelant). Barcodes traités à part via `products.getByBarcode`.
 */
export function matchByName(ocrName: string, candidates: OcrMatchCandidate[]): OcrMatch {
  const query = normalizeProductName(ocrName);
  if (query.length < 2 || candidates.length === 0) {
    return { kind: "none", product: null, score: 0, confidence: "low" };
  }
  let best: OcrMatchCandidate | null = null;
  let bestScore = 0;
  let bestKind: OcrMatchKind = "none";
  for (const c of candidates) {
    // Référence exacte insensible à la casse/espaces simples — AVANT le
    // filtre de longueur pour que les noms courts exacts correspondent.
    if (c.name.trim().toLowerCase() === ocrName.trim().toLowerCase()) {
      return { kind: "exact", product: c, score: 1, confidence: "high" };
    }
    const candNorm = normalizeProductName(c.name);
    if (candNorm.length < 2) continue;
    if (candNorm === query) {
      return { kind: "normalized", product: c, score: 1, confidence: "high" };
    }
    const s = scoreOf(query, candNorm);
    if (s > bestScore) {
      bestScore = s;
      best = c;
      bestKind = "fuzzy";
    }
  }
  if (best === null || bestScore < 0.45) {
    return { kind: "none", product: null, score: bestScore, confidence: "low" };
  }
  return {
    kind: bestKind,
    product: best,
    score: bestScore,
    confidence: confidenceFor(bestKind, bestScore),
  };
}

/** Libellé FR du niveau de confiance (affichage uniquement). */
export function confidenceLabelFr(c: OcrConfidence): string {
  if (c === "high") return "Élevée";
  if (c === "medium") return "Moyenne";
  return "Faible";
}
