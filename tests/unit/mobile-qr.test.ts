// Veloria Client — QR d'activation : parseur miroir du format POS (ADR-054).
import { describe, expect, it } from "vitest";
import { parseActivationQr, QrError } from "../../mobile/src/qr";

const GOOD = "VELORIA1|0550123456|482916|AbcDefGh12345678";

describe("parseActivationQr", () => {
  it("extrait téléphone + PIN d'un QR POS valide", () => {
    expect(parseActivationQr(GOOD)).toEqual({ phone: "0550123456", pin: "482916" });
    expect(parseActivationQr(`  ${GOOD}  `)).toEqual({ phone: "0550123456", pin: "482916" });
  });
  it("rejette préfixe, structure, téléphone, PIN, code", () => {
    expect(() => parseActivationQr("VELORIA2|0550|123456|AbcDefGh12345678")).toThrow(QrError);
    expect(() => parseActivationQr("0550123456")).toThrow(QrError);
    expect(() => parseActivationQr("VELORIA1|0550|123456")).toThrow(QrError);
    expect(() => parseActivationQr("VELORIA1||123456|AbcDefGh12345678")).toThrow(QrError);
    expect(() => parseActivationQr("VELORIA1|0550|12345|AbcDefGh12345678")).toThrow(QrError);
    expect(() => parseActivationQr("VELORIA1|0550|12345a|AbcDefGh12345678")).toThrow(QrError);
    expect(() => parseActivationQr("VELORIA1|0550|123456|court")).toThrow(QrError);
    expect(() => parseActivationQr("")).toThrow(QrError);
  });
});
