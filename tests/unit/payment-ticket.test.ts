// Veloria PoS — Tests : ticket de règlement de dette (builders + schéma + clé).
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  buildPaymentText,
  buildPaymentTicketA4Html,
  paymentTicketKindLabel,
  toPaymentTicketData,
  type PaymentTicketData,
} from "../../electron/printing/receipt-documents";
import { paymentTicketSchema } from "../../electron/ipc/validators";
import { validateVendorPrivateKeyPem } from "../../license-manager/signing";

const TICKET: PaymentTicketData = {
  company: "Veloria",
  companyPhone: "",
  companyAddress: "",
  companyCity: "",
  companyEmail: "",
  companyRc: "",
  companyNif: "",
  companyLogo: "",
  partyLabel: "Amine Benali — CL-00125",
  kind: "customer",
  reference: "PAY-00042",
  date: "23/09/2026",
  amountMinor: 5000,
  paymentMethod: "cash",
  prevBalanceMinor: 15000,
  newBalanceMinor: 10000,
  notes: "",
  footerText: "",
  thankYouMessage: "",
};

describe("payment ticket builders", () => {
  it("libellés par nature (client / fournisseur)", () => {
    expect(paymentTicketKindLabel("customer")).toBe("REÇU DE RÈGLEMENT");
    expect(paymentTicketKindLabel("supplier")).toBe("RÈGLEMENT FOURNISSEUR");
  });

  it("texte 80mm : montants FR + soldes + mode en majuscules", () => {
    const t = buildPaymentText(TICKET);
    expect(t).toContain("REÇU DE RÈGLEMENT");
    expect(t).toContain("PAY-00042");
    expect(t).toContain("Amine Benali");
    expect(t).toContain("50,00 DA");
    expect(t).toContain("150,00 DA");
    expect(t).toContain("100,00 DA");
    expect(t).toContain("ESPÈCES");
  });

  it("masque le mode inconnu (jamais de brut)", () => {
    expect(buildPaymentText({ ...TICKET, paymentMethod: "zzz" })).not.toContain("Mode :");
  });

  it("A4 : cartouche + soldes + signatures, entrées échappées", () => {
    const h = buildPaymentTicketA4Html({ ...TICKET, partyLabel: "<b>X</b>" });
    expect(h).toContain("REÇU DE RÈGLEMENT");
    expect(h).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(h).toContain("Signature client");
    expect(h).toContain("50,00");
  });

  it("toPaymentTicketData ne lève jamais (repli sûr)", () => {
    const d = toPaymentTicketData(null);
    expect(d.company).toBe("Veloria");
    expect(d.kind).toBe("customer");
    expect(d.amountMinor).toBe(0);
  });
});

describe("paymentTicketSchema", () => {
  const base = {
    company: "Veloria",
    partyLabel: "Amine Benali — CL-00125",
    kind: "customer" as const,
    reference: "PAY-00042",
    date: "23/09/2026",
    amountMinor: 5000,
    paymentMethod: "cash" as const,
    prevBalanceMinor: 15000,
    newBalanceMinor: 10000,
    notes: "",
  };

  it("accepte un règlement cohérent (nouveau = ancien − montant)", () => {
    expect(() => paymentTicketSchema.parse(base)).not.toThrow();
  });

  it("rejette des soldes incohérents", () => {
    expect(() => paymentTicketSchema.parse({ ...base, newBalanceMinor: 1 })).toThrow();
  });

  it("rejette un montant nul et une partie vide", () => {
    expect(() => paymentTicketSchema.parse({ ...base, amountMinor: 0 })).toThrow();
    expect(() => paymentTicketSchema.parse({ ...base, partyLabel: "" })).toThrow();
  });
});

describe("validateVendorPrivateKeyPem", () => {
  it("accepte une clé Ed25519 valide, refuse le reste", () => {
    const ed = generateKeyPairSync("ed25519");
    const pem = ed.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => validateVendorPrivateKeyPem(pem)).not.toThrow();

    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 });
    const rsaPem = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => validateVendorPrivateKeyPem(rsaPem)).toThrow(/Ed25519/);

    expect(() => validateVendorPrivateKeyPem("n'importe quoi")).toThrow();
    expect(() => validateVendorPrivateKeyPem("")).toThrow();
    expect(() =>
      validateVendorPrivateKeyPem("-----BEGIN PUBLIC KEY-----\nxx\n-----END PUBLIC KEY-----"),
    ).toThrow();
  });
});
