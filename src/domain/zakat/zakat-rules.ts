// Veloria PoS — Domain: règles zakat (reporting seul, framework-free).
// P3 : déplacé depuis features/zakat/types.ts — le domaine possède le calcul,
// la feature ne garde que le formulaire. Montants en centimes (DZD).
// Erreurs = DomainError FR (ZAKAT_ERROR), jamais de NaN.

import { DomainError } from "../common/errors.ts";
import { assertSafeTotal, percentOfMinor } from "../money/money.ts";

export interface ZakatForm {
  cashMinor: number;
  bankMinor: number;
  stockMinor: number;
  receivablesMinor: number;
  otherMinor: number;
  liabilitiesMinor: number;
  nisabMinor: number;
  ratePercent: number;
}

function percentOfMinorGuarded(amountMinor: number, percent: number): number {
  try {
    return percentOfMinor(amountMinor, percent);
  } catch {
    throw new DomainError("ZAKAT_ERROR", "Zakat invalide : dépassement de capacité.");
  }
}

export function computeZakat(f: ZakatForm): { net: number; zakat: number; above: boolean } {
  // H-1 : chaque source validée + accumulation gardée (fail closed avant
  // MAX_SAFE_INTEGER) + taux borné.
  const sources: Array<[string, number]> = [
    ["Encaisse", f.cashMinor],
    ["Banque", f.bankMinor],
    ["Stock", f.stockMinor],
    ["Créances", f.receivablesMinor],
    ["Autres", f.otherMinor],
    ["Dettes", f.liabilitiesMinor],
    ["Nisab", f.nisabMinor],
  ];
  for (const [label, v] of sources) {
    try {
      assertSafeTotal(v, `Zakat invalide : ${label}`);
    } catch {
      throw new DomainError("ZAKAT_ERROR", `Zakat invalide : ${label}.`);
    }
  }
  if (!Number.isFinite(f.ratePercent) || f.ratePercent <= 0 || f.ratePercent > 100) {
    throw new DomainError("ZAKAT_ERROR", "Zakat invalide : taux.");
  }
  let gross = 0;
  for (const v of [f.cashMinor, f.bankMinor, f.stockMinor, f.receivablesMinor, f.otherMinor]) {
    gross += v;
    if (!Number.isSafeInteger(gross) || gross < 0) {
      throw new DomainError("ZAKAT_ERROR", "Zakat invalide : dépassement de capacité.");
    }
  }
  const net = Math.max(0, gross - f.liabilitiesMinor);
  try {
    assertSafeTotal(net, "Zakat invalide : base");
  } catch {
    throw new DomainError("ZAKAT_ERROR", "Zakat invalide : dépassement de capacité.");
  }
  const above = net >= f.nisabMinor && f.nisabMinor > 0;
  if (above && net !== 0 && Math.abs(f.ratePercent) > 100_000_000_000 / net) {
    throw new DomainError("ZAKAT_ERROR", "Zakat invalide : dépassement de capacité.");
  }
  const zakat = above ? percentOfMinorGuarded(net, f.ratePercent) : 0;
  try {
    assertSafeTotal(zakat, "Zakat invalide : montant");
  } catch {
    throw new DomainError("ZAKAT_ERROR", "Zakat invalide : dépassement de capacité.");
  }
  return { net, zakat, above };
}
