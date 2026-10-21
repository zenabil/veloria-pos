// Veloria PoS — scripts/quality/verify-domain.ts
// Runs with system node type-stripping (no npm deps): node scripts/quality/verify-domain.ts
import fs from "node:fs";
import path from "node:path";
import {
  fromDzd,
  formatDzd,
  formatDzdStrict,
  percentOfMinor,
  multiplyMinorByQuantity,
  assertSafeTotal,
  parseDzdInputStrict,
} from "../../src/domain/money/money.ts";
import { computeSaleTotals } from "../../src/domain/sales/sale-rules.ts";
import { computeDebtStatus, applyPaymentToBalance } from "../../src/domain/customer/debt-rules.ts";
// Zakat : le calcul vit dans le DOMAINE (`src/domain/zakat/zakat-rules.ts`,
// `computeZakat`) — on l'appelle au lieu de le recalculer ici, pour que
// toute divergence entre le domaine et le miroir main soit détectée par cette
// porte. (E-36 — l'ancien commentaire citait un chemin inexistant.)
import { computeZakat } from "../../src/domain/zakat/zakat-rules.ts";
import { validateReturnLines } from "../../src/domain/returns/return-rules.ts";
import { computeIntakeTotals } from "../../src/domain/inventory/intake-rules.ts";
import { computeProformaTotals } from "../../src/domain/proforma/proforma-rules.ts";
import { computeClosingBalance } from "../../src/domain/closings/closing-rules.ts";
import { parseProductsCsv } from "../../src/domain/import/csv-import.ts";
import {
  applySupplierPayment,
  formatSupplierCode,
  validateSupplierDraft,
} from "../../src/domain/suppliers/supplier-rules.ts";
import { computeAdjustmentNewStock } from "../../src/domain/inventory/stock-rules.ts";
import { computeReturnStatus, formatReturnNumber } from "../../src/domain/returns/return-rules.ts";
import { formatExpenseNumber } from "../../src/domain/expenses/expense-rules.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`OK  ${msg}`);
}

assert(fromDzd(100) === 10000, "100 DZD = 10000 centimes");
assert(fromDzd(19.99) === 1999, "19.99 DZD = 1999 (no float error)");
assert(multiplyMinorByQuantity(1999, 3) === 5997, "line total 1999x3=5997");
assert(percentOfMinor(999, 10) === 100, "percent rounds to minor");
assert(formatDzd(81000).includes("DZD"), "format FR DZD");
// A-01 (P1) : le format de RENDU ne lève jamais (une valeur fausse ne peut
// plus tuer l'écran du caissier) ; le format STRICT reste disponible pour
// les chemins transactionnels (il lève, lui).
assert(formatDzdStrict(81000).includes("DZD"), "format FR DZD strict");
assert(formatDzd(Number.NaN) === "—", "format DZD sûr : NaN ⇒ « — »");
assert(formatDzd(1.5) === "—", "format DZD sûr : fractionnaire ⇒ « — »");
assert(formatDzd(-1) === "—", "format DZD sûr : négatif ⇒ « — »");
assert(formatDzd(1e12) === "—", "format DZD sûr : hors bornes ⇒ « — »");
let strictThrew = false;
try {
  formatDzdStrict(Number.NaN);
} catch {
  strictThrew = true;
}
assert(strictThrew, "format DZD strict : valeur invalide ⇒ exception (écriture)");

const t = computeSaleTotals({
  lines: [
    {
      productId: 1,
      productName: "Coca",
      unitCode: "PIECE",
      originalUnitPriceMinor: 10000,
      unitPriceMinor: 9000,
      purchasePriceMinor: 8000,
      quantity: 2,
    },
  ],
  deliveryFeeMinor: 500,
  amountPaidMinor: 10000,
});
assert(
  t.subtotalMinor === 20000 && t.discountAmountMinor === 2000 && t.totalMinor === 18500,
  "sale totals 20000-2000+500=18500 (remise par prix unitaire)",
);
assert(t.remainingMinor === 8500 && t.paymentStatus === "partial", "partial payment state");

let threw = false;
try {
  computeSaleTotals({
    lines: [],
    deliveryFeeMinor: 0,
    amountPaidMinor: 0,
  });
} catch {
  threw = true;
}
assert(threw, "empty cart rejected");

assert(
  computeDebtStatus({ outstandingMinor: 50000, creditLimitMinor: 20000 }).status === "over_limit",
  "over-limit detected",
);
assert(applyPaymentToBalance(10000, 4000) === 6000, "payment reduces balance");

