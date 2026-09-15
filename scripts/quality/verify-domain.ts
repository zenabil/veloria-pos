// Veloria PoS — scripts/quality/verify-domain.ts
// Runs with system node type-stripping (no npm deps): node scripts/quality/verify-domain.ts
import {
  fromDzd,
  formatDzd,
  percentOfMinor,
  multiplyMinorByQuantity,
} from "../../src/domain/money/money.ts";
import { computeSaleTotals } from "../../src/domain/sales/sale-rules.ts";
import { computeDebtStatus, applyPaymentToBalance } from "../../src/domain/customer/debt-rules.ts";
import { calculateZakat } from "../../src/domain/finance/zakat.ts";
import { validateReturnLines } from "../../src/domain/returns/return-rules.ts";
import { computeIntakeTotals } from "../../src/domain/inventory/intake-rules.ts";
import { computeProformaTotals } from "../../src/domain/proforma/proforma-rules.ts";
import { computeBreadTotals } from "../../src/domain/bread/bread-rules.ts";
import { computeClosingBalance } from "../../src/domain/closings/closing-rules.ts";
import { parseProductsCsv } from "../../src/domain/import/csv-import.ts";

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

const t = computeSaleTotals({
  lines: [
    {
      productId: 1,
      productName: "Coca",
      unitCode: "PIECE",
      unitPriceMinor: 10000,
      purchasePriceMinor: 8000,
      quantity: 2,
    },
  ],
  discountType: "percent",
  discountValueMinor: 10,
  deliveryFeeMinor: 500,
  amountPaidMinor: 10000,
});
assert(
  t.subtotalMinor === 20000 && t.discountAmountMinor === 2000 && t.totalMinor === 18500,
  "sale totals 20000-2000+500=18500",
);
assert(t.remainingMinor === 8500 && t.paymentStatus === "partial", "partial payment state");

let threw = false;
try {
  computeSaleTotals({
    lines: [],
    discountType: "none",
    discountValueMinor: 0,
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

const z = calculateZakat({
  cashMinor: 100000,
  inventoryValueMinor: 200000,
  customerDebtsMinor: 50000,
  supplierDebtsMinor: 20000,
  nisabMinor: 100000,
  ratePercent: 2.5,
});
assert(
  z.zakatableBaseMinor === 330000 && z.zakatDueMinor === 8250 && z.aboveNisab,
  "zakat 2.5% of 330000 = 8250",
);

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

const bread = computeBreadTotals(10, 1500, 10000);
assert(bread.totalMinor === 15000 && bread.remainingMinor === 5000, "bread 10x1500 paid 10000");

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

assert(parseProductsCsv("nom;prix\nFarine;50\n").length === 1, "csv import parses 1 row");

console.log("DOMAIN VERIFIED");
