// Veloria PoS — Bornes TOTALES : un agrégat/paiement pré-rempli ou validé au
// plafond unitaire (MAX_MINOR_SINGLE) fait lever `minorToInput` dans un
// `useState` (écran mort) et rend « — » via `formatDzd`. Ces tests échouent
// sans les variantes *Total* et verrouillent le contrat.
import { describe, it, expect } from "vitest";
import {
  MoneyError,
  formatDzd,
  formatDzdTotal,
  formatDzdTotalSigned,
  minorToInput,
  minorToInputTotal,
  parseDzdInputTotal,
} from "@/domain/money/money.ts";

const AGGREGATE = 1_500_000_000; // 15 000 000,00 DZD > plafond unitaire (1e9)

const plain = (s: string): string => s.replace(/\u202f/g, " ").replace(/\u00a0/g, " ");

describe("Bornes totales — préremplissage et rendu d'un agrégat", () => {
  it("minorToInputTotal aller-retour avec parseDzdInputTotal", () => {
    const text = minorToInputTotal(AGGREGATE);
    expect(parseDzdInputTotal(text)).toBe(AGGREGATE);
  });

  it("minorToInput (plafond unitaire) lève sur le même agrégat", () => {
    expect(() => minorToInput(AGGREGATE)).toThrow(MoneyError);
  });

  it("formatDzdTotal rend un agrégat valide, formatDzd le masque en « — »", () => {
    const rendered = plain(formatDzdTotal(AGGREGATE));
    expect(rendered).not.toBe("—");
    expect(rendered).toBe("15 000 000,00 DZD");
    expect(formatDzd(AGGREGATE)).toBe("—");
  });

  it("formatDzdTotalSigned signe une perte hors plafond unitaire", () => {
    expect(formatDzdTotalSigned(-AGGREGATE).startsWith("-")).toBe(true);
  });
});