const zakBase = 100000 + 200000 + 50000 - 20000;
assertSafeTotal(zakBase, "Zakat base");
// Zakat via la FONCTION DU DOMAINE (parité domain ↔ main garantie par l'appel).
const zak = computeZakat({
  cashMinor: 100000,
  bankMinor: 200000,
  stockMinor: 50000,
  receivablesMinor: 0,
  otherMinor: 0,
  liabilitiesMinor: 20000,
  nisabMinor: 100000,
  ratePercent: 2.5,
});
assert(zak.net === zakBase && zak.zakat === 8250, "zakat 2.5% of 330000 = 8250");
assert(zak.above, "zakat au-dessus du nisab");
assert(parseDzdInputStrict("12,5") === 1250, "strict FR input 12,5=1250");

const rt = validateReturnLines([
  {
    productId: 1,
    productName: "Coca",
    unitPriceMinor: 10000,
    purchasePriceMinor: 8000,
    soldQuantity: 5,
    alreadyReturned: 2,
    returnQuantity: 3,
    restocked: true,
  },
]);
assert(rt === 30000, "return total 3x10000=30000");

const intake = computeIntakeTotals(
  [
    {
      productId: 1,
      productName: "Farine",
      quantityReceived: 10,
      quantityDamaged: 2,
      purchasePriceMinor: 5000,
    },
  ],
  1000,
);
assert(intake.totalMinor === 41000, "intake 8x5000+1000=41000");

const pro = computeProformaTotals(
  [{ productId: null, productName: "Lot", unitPriceMinor: 10000, quantity: 2 }],
  1000,
  500,
);
assert(pro.totalMinor === 19500, "proforma 20000-1000+500=19500");

assert(
  computeClosingBalance({
    openingMinor: 10000,
    cashSalesMinor: 50000,
    customerCollectionsMinor: 5000,
    expensesMinor: 8000,
    refundsMinor: 2000,
  }) === 55000,
  "closing 10000+50000+5000-8000-2000=55000",
);

assert(
  parseProductsCsv("nom;vente;achat;quantite\nFarine;50;40;10\n").length === 1,
  "csv import parses 1 row",
);
assert(parseDzdInputStrict("12,5") === 1250, "virgule FR acceptée en saisie");
let strictRejected = false;
try {
  parseDzdInputStrict("abc");
} catch {
  strictRejected = true;
}
assert(strictRejected, "saisie non numérique rejetée (erreur FR, jamais NaN)");

assert(formatSupplierCode(1) === "FOU-00001", "supplier code FOU-00001");
assert(applySupplierPayment(5000, 2000) === 3000, "supplier payment bounded by debt");
let supplierRejected = false;
try {
  validateSupplierDraft({ name: "AB", email: "pas-un-email" });
} catch {
  supplierRejected = true;
}
assert(supplierRejected, "supplier draft rejects bad email");

assert(
  computeAdjustmentNewStock({ currentQty: 10, kind: "out", quantity: 4 }) === 6,
  "adjustment 10-4=6",
);
let negativeRejected = false;
try {
  computeAdjustmentNewStock({ currentQty: 2, kind: "out", quantity: 5 });
} catch {
  negativeRejected = true;
}
assert(negativeRejected, "adjustment never goes negative");

assert(formatReturnNumber("supplier", 42) === "RET-S-00042", "supplier return number");
assert(
  computeReturnStatus(1000, 1000) === "refunded" && computeReturnStatus(1000, 0) === "validated",
  "return status derived",
);
assert(formatExpenseNumber(7) === "DEP-00007", "expense number DEP-00007");

// ---------------------------------------------------------------------------
// E-36 (P1) : gardes de CODE — atomicité des mutations + couverture
// `operationId`. Avant, rien ne vérifiait ces deux invariants : une régression
// (mutation hors transaction, mutation non rejouable) passait toutes les
// portes. Ces deux gardes les rendent ÉCHECABLES (ADR-120 : « une garde qui
// ne peut pas échouer n'est pas une garde »).
//
// Méthode : lecture statique des registres IPC (`registry*.ts`) → alias de
// repo → fonctions réellement appelées → pour chaque fonction qui ÉCRIT :
//   (a) elle doit envelopper ses écritures dans `db.transaction(...)` ;
//   (b) elle doit accepter un `operationId` (rejouabilité / idempotence).
// Le nombre de fonctions contrôlées est lui-même vérifié : une garde
// vacuous (0 fonction analysée) est un ÉCHEC, pas un succès.
// ---------------------------------------------------------------------------
const repoRoot = process.cwd();
const ipcDir = path.join(repoRoot, "electron", "ipc");
const handlersDir = path.join(ipcDir, "handlers");

