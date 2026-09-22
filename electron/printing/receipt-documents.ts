// Veloria PoS — Documents d'impression purs (zéro import : testables en vitest).
// Source unique du ticket 80mm, de la facture A4 et du proforma (déterministes,
// français). Les handlers Electron (printing.service) ne font que valider +
// injecter le logo + imprimer. Maquettes : wireframes A4 / 80mm / proforma.

export interface ReceiptLine {
  name: string;
  qty: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** Référence imprimée (code-barres ou identifiant paddé, « — » sinon). */
  ref?: string | undefined;
}

export interface ReceiptData {
  company: string;
  companyPhone: string;
  companyAddress: string;
  companyCity: string;
  companyEmail: string;
  companyRc: string;
  companyNif: string;
  /** Logo en data URL (injecté côté main), absent = aucun bloc logo. */
  companyLogo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCode: string;
  paymentMethod: string;
  dueDate: string;
  notes: string;
  invoice: string;
  date: string;
  lines: ReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  paidMinor: number;
  prevBalanceMinor?: number | undefined;
  currentBalanceMinor?: number | undefined;
  /** Pied de page / remerciement personnalisés (paramètres) ; vide = défaut. */
  footerText: string;
  thankYouMessage: string;
}

interface PrintReceiptPayload {
  company?: unknown;
  companyPhone?: unknown;
  companyAddress?: unknown;
  companyCity?: unknown;
  companyEmail?: unknown;
  companyRc?: unknown;
  companyNif?: unknown;
  companyLogo?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  customerAddress?: unknown;
  customerCode?: unknown;
  paymentMethod?: unknown;
  dueDate?: unknown;
  notes?: unknown;
  footerText?: unknown;
  thankYouMessage?: unknown;
  invoice?: unknown;
  date?: unknown;
  lines?: unknown;
  subtotalMinor?: unknown;
  discountMinor?: unknown;
  deliveryMinor?: unknown;
  totalMinor?: unknown;
  paidMinor?: unknown;
  prevBalanceMinor?: unknown;
  currentBalanceMinor?: unknown;
}

/** « CL-00125 » (dérivé de l'id : aucun code stocké en base). */
export function formatCustomerCode(id: number): string {
  if (!Number.isInteger(id) || id <= 0) return "—";
  return `CL-${String(id).padStart(5, "0")}`;
}

/** Référence ligne : identifiant paddé, « — » pour les lignes libres. */
export function formatProductRef(productId: number | null | undefined): string {
  if (!Number.isInteger(productId) || (productId as number) <= 0) return "—";
  return String(productId).padStart(5, "0");
}

/** Libellé mode de paiement côté ticket (vide → "" pour masquer la ligne).
 * P03: miroir de shared/formatters (vide → "—" en UI) — mappings identiques. */
export function paymentMethodLabel(method: string): string {
  if (method === "cash") return "Espèces";
  if (method === "cheque") return "Chèque";
  if (method === "transfer") return "Virement";
  return "";
}

// ---------------------------------------------------------------------------
// Code-barres Code 39 (SVG pur, sans dépendance) : numéros de facture/devis
// scannables vers la recherche. Alphabet : 0-9 A-Z et `- . $ / + % espace`.
// Chaque caractère = 9 modules (barre/espace alternés) dont exactement 3 larges.
// ---------------------------------------------------------------------------

/** Motifs Code 39 : 9 largeurs (n = étroit, w = large), positions paires = barres.
 * Vérifiés contre JsBarcode (MIT) + équations ISO 16388 (2 barres larges +
 * 1 espace large par caractère) ; testés exhaustivement (structure + A/P/0). */
export const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

/** Normalise pour Code 39 (majuscules, alphabet supporté) ; « » si vide. */
export function sanitizeCode39(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => Object.prototype.hasOwnProperty.call(CODE39_PATTERNS, c))
    .join("");
}

