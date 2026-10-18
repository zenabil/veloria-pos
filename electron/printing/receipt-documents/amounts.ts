// Veloria PoS — Documents purs : montants en lettres, TVA, QR, timbre (zero import).

// ---------------------------------------------------------------------------
// Montant en lettres (français standard : 70-99, cents, mille invariable).
// ---------------------------------------------------------------------------

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
];

const TENS = [
  "",
  "",
  "vingt",
  "trente",
  "quarante",
  "cinquante",
  "soixante",
  "soixante",
  "quatre-vingt",
  "quatre-vingt",
];

function underHundred(n: number): string {
  if (n < 20) return UNITS[n] as string;
  const ten = Math.floor(n / 10);
  const rest = n % 10;
  if (ten === 7 || ten === 9) {
    // 70-79 = soixante + 10-19 ; 90-99 = quatre-vingt + 10-19.
    const base = ten === 7 ? "soixante" : "quatre-vingt";
    if (rest === 1 && ten === 7) return `${base} et onze`;
    return `${base}-${UNITS[10 + rest] as string}`;
  }
  const word = TENS[ten] as string;
  if (rest === 0) return ten === 8 ? "quatre-vingts" : word;
  if (rest === 1 && ten !== 8) return `${word} et un`;
  return `${word}-${UNITS[rest] as string}`;
}

function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let head = "";
  if (hundreds > 0) {
    head = hundreds === 1 ? "cent" : `${UNITS[hundreds] as string} cent`;
    if (rest === 0 && hundreds > 1) head += "s";
  }
  if (rest === 0) return head;
  const tail = underHundred(rest);
  return head === "" ? tail : `${head} ${tail}`;
}

function integerInWords(n: number): string {
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (billions > 0) parts.push(`${underThousand(billions)} milliard${billions > 1 ? "s" : ""}`);
  if (millions > 0) parts.push(`${underThousand(millions)} million${millions > 1 ? "s" : ""}`);
  if (thousands > 0) parts.push(thousands === 1 ? "mille" : `${underThousand(thousands)} mille`);
  if (rest > 0) parts.push(underThousand(rest));
  return parts.join(" ");
}

/** « Mille quatre cent quatre-vingt-cinq dinars algériens » (+ centimes). */
export function amountInWordsFr(totalMinor: number): string {
  const safe = Number.isInteger(totalMinor) && totalMinor >= 0 ? totalMinor : 0;
  const dinars = Math.floor(safe / 100);
  const centimes = safe % 100;
  const words = integerInWords(dinars);
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  const dinarWord = dinars <= 1 ? "dinar algérien" : "dinars algériens";
  if (centimes === 0) return `${capitalized} ${dinarWord}.`;
  return `${capitalized} ${dinarWord} et ${centimes} centimes.`;
}

// ---------------------------------------------------------------------------
// TVA (centimes, sans float) + QR déterministe. TVA = 0 → ventilation masquée
// (compatibilité historique : aucun changement de rendu quand pas de TVA).
// ---------------------------------------------------------------------------

/** Ventilation HT/TVA depuis un TTC et un taux % (entiers centimes). */
export function tvaBreakdown(
  totalMinor: number,
  ratePercent: number,
): { htMinor: number; tvaMinor: number } {
  const safe = Number.isInteger(totalMinor) && totalMinor >= 0 ? totalMinor : 0;
  const rate = typeof ratePercent === "number" && Number.isFinite(ratePercent) ? ratePercent : 0;
  if (rate <= 0) return { htMinor: 0, tvaMinor: 0 };
  const clamped = Math.min(100, Math.max(0, rate));
  const htMinor = Math.round((safe * 100) / (100 + clamped));
  return { htMinor, tvaMinor: safe - htMinor };
}

/** Charge QR déterministe : `VELORIA|N°|TTC|DATE|RC|NIF|NIS|VENDEUR`. */
export function buildQrPayload(d: {
  invoice: string;
  totalMinor: number;
  date: string;
  companyRc: string;
  companyNif: string;
  companyNis?: string | undefined;
  seller?: string | undefined;
}): string {
  const clean = (v: string): string => v.replace(/\|/g, "/").slice(0, 60);
  const seller = typeof d.seller === "string" ? d.seller : "";
  const nis = typeof d.companyNis === "string" ? d.companyNis : "";
  return `VELORIA|${clean(d.invoice || "")}|${Number.isInteger(d.totalMinor) ? d.totalMinor : 0}|${clean(d.date || "")}|${clean(d.companyRc || "")}|${clean(d.companyNif || "")}|${clean(nis)}|${clean(seller)}`;
}

// ---------------------------------------------------------------------------
// Format monétaire FR depuis des centimes ENTIERS (jamais de float `m/100` :
// au-delà de 2^53 le centime serait perdu — voir src/domain/money/money.ts).
// Source unique de tous les documents (A4 + thermiques) : `fmtDzd`
// (chrome.ts) et les rendus thermiques délèguent ici.
// ---------------------------------------------------------------------------

const GROUP_FR = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** `123456` → `1 234,56 DA` (signe préservé, non-fini → `0,00 DA`). */
export function formatMinorDa(m: number): string {
  const rounded = typeof m === "number" && Number.isFinite(m) ? Math.round(m) : 0;
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const dinars = Math.trunc(abs / 100);
  const centimes = abs % 100;
  return `${sign}${GROUP_FR.format(dinars)},${String(centimes).padStart(2, "0")} DA`;
}

// ---------------------------------------------------------------------------
// C5 : timbre de quittance LF 2025 — MIROIR de `src/domain/invoice/
// timbre-rules.ts` (electron ne peut pas importer src/ : rootDir — même
// convention que validators/fifo). Toute modification ici doit être
// répercutée là-bas (test de parité : tests/unit/c5-timbre-thermal.test.ts).
// ---------------------------------------------------------------------------

/** Timbre LF 2025 en centimes (0 = non applicable). Miroir du domaine. */
export function timbreQuittanceLf2025(totalMinor: number, method: string | null): number {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) return 0;
  if (method !== "cash") return 0;
  // Seuils en CENTIMES (pas de float) : 300 DA = 30 000, 30 000 DA = 3 000 000,
  // 100 000 DA = 10 000 000. Miroir de src/domain/invoice/timbre-rules.ts.
  if (totalMinor <= 30_000) return 0;
  const n = Math.ceil(totalMinor / 10_000);
  const rate = totalMinor <= 3_000_000 ? 100 : totalMinor <= 10_000_000 ? 150 : 200;
  return Math.max(500, n * rate);
}