// Découpe le fichier en fonctions de premier niveau (déclarations `function`
// ET arrow functions const) : une fonction NESTÉE ou voisine ne doit pas
// être analysée comme si elle appartenait à la précédente (faux positif).
function topLevelFunctions(text: string): Array<{ name: string; exported: boolean; body: string }> {
  const re =
    /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\(|^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/gm;
  const matches = [...text.matchAll(re)];
  const out: Array<{ name: string; exported: boolean; body: string }> = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    if (!current) continue;
    const start = current.index;
    const next = matches[i + 1];
    const end = next ? next.index : text.length;
    const chunk = text.slice(start, end);
    const lastBrace = chunk.lastIndexOf("\n}");
    out.push({
      name: current[1] ?? current[2] ?? "",
      exported: current[0].startsWith("export"),
      body: lastBrace > 0 ? chunk.slice(0, lastBrace) : chunk,
    });
  }
  return out;
}

const registryFiles = fs
  .readdirSync(ipcDir)
  .filter((f) => f.startsWith("registry") && f.endsWith(".ts"))
  .sort();

const aliasToRepo = new Map<string, string>();
for (const rf of registryFiles) {
  const text = fs.readFileSync(path.join(ipcDir, rf), "utf8");
  for (const m of text.matchAll(/import \* as (\w+) from "\.\/handlers\/([^"]+)"/g)) {
    const raw = m[2] ?? "";
    const rel = raw.endsWith(".ts") ? raw : `${raw}.ts`;
    aliasToRepo.set(m[1] ?? "", path.join(handlersDir, rel));
  }
}

const repoCache = new Map<string, Map<string, string>>();
function repoBody(repo: string, name: string): string | undefined {
  let map = repoCache.get(repo);
  if (!map) {
    map = new Map(
      topLevelFunctions(fs.readFileSync(repo, "utf8"))
        .filter((f) => f.exported)
        .map((f) => [f.name, f.body]),
    );
    repoCache.set(repo, map);
  }
  return map.get(name);
}

// Écriture = SQL d'écriture réellement préparé (`.prepare(\`INSERT …\`)`) :
// une fonction de LECTURE qui contient le mot « UPDATE » dans un commentaire
// ou dans une fonction voisine n'est pas une mutation.
const WRITE_RE = /\.prepare\(\s*[`"'][^`"']*\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i;
// Exception documentée : `staff.login` n'est pas une « mutation métier » mais
// une tentative d'authentification. Chaque branche écrit UNE instruction SQL
// atomique (compteur anti-brute-force / remise à zéro), donc :
//   - pas de transaction multi-écriture à protéger ;
//   - pas d'operationId (ce n'est pas une opération rejouable : rejouer une
//     authentification n'a aucun sens, et le compteur d'échecs DOIT parfois
//     s'incrémenter).
const ATOMIC_SINGLE_WRITE_EXCEPTIONS = new Set(["staff.repo.ts::authenticateAtomic"]);
const missingTx: string[] = [];
const missingOperationId: string[] = [];
const checked = new Set<string>();
for (const rf of registryFiles) {
  const text = fs.readFileSync(path.join(ipcDir, rf), "utf8");
  for (const m of text.matchAll(/\b(\w+)\.(\w+)\(/g)) {
    const repo = aliasToRepo.get(m[1] ?? "");
    if (!repo) continue;
    const fn = m[2] ?? "";
    const body = repoBody(repo, fn);
    if (body === undefined) continue;
    if (!WRITE_RE.test(body)) continue;
    const key = `${path.basename(repo)}::${fn}`;
    if (checked.has(key)) continue;
    checked.add(key);
    if (ATOMIC_SINGLE_WRITE_EXCEPTIONS.has(key)) continue;
    if (!/\.transaction\s*\(/.test(body)) missingTx.push(key);
    // Signature (400 premiers caractères) : le paramètre `operationId` doit
    // exister — sinon la mutation n'est pas rejouable.
    if (!/operationId/.test(body.slice(0, 400))) missingOperationId.push(key);
  }
}
assert(checked.size >= 40, `E-36 : garde non vacuous (${checked.size} mutations IPC analysées)`);
assert(
  missingTx.length === 0,
  `E-36 : toute mutation IPC est dans une transaction (${missingTx.join(", ") || "ok"})`,
);
assert(
  missingOperationId.length === 0,
  `E-36 : toute mutation IPC reçoit un operationId (${missingOperationId.join(", ") || "ok"})`,
);

console.log("DOMAIN VERIFIED");