/** SVG Code 39 (début/fin `*`, texte lisible) ; « » si rien d'encodable. */
export function code39Svg(raw: string, height = 46): string {
  const text = sanitizeCode39(raw);
  if (!text) return "";
  const narrow = 2;
  const wide = narrow * 2 + 1;
  const gap = narrow;
  let x = 0;
  let rects = "";
  const full = `*${text}*`;
  for (const ch of full) {
    const pattern = CODE39_PATTERNS[ch] as string;
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === "w" ? wide : narrow;
      if (i % 2 === 0) {
        rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#111"/>`;
      }
      x += w;
    }
    x += gap;
  }
  const width = x - gap;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 16}" width="${width}" height="${height + 16}" role="img" aria-label="Code-barres ${escapeHtml(text)}">${rects}<text x="${width / 2}" y="${height + 13}" text-anchor="middle" font-family="monospace" font-size="12" fill="#111">${escapeHtml(text)}</text></svg>`;
}

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

export function buildReceiptText(d: ReceiptData): string {
  const fmt = (m: number): string =>
    `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(m / 100)} DA`;
  const out: string[] = [];
  out.push(`*** ${d.company} ***`);
  if (d.companyAddress || d.companyCity) {
    out.push([d.companyAddress, d.companyCity].filter(Boolean).join(" – "));
  }
  if (d.companyPhone) out.push(`Tél: ${d.companyPhone}`);
  out.push(`==================`);
  out.push(`  TICKET DE CAISSE`);
  out.push(`==================`);
  out.push(`N° : ${d.invoice}`);
  out.push(`Date : ${d.date}`);
  if (d.customerName) out.push(`Client : ${d.customerName}`);
  out.push(`--------------------------------`);
  out.push(`PRODUIT      QTÉ  P.U.   TOTAL`);
  out.push(`--------------------------------`);
  for (const l of d.lines) {
    out.push(`${l.name}  ${l.qty}  ${fmt(l.unitPriceMinor)}  ${fmt(l.lineTotalMinor)}`);
  }
  out.push(`--------------------------------`);
  out.push(`Sous-total            ${fmt(d.subtotalMinor)}`);
  out.push(`Remise                    ${fmt(d.discountMinor)}`);
  if (d.deliveryMinor > 0) out.push(`Livraison                 ${fmt(d.deliveryMinor)}`);
  out.push(``);
  out.push(`TOTAL                 ${fmt(d.totalMinor)}`);
  out.push(``);
  out.push(`Payé                   ${fmt(d.paidMinor)}`);
  const change = d.paidMinor - d.totalMinor;
  const remaining = d.totalMinor - d.paidMinor;
  if (remaining > 0) out.push(`Reste (crédit)            ${fmt(remaining)}`);
  else if (change > 0) out.push(`Monnaie rendue           ${fmt(change)}`);
  if (d.dueDate) out.push(`Échéance : ${d.dueDate}`);
  if (d.prevBalanceMinor != null) out.push(`Ancien solde             ${fmt(d.prevBalanceMinor)}`);
  if (d.currentBalanceMinor != null)
    out.push(`Solde actuel             ${fmt(d.currentBalanceMinor)}`);
  const method = paymentMethodLabel(d.paymentMethod);
  if (method) out.push(`Mode : ${method.toUpperCase()}`);
  out.push(`--------------------------------`);
  if (d.thankYouMessage) out.push(d.thankYouMessage);
  else {
    out.push(`Merci pour votre achat`);
    out.push(`À bientôt !`);
  }
  out.push(`----------------`);
  out.push(`Veloria POS`);
  return out.join("\n");
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function toReceiptData(raw: unknown): ReceiptData {
  const payload: PrintReceiptPayload =
    typeof raw === "object" && raw !== null ? (raw as PrintReceiptPayload) : {};
  return {
    company: textOf(payload.company) || "Veloria",
    companyPhone: textOf(payload.companyPhone),
    companyAddress: textOf(payload.companyAddress),
    companyCity: textOf(payload.companyCity),
    companyEmail: textOf(payload.companyEmail),
    companyRc: textOf(payload.companyRc),
    companyNif: textOf(payload.companyNif),
    companyLogo: textOf(payload.companyLogo),
    customerName: textOf(payload.customerName),
    customerPhone: textOf(payload.customerPhone),
    customerAddress: textOf(payload.customerAddress),
    customerCode: textOf(payload.customerCode),
    paymentMethod: textOf(payload.paymentMethod),
    dueDate: textOf(payload.dueDate),
    notes: textOf(payload.notes),
    footerText: textOf(payload.footerText),
    thankYouMessage: textOf(payload.thankYouMessage),
    invoice: textOf(payload.invoice),
    date: textOf(payload.date) || new Date().toLocaleString("fr-FR"),
    lines: toReceiptLines(payload.lines),
    subtotalMinor: toNumberOr(payload.subtotalMinor, 0),
    discountMinor: toNumberOr(payload.discountMinor, 0),
    deliveryMinor: toNumberOr(payload.deliveryMinor, 0),
    totalMinor: toNumberOr(payload.totalMinor, 0),
    paidMinor: toNumberOr(payload.paidMinor, 0),
    prevBalanceMinor: toOptionalNumber(payload.prevBalanceMinor),
    currentBalanceMinor: toOptionalNumber(payload.currentBalanceMinor),
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Échappement texte brut pour conteneur HTML (ticket thermique <pre>) :
 * source centrale unique (P28) — buildReceiptText étant du texte non échappé,
 * thermalHtml passe par ici au lieu d'un replace partiel.
 */
export function escapePreText(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function fmtDzd(m: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(m / 100)} DA`;
}

interface CompanyHead {
  company: string;
  companyPhone: string;
  companyAddress: string;
  companyCity: string;
  companyEmail: string;
  companyLogo?: string | undefined;
}

function companyHead(d: CompanyHead, title: string, metaRows: string): string {
  const logo =
    d.companyLogo != null && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d.companyLogo)
      ? `<img src="${escapeHtml(d.companyLogo)}" alt="Logo" style="max-height:64px;max-width:160px;object-fit:contain" />`
      : "";
  const lines = [d.companyAddress, d.companyCity].filter(Boolean).join(" – ");
  return `<div class="head"><div class="brand">${logo}<div><h1>${escapeHtml(d.company)}</h1>
<div class="muted">${escapeHtml(lines)}</div>
${d.companyPhone ? `<div class="muted">Tél: ${escapeHtml(d.companyPhone)}</div>` : ""}
${d.companyEmail ? `<div class="muted">Email: ${escapeHtml(d.companyEmail)}</div>` : ""}
</div></div>
<div class="docbox"><h1>${title}</h1>${metaRows}</div></div>`;
}

/** Bloc barcode pour cartouche (vide si rien d'encodable). */
function barcodeBlock(value: string): string {
  const svg = code39Svg(value);
  return svg ? `<div class="barcode">${svg}</div>` : "";
}

function legalFooter(d: {
  company: string;
  companyAddress: string;
  companyPhone: string;
  companyRc: string;
  companyNif: string;
  footerText: string;
}): string {
  const legal = [
    d.companyRc ? `RC : ${d.companyRc}` : "",
    d.companyNif ? `NIF : ${d.companyNif}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const contact = [d.company, d.companyAddress, d.companyPhone].filter(Boolean).join(" • ");
  const custom = d.footerText ? `<br>${escapeHtml(d.footerText)}` : "";
  return `<div class="pagefoot">${escapeHtml(contact)}${legal ? `<br>${escapeHtml(legal)}` : ""}${custom}<br>Page 1 / 1</div>`;
}

/** Facture A4 (maquette : en-tête, client, lignes avec Réf., totaux TTC, lettres, signatures). */
export function buildA4Html(d: ReceiptData): string {
  const rows = d.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.ref ?? "—")}</td><td>${escapeHtml(l.name)}</td>` +
        `<td class="num">${l.qty}</td><td class="num">${fmtDzd(l.unitPriceMinor)}</td>` +
        `<td class="num">${fmtDzd(l.lineTotalMinor)}</td></tr>`,
    )
    .join("");
  const remaining = d.totalMinor - d.paidMinor;
  const method = paymentMethodLabel(d.paymentMethod);
  const clientRows = [
    `<div><span class="lbl">Nom :</span> ${escapeHtml(d.customerName || "—")}</div>`,
    d.customerPhone
      ? `<div><span class="lbl">Téléphone :</span> ${escapeHtml(d.customerPhone)}</div>`
      : "",
    d.customerAddress
      ? `<div><span class="lbl">Adresse :</span> ${escapeHtml(d.customerAddress)}</div>`
      : "",
    d.customerCode
      ? `<div><span class="lbl">Code client :</span> ${escapeHtml(d.customerCode)}</div>`
      : "",
  ].join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Facture ${escapeHtml(d.invoice)}</title>
<style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;color:#111;font-size:13px}
h1{font-size:22px;margin:0}.brand{display:flex;gap:12px;align-items:flex-start}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.docbox{border:2px solid #111;padding:10px 14px;min-width:220px}
.docbox h1{font-size:20px;text-align:center;margin-bottom:6px}
.muted{color:#555;font-size:12px}.lbl{color:#555}
.client{border:1px solid #999;padding:10px 12px;margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
.client h2,.sect{grid-column:1/-1;font-size:13px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em}
table.items{width:100%;border-collapse:collapse}
.items th,.items td{border:1px solid #999;padding:6px 8px;text-align:left}
.items th{background:#eee}.num{text-align:right;white-space:nowrap}
.totals{margin-left:auto;width:300px;border-collapse:collapse}
.totals td{border:1px solid #999;padding:6px 8px}
.totals .nb{border:none}.grand{font-weight:bold;font-size:15px}
.barcode{margin-top:8px;text-align:center}.barcode svg{max-width:230px;height:auto}
.words{margin:12px 0}.signs{display:flex;gap:24px;margin-top:28px}
.signs div{flex:1;border:1px solid #999;min-height:90px;padding:8px;font-size:12px;color:#555}
.foot{margin-top:24px;text-align:center}.pagefoot{margin-top:24px;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#555;text-align:center}</style>
</head><body>
${companyHead(d, "FACTURE", `<div>N° : ${escapeHtml(d.invoice)}</div><div>Date : ${escapeHtml(d.date)}</div>${d.dueDate ? `<div>Échéance : ${escapeHtml(d.dueDate)}</div>` : ""}${barcodeBlock(d.invoice)}`)}
<div class="client"><h2>Client</h2>${clientRows}</div>
<table class="items"><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>Prix U.</th><th>Total</th></tr></thead>
<tbody>${rows}</tbody></table>
<table class="totals"><tbody>
<tr><td>Sous-total</td><td class="num">${fmtDzd(d.subtotalMinor)}</td></tr>
<tr><td>Remise</td><td class="num">${fmtDzd(d.discountMinor)}</td></tr>
<tr class="grand"><td>TOTAL TTC</td><td class="num">${fmtDzd(d.totalMinor)}</td></tr>
<tr><td>Payé</td><td class="num">${fmtDzd(d.paidMinor)}</td></tr>
<tr class="grand"><td>RESTE</td><td class="num">${fmtDzd(remaining)}</td></tr>
</tbody></table>
<div class="words">Montant en lettres : ${escapeHtml(amountInWordsFr(d.totalMinor))}</div>
${method ? `<div>Mode de paiement : ${escapeHtml(method)}</div>` : ""}
${d.notes ? `<div class="sect">Notes :</div><div>${escapeHtml(d.notes)}</div>` : ""}
<div class="foot">${escapeHtml(d.thankYouMessage || "Merci pour votre confiance")}</div>
<div class="signs"><div>Signature client</div><div>Signature / Cachet</div></div>
${legalFooter(d)}
</body></html>`;
}

function toNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toReceiptLines(value: unknown): ReceiptLine[] {
  if (!Array.isArray(value)) return [];
  const out: ReceiptLine[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r["name"] === "string" &&
      typeof r["qty"] === "number" &&
      typeof r["unitPriceMinor"] === "number" &&
      typeof r["lineTotalMinor"] === "number"
    ) {
      out.push({
        name: r["name"],
        qty: r["qty"],
        unit: typeof r["unit"] === "string" ? r["unit"] : "",
        unitPriceMinor: r["unitPriceMinor"],
        lineTotalMinor: r["lineTotalMinor"],
        ref: typeof r["ref"] === "string" ? r["ref"] : undefined,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rapports génériques : tableaux de bord validés (RP-*. schéma Zod).
// KPIs + graphiques barres SVG reconstruits côté main (déterministes).
// ---------------------------------------------------------------------------

export interface ReportKpi {
  label: string;
  value: string;
}

export interface ReportChart {
  title: string;
  labels: string[];
  values: number[];
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ReportData {
  title: string;
  period: string;
  company: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  tables: ReportTable[];
  footer: string;
}

function toStrArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, max);
}

export function toReportData(raw: unknown): ReportData {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
  const charts = Array.isArray(r["charts"]) ? r["charts"] : [];
  const tables = Array.isArray(r["tables"]) ? r["tables"] : [];
  const kpis = Array.isArray(r["kpis"]) ? r["kpis"] : [];
  return {
    title: str(r["title"], "Rapport"),
    period: str(r["period"]),
    company: str(r["company"], "Veloria"),
    kpis: kpis
      .filter((k): k is Record<string, unknown> => typeof k === "object" && k !== null)
      .slice(0, 12)
      .map((k) => ({ label: str(k["label"]), value: str(k["value"]) })),
    charts: charts
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .slice(0, 4)
      .map((c) => ({
        title: str(c["title"]),
        labels: toStrArray(c["labels"], 62),
        values: (Array.isArray(c["values"]) ? c["values"] : [])
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0)
          .slice(0, 62),
      })),
    tables: tables
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .slice(0, 10)
      .map((t) => ({
        title: str(t["title"]),
        headers: toStrArray(t["headers"], 8),
        rows: (Array.isArray(t["rows"]) ? t["rows"] : [])
          .slice(0, 200)
          .map((row) =>
            Array.isArray(row)
              ? row.filter((v): v is string => typeof v === "string").slice(0, 8)
              : [],
          ),
      })),
    footer: str(r["footer"]),
  };
}

function barChartSvg(title: string, labels: string[], values: number[]): string {
  if (labels.length === 0 || values.length === 0) return "";
  const w = 640;
  const h = 180;
  const pad = 28;
  const max = Math.max(1, ...values);
  const n = Math.min(labels.length, values.length);
  const slot = (w - pad * 2) / Math.max(1, n);
  const bw = Math.max(2, Math.min(28, slot * 0.55));
  let rects = "";
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    const bh = Math.max(1, Math.round(((h - pad * 2) * v) / max));
    const x = Math.round(pad + slot * i + (slot - bw) / 2);
    const y = h - pad - bh;
    rects += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#b45309"><title>${escapeHtml(labels[i] as string)} : ${v}</title></rect>`;
  }
  const step = Math.max(1, Math.ceil(n / 12));
  let ticks = "";
  for (let i = 0; i < n; i += step) {
    const x = Math.round(pad + slot * i + slot / 2);
    ticks += `<text x="${x}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#555">${escapeHtml((labels[i] as string).slice(-5))}</text>`;
  }
  return `<div class="chart"><div class="ctitle">${escapeHtml(title)}</div><svg viewBox="0 0 ${w} ${h}" width="100%" role="img"><line x1="${pad}" y1="${h - pad}" x2="${w - 8}" y2="${h - pad}" stroke="#999"/>${rects}${ticks}</svg></div>`;
}

/** Rapport A4 : KPIs + graphiques + tableaux (une seule source déterministe). */
export function buildReportHtml(d: ReportData): string {
  const kpis =
    d.kpis.length > 0
      ? `<div class="kpis">${d.kpis.map((k) => `<div class="kpi"><div class="kl">${escapeHtml(k.label)}</div><div class="kv">${escapeHtml(k.value)}</div></div>`).join("")}</div>`
      : "";
  const charts = d.charts.map((c) => barChartSvg(c.title, c.labels, c.values)).join("");
  const tables = d.tables
    .map(
      (t) =>
        `<h2>${escapeHtml(t.title)}</h2><table><thead><tr>${t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
    )
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(d.title)}</title>
<style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;color:#111;font-size:12px}
h1{font-size:20px;margin:0}.muted{color:#555}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.kpi{border:1px solid #999;padding:8px}.kl{font-size:11px;color:#555}.kv{font-size:15px;font-weight:bold}
h2{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #999;padding:5px 7px;text-align:left}th{background:#eee}
.chart{margin:12px 0}.ctitle{font-weight:bold;margin-bottom:4px}
.foot{margin-top:24px;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#555;text-align:center}</style>
</head><body>
<h1>${escapeHtml(d.title)}</h1>
<div class="muted">${escapeHtml(d.company)}${d.period ? ` · ${escapeHtml(d.period)}` : ""}</div>
${kpis}${charts}${tables}
<div class="foot">${escapeHtml(d.footer || `${d.company} · Veloria POS`)}<br>Page 1 / 1</div>
</body></html>`;
}
// ---------------------------------------------------------------------------
// Étiquettes code-barres : planche A4 (24 / page : 3 colonnes × 8 lignes).
// Une seule source déterministe (aperçu = impression).
// ---------------------------------------------------------------------------

export interface LabelItem {
  name: string;
  priceMinor: number;
  barcode: string;
}

export function buildLabelsHtml(items: LabelItem[]): string {
  const cells = items
    .map((it) => {
      const code = sanitizeCode39(it.barcode);
      const svg = code ? code39Svg(code, 34) : "";
      return `<div class="label"><div class="lname">${escapeHtml(it.name)}</div><div class="lprice">${fmtDzd(it.priceMinor)}</div>${svg}<div class="lcode">${escapeHtml(code || it.barcode)}</div></div>`;
    })
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Étiquettes code-barres</title>
<style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;color:#111}
.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.label{border:1px dashed #888;border-radius:6px;padding:6px 8px;text-align:center;overflow:hidden;page-break-inside:avoid}
.lname{font-size:11px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lprice{font-size:14px;font-weight:bold;margin:2px 0}
.label svg{max-width:100%;height:auto}
.lcode{font-family:monospace;font-size:10px}</style>
</head><body><div class="sheet">${cells}</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Devis / proforma : document SANS valeur fiscale (jamais intitulé « Facture »).
// Même charge utile validée que le ticket (printPayloadSchema), où `invoice`
// transporte le numéro proforma (PRO-AAAA-00001).
// ---------------------------------------------------------------------------

export interface ProformaData {
  company: string;
  companyPhone: string;
  companyAddress: string;
  companyCity: string;
  companyEmail: string;
  companyRc: string;
  companyNif: string;
  footerText: string;
  /** Logo en data URL (injecté côté main), absent = aucun bloc logo. */
  companyLogo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  number: string;
  date: string;
  dueDate: string;
  notes: string;
  lines: ReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
}

/** Projection reçu → devis (le logo injecté côté main est conservé). */
export function proformaFromReceipt(d: ReceiptData): ProformaData {
  return {
    company: d.company,
    companyPhone: d.companyPhone,
    companyAddress: d.companyAddress,
    companyCity: d.companyCity,
    companyEmail: d.companyEmail,
    companyRc: d.companyRc,
    companyNif: d.companyNif,
    footerText: d.footerText,
    companyLogo: d.companyLogo,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    customerAddress: d.customerAddress,
    number: d.invoice,
    date: d.date,
    dueDate: d.dueDate,
    notes: d.notes,
    lines: d.lines,
    subtotalMinor: d.subtotalMinor,
    discountMinor: d.discountMinor,
    totalMinor: d.totalMinor,
  };
}

/** Devis 80mm (imprimante thermique partagée, même largeur que le ticket). */
export function buildProformaText(d: ProformaData): string {
  const fmt = (m: number): string =>
    `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(m / 100)} DA`;
  const out: string[] = [];
  out.push(`*** ${d.company} ***`);
  out.push(`DEVIS (SANS VALEUR FISCALE)`);
  out.push(`N° : ${d.number}`);
  out.push(`Date : ${d.date}`);
  if (d.customerName) out.push(`Client : ${d.customerName}`);
  out.push(`--------------------------------`);
  for (const l of d.lines) {
    out.push(l.name);
    out.push(`  ${l.qty} x ${fmt(l.unitPriceMinor)} = ${fmt(l.lineTotalMinor)}`);
  }
  out.push(`--------------------------------`);
  out.push(`Sous-total : ${fmt(d.subtotalMinor)}`);
  out.push(`Remise : ${fmt(d.discountMinor)}`);
  out.push(`TOTAL DEVIS : ${fmt(d.totalMinor)}`);
  out.push(``);
  out.push(`Devis valable 30 jours.`);
  return out.join("\n");
}

/** Devis A4 (maquette : destinataire, validité, conditions, non comptabilisé). */
export function buildProformaA4Html(d: ProformaData): string {
  const rows = d.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.ref ?? "—")}</td><td>${escapeHtml(l.name)}</td>` +
        `<td class="num">${l.qty}</td><td class="num">${fmtDzd(l.unitPriceMinor)}</td>` +
        `<td class="num">${fmtDzd(l.lineTotalMinor)}</td></tr>`,
    )
    .join("");
  const destRows = [
    `<div><span class="lbl">Nom :</span> ${escapeHtml(d.customerName || "—")}</div>`,
    d.customerPhone
      ? `<div><span class="lbl">Téléphone :</span> ${escapeHtml(d.customerPhone)}</div>`
      : "",
    d.customerAddress
      ? `<div><span class="lbl">Adresse :</span> ${escapeHtml(d.customerAddress)}</div>`
      : "",
  ].join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Devis ${escapeHtml(d.number)}</title>
<style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;color:#111;font-size:13px}
h1{font-size:22px;margin:0}.brand{display:flex;gap:12px;align-items:flex-start}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.docbox{border:2px solid #111;padding:10px 14px;min-width:220px}
.docbox h1{font-size:20px;text-align:center;margin-bottom:6px}
.muted{color:#555;font-size:12px}.lbl{color:#555}
.client{border:1px solid #999;padding:10px 12px;margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
.client h2,.sect{grid-column:1/-1;font-size:13px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em}
table.items{width:100%;border-collapse:collapse}
.items th,.items td{border:1px solid #999;padding:6px 8px;text-align:left}
.items th{background:#eee}.num{text-align:right;white-space:nowrap}
.totals{margin-left:auto;width:300px;border-collapse:collapse}
.totals td{border:1px solid #999;padding:6px 8px}
.grand{font-weight:bold;font-size:15px}
.barcode{margin-top:8px;text-align:center}.barcode svg{max-width:230px;height:auto}
.stamp{display:inline-block;margin-top:16px;padding:6px 14px;border:2px solid #111;font-weight:bold}
.signs{display:flex;gap:24px;margin-top:28px}
.signs div{flex:1;border:1px solid #999;min-height:90px;padding:8px;font-size:12px;color:#555}
.foot{margin-top:24px}</style>
</head><body>
${companyHead(
  d,
  "PROFORMA / DEVIS",
  `<div>N° : ${escapeHtml(d.number)}</div><div>Date : ${escapeHtml(d.date)}</div><div>Validité : ${escapeHtml(d.dueDate || "30 jours")}</div>${barcodeBlock(d.number)}`,
)}
<div class="client"><h2>Destinataire</h2>${destRows}</div>
<table class="items"><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>Prix U.</th><th>Total</th></tr></thead>
<tbody>${rows}</tbody></table>
<table class="totals"><tbody>
<tr><td>Sous-total</td><td class="num">${fmtDzd(d.subtotalMinor)}</td></tr>
<tr><td>Remise</td><td class="num">${fmtDzd(d.discountMinor)}</td></tr>
<tr class="grand"><td>TOTAL</td><td class="num">${fmtDzd(d.totalMinor)}</td></tr>
</tbody></table>
<div class="words">Montant en lettres : ${escapeHtml(amountInWordsFr(d.totalMinor))}</div>
<div class="sect">Conditions :</div><div>${escapeHtml(d.notes || "—")}</div>
<div>Validité du proforma : ${escapeHtml(d.dueDate || "30 jours")}</div>
<div><span class="stamp">Document non comptabilisé</span></div>
<div class="signs"><div>Signature client</div><div>Signature / Cachet</div></div>
${legalFooter(d)}
</body></html>`;
}
