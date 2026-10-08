// Veloria Client — QR d'activation : V1 (ADR-054) + V2 universel (ADR-068).
import { describe, expect, it } from "vitest";
import { parseActivationQr, QrError } from "../../mobile/src/qr";

const GOOD = "VELORIA1|0550123456|482916|AbcDefGh12345678";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function jwt(role: string): string {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ role })}.sig`;
}
const ANON = jwt("anon");
const SERVICE = jwt("service_role");
const URL = "https://abcxyz.supabase.co";
const GOOD_V2 = `VELORIA2|${URL}|${ANON}|0550123456|482916|AbcDefGh12345678`;

describe("parseActivationQr", () => {
  it("extrait téléphone + PIN d'un QR POS valide", () => {
    expect(parseActivationQr(GOOD)).toEqual({ phone: "0550123456", pin: "482916", endpoint: null });
    expect(parseActivationQr(`  ${GOOD}  `)).toEqual({
      phone: "0550123456",
      pin: "482916",
      endpoint: null,
    });
  });
  it("V2 : extrait endpoint du magasin (APK universel)", () => {
    expect(parseActivationQr(GOOD_V2)).toEqual({
      phone: "0550123456",
      pin: "482916",
      endpoint: { supabaseUrl: URL, anonKey: ANON },
    });
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
  it("V2 : refuse URL piégée, anon courte et service_role", () => {
    expect(() =>
      parseActivationQr(`VELORIA2|http://evil.com|${ANON}|0550|123456|AbcDefGh12345678`),
    ).toThrow(QrError);
    expect(() => parseActivationQr(`VELORIA2|${URL}|court|0550|123456|AbcDefGh12345678`)).toThrow(
      QrError,
    );
    expect(() =>
      parseActivationQr(`VELORIA2|${URL}|${SERVICE}|0550|123456|AbcDefGh12345678`),
    ).toThrow(QrError);
    expect(() => parseActivationQr(`VELORIA2|${URL}|${ANON}|0550|123456|court`)).toThrow(QrError);
  });
});
