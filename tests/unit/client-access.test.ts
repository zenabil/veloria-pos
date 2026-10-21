// Veloria — Accès clients APK : règles pures + cliché d'affichage (V1 lecture seule).
// Le hachage a lieu côté main ; ici : formes, expirations, verrouillage, snapshot.
import { describe, expect, it } from "vitest";
import {
  CLIENT_LOCK_MINUTES,
  PIN_KDF_ALGO,
  PIN_KDF_DIGEST,
  PIN_KDF_ITERATIONS,
  PIN_KDF_KEYLEN_BYTES,
  PIN_KDF_SALT_BYTES,
  assertValidAnonKey,
  assertValidSupabaseUrl,
  isLocked,
  isQrExpired,
  isSessionExpired,
  nextFailedState,
  assertValidActivationCode,
  assertValidAnnouncement,
  assertValidPin,
} from "../../src/domain/customer/client-access";
import {
  buildClientSnapshot,
  buildActivationQrPayload,
  buildActivationQrPayloadV2,
  selectDetailSaleIds,
  validateActivation,
  validateAnnouncement,
  type SnapshotItemRow,
  type SnapshotPaymentRow,
  type SnapshotSaleRow,
} from "../../src/application/customers/client-access";
import {
  announcementSaveSchema,
  clientAccessActivateSchema,
  clientAccessQrSchema,
  syncEnqueueSchema,
} from "../../electron/ipc/validators";
import * as ClientAccess from "../../electron/ipc/handlers/client-access.repo";

const OP = "123e4567-e89b-12d3-a456-426614174000";
const QR = "AbcDefGh12345678";

describe("PIN / activation", () => {
  it("accepte 6 chiffres, refuse le reste", () => {
    expect(() => assertValidPin("123456")).not.toThrow();
    for (const bad of ["12345", "1234567", "12345a", " 12345", "12 456", "abcdef", ""]) {
      expect(() => assertValidPin(bad)).toThrow();
    }
  });
  it("code QR opaque 16..128 URL-safe", () => {
    expect(() => assertValidActivationCode(QR)).not.toThrow();
    expect(() => assertValidActivationCode("court")).toThrow();
    expect(() => assertValidActivationCode("avec espace dedans 123")).toThrow();
  });
  it("activation exige client + téléphone + operationId", () => {
    const base = {
      customerId: 7,
      phone: "0550123456",
      pin: "482916",
      activationCode: QR,
      operationId: OP,
    };
    expect(validateActivation(base).phone).toBe("0550123456");
    expect(() => validateActivation({ ...base, customerId: 0 })).toThrow();
    expect(() => validateActivation({ ...base, operationId: "" })).toThrow();
    expect(() => validateActivation({ ...base, phone: "   " })).toThrow();
    expect(() => validateActivation({ ...base, pin: "12345" })).toThrow();
  });
});

describe("charge QR d'activation (ADR-054 / ADR-068)", () => {
  it("le format V1 reste décrit par le use-case (l'APK le lit encore)", () => {
    expect(buildActivationQrPayload("0550123456", "482916", QR)).toBe(
      `VELORIA1|0550123456|482916|${QR}`,
    );
    expect(buildActivationQrPayload("  0550  ", "123456", QR)).toBe(`VELORIA1|0550|123456|${QR}`);
    expect(() => buildActivationQrPayload("", "123456", QR)).toThrow();
    expect(() => buildActivationQrPayload("05|50", "123456", QR)).toThrow();
    expect(() => buildActivationQrPayload("0550", "12345", QR)).toThrow();
    expect(() => buildActivationQrPayload("0550", "123456", "court")).toThrow();
  });
  it("W6 (B-03) : le MIROIR main du constructeur V1 a disparu (le POS n'émet plus que la V2)", () => {
    expect(
      (ClientAccess as unknown as Record<string, unknown>)["buildActivationQrPayload"],
    ).toBeUndefined();
  });
  it("schéma IPC miroir des mêmes bornes", () => {
    const base = { phone: "0550", pin: "123456", code: QR };
    expect(clientAccessQrSchema.safeParse(base).success).toBe(true);
    expect(clientAccessQrSchema.safeParse({ ...base, pin: "12345" }).success).toBe(false);
    expect(clientAccessQrSchema.safeParse({ ...base, code: "court" }).success).toBe(false);
    expect(clientAccessQrSchema.safeParse({ ...base, phone: "a|b" }).success).toBe(false);
  });
});

describe("charge QR V2 universelle (ADR-068)", () => {
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
  it("construit VELORIA2|url|anon|phone|pin|code", () => {
    expect(buildActivationQrPayloadV2(URL, ANON, "0550123456", "482916", QR)).toBe(
      `VELORIA2|${URL}|${ANON}|0550123456|482916|${QR}`,
    );
  });
  it("refuse URL piégée, anon courte et service_role", () => {
    expect(() =>
      buildActivationQrPayloadV2("http://evil.com", ANON, "0550", "123456", QR),
    ).toThrow();
    expect(() => buildActivationQrPayloadV2(URL, "court", "0550", "123456", QR)).toThrow();
    expect(() => buildActivationQrPayloadV2(URL, SERVICE, "0550", "123456", QR)).toThrow();
    expect(() => buildActivationQrPayloadV2(URL, ANON, "05|50", "123456", QR)).toThrow();
  });
  it("domaine : whitelist URL + garde anon", () => {
    expect(() => assertValidSupabaseUrl(URL)).not.toThrow();
    expect(() => assertValidSupabaseUrl("http://evil.com")).toThrow();
    expect(() => assertValidSupabaseUrl("http://127.0.0.1:8099")).not.toThrow();
    expect(() => assertValidAnonKey(ANON)).not.toThrow();
    expect(() => assertValidAnonKey(SERVICE)).toThrow(/service/i);
    expect(() => assertValidAnonKey("court")).toThrow();
  });
});

describe("sélection des détails à pousser (page détail APK)", () => {
  const sales = [
    { id: 1, is_cancelled: 0, remaining_balance_minor: 100 },
    { id: 2, is_cancelled: 0, remaining_balance_minor: 0 },
    { id: 3, is_cancelled: 1, remaining_balance_minor: 50 },
    { id: 4, is_cancelled: 0, remaining_balance_minor: 200 },
  ];
  it("fenêtre récente (payée comprise) + ouvertes, sans doublon", () => {
    // 2 est payée (solde 0) mais dans les `limit` plus récentes : poussée,
    // sinon son reçu ne serait JAMAIS consultable sur l'APK.
    expect(selectDetailSaleIds(sales, 10)).toEqual([1, 2, 4]);
    expect(selectDetailSaleIds(sales, 1)).toEqual([1]);
    expect(
      selectDetailSaleIds([...sales, { id: 1, is_cancelled: 0, remaining_balance_minor: 5 }], 10),
    ).toEqual([1, 2, 4]);
  });
  it("annulées jamais poussées, payées récentes poussées", () => {
    const ids = selectDetailSaleIds(sales, 10);
    expect(ids).not.toContain(3); // annulée
    expect(ids).toContain(2); // payée mais récente → reçu ouvrable
  });
  it("au-delà de la fenêtre récente, les ouvertes restent poussées (plafond 2 × limit)", () => {
    const many = [
      { id: 10, is_cancelled: 0, remaining_balance_minor: 0 }, // récente, payée
      { id: 9, is_cancelled: 0, remaining_balance_minor: 0 }, // récente, payée
      { id: 8, is_cancelled: 0, remaining_balance_minor: 0 }, // hors fenêtre, payée → non
      { id: 7, is_cancelled: 0, remaining_balance_minor: 500 }, // ouverte, hors fenêtre
      { id: 6, is_cancelled: 0, remaining_balance_minor: 700 }, // ouverte, hors fenêtre
    ];
    // 2 récentes (payées) + 2 ouvertes au-delà = 2 × limit au maximum.
    expect(selectDetailSaleIds(many, 2)).toEqual([10, 9, 7, 6]);
    // Toutes ouvertes : la fenêtre consomme déjà le budget ouvert.
    const allOpen = [5, 4, 3, 2, 1].map((id) => ({
      id,
      is_cancelled: 0,
      remaining_balance_minor: 100,
    }));
    expect(selectDetailSaleIds(allOpen, 3)).toEqual([5, 4, 3]);
    // Plafond dur : 4 payées récentes + 4 ouvertes au maximum (2 × limit).
    const big = [
      ...[20, 19, 18, 17, 16, 15].map((id) => ({
        id,
        is_cancelled: 0,
        remaining_balance_minor: 0,
      })),
      ...[14, 13, 12, 11, 10, 9].map((id) => ({
        id,
        is_cancelled: 0,
        remaining_balance_minor: 50,
      })),
    ];
    expect(selectDetailSaleIds(big, 4)).toEqual([20, 19, 18, 17, 14, 13, 12, 11]);
  });
  it("limite invalide = rien", () => {
    expect(selectDetailSaleIds(sales, 0)).toEqual([]);
    expect(selectDetailSaleIds(sales, -3)).toEqual([]);
  });
});

describe("expirations et verrouillage", () => {
  it("QR périmé après 7 jours", () => {
    expect(isQrExpired("2026-09-01T00:00:00.000Z", "2026-09-08T00:00:00.000Z")).toBe(false);
    expect(isQrExpired("2026-09-01T00:00:00.000Z", "2026-09-08T00:00:00.001Z")).toBe(true);
  });
  it("session valide 90 jours", () => {
    expect(isSessionExpired("2026-06-01T00:00:00.000Z", "2026-08-30T00:00:00.000Z")).toBe(false);
    expect(isSessionExpired("2026-06-01T00:00:00.000Z", "2026-09-01T00:00:00.001Z")).toBe(true);
  });
  it("verrou au 5e échec pour 5 minutes", () => {
    const now = "2026-09-29T10:00:00.000Z";
    const s4 = nextFailedState(3, now);
    expect(s4).toEqual({ failedAttempts: 4, lockedUntilISO: null });
    const s5 = nextFailedState(4, now);
    expect(s5.failedAttempts).toBe(5);
    expect(s5.lockedUntilISO).not.toBeNull();
    expect(isLocked(s5.lockedUntilISO, now)).toBe(true);
    expect(isLocked(null, now)).toBe(false);
    const after = new Date(Date.parse(now) + CLIENT_LOCK_MINUTES * 60_000 + 1000).toISOString();
    expect(isLocked(s5.lockedUntilISO, after)).toBe(false);
  });
  it("dates illisibles = erreur contrôlée", () => {
    expect(() => isQrExpired("nope", "2026-09-01T00:00:00.000Z")).toThrow();
  });
});

describe("annonces", () => {
  it("1..120 caractères", () => {
    expect(() => assertValidAnnouncement("Fermé vendredi")).not.toThrow();
    expect(validateAnnouncement("  Fermé vendredi  ")).toBe("Fermé vendredi");
    expect(() => assertValidAnnouncement("   ")).toThrow();
    expect(() => assertValidAnnouncement("x".repeat(121))).toThrow();
  });
});

describe("validateurs IPC (frontière Zod)", () => {
  it("activation : PIN 6 chiffres + UUID requis", () => {
    const base = { operationId: OP, customerId: 3, phone: "0550", pin: "123456" };
    expect(clientAccessActivateSchema.safeParse(base).success).toBe(true);
    expect(clientAccessActivateSchema.safeParse({ ...base, pin: "12345" }).success).toBe(false);
    expect(clientAccessActivateSchema.safeParse({ ...base, pin: "12345a" }).success).toBe(false);
    expect(clientAccessActivateSchema.safeParse({ ...base, operationId: "nope" }).success).toBe(
      false,
    );
  });
  it("file : kind fermé + mois AAAA-MM", () => {
    const base = { operationId: OP, customerId: 3, kind: "invoice_detail" as const, saleId: 9 };
    expect(syncEnqueueSchema.safeParse(base).success).toBe(true);
    expect(syncEnqueueSchema.safeParse({ ...base, kind: "delete_all" }).success).toBe(false);
    // Union POS 0032 (6 kinds) : un kind valide en base doit franchir la
    // frontière, sinon la poussée échoue pour un cliché pourtant accepté
    // par le CHECK de `sync_outbox`.
    expect(syncEnqueueSchema.safeParse({ ...base, kind: "announcement" }).success).toBe(true);
    expect(syncEnqueueSchema.safeParse({ ...base, kind: "access_revocation" }).success).toBe(true);
    expect(syncEnqueueSchema.safeParse({ ...base, monthKey: "09-2026" }).success).toBe(false);
  });
  it("annonce : 1..120 caractères", () => {
    expect(announcementSaveSchema.safeParse({ operationId: OP, text: "Fermé" }).success).toBe(true);
    expect(announcementSaveSchema.safeParse({ operationId: OP, text: "" }).success).toBe(false);
    expect(
      announcementSaveSchema.safeParse({ operationId: OP, text: "x".repeat(121) }).success,
    ).toBe(false);
  });
});
function sale(partial: Partial<SnapshotSaleRow> & { id: number }): SnapshotSaleRow {
  return {
    invoice_number: `FAC-${partial.id}`,
    total_minor: 100000,
    amount_paid_minor: 0,
    remaining_balance_minor: 100000,
    payment_status: "unpaid",
    is_cancelled: 0,
    created_at: "2026-09-01T10:00:00.000Z",
    ...partial,
  };
}
function pay(partial: Partial<SnapshotPaymentRow> & { id: number }): SnapshotPaymentRow {
  return {
    amount_minor: 50000,
    method: "cash",
    reference: null,
    sale_id: null,
    payment_date: "2026-09-01",
    ...partial,
  };
}

describe("cliché d'affichage", () => {
  it("3 dernières factures/paiements, mois, points, top produits", () => {
    const sales = [
      sale({ id: 1, created_at: "2026-09-01T10:00:00.000Z" }),
      sale({ id: 2, created_at: "2026-09-10T10:00:00.000Z" }),
      sale({
        id: 3,
        created_at: "2026-08-05T10:00:00.000Z",
        total_minor: 200000,
        remaining_balance_minor: 200000,
      }),
      sale({ id: 4, created_at: "2026-09-20T10:00:00.000Z", is_cancelled: 1 }),
      sale({ id: 5, created_at: "2026-09-15T10:00:00.000Z" }),
    ];
    const payments = [
      pay({ id: 1, payment_date: "2026-09-02", amount_minor: 50000 }),
      pay({ id: 2, payment_date: "2026-08-02", amount_minor: 70000 }),
      pay({ id: 3, payment_date: "2026-09-12", amount_minor: 30000 }),
      pay({ id: 4, payment_date: "2026-09-18", amount_minor: 10000 }),
    ];
    const items: SnapshotItemRow[] = [
      { product_name_snapshot: "Sucre", quantity: 2, unit_price_minor: 9000 },
      { product_name_snapshot: "Sucre", quantity: 3, unit_price_minor: 9500 },
      { product_name_snapshot: "Huile", quantity: 10, unit_price_minor: 12000 },
    ];
    const snap = buildClientSnapshot(sales, payments, items, "2026-09", 250000);
    expect(snap.lastSales.map((s) => s.id)).toEqual([5, 2, 1]);
    expect(snap.lastPayments.map((p) => p.id)).toEqual([4, 3, 1]);
    expect(snap.monthPurchasesMinor).toBe(300000);
    expect(snap.monthPaymentsMinor).toBe(90000);
    expect(snap.loyaltyPoints).toBe(2);
    expect(snap.topProducts[0]).toEqual({ name: "Huile", quantity: 10, lastPriceMinor: 12000 });
    expect(snap.topProducts[1]).toEqual({ name: "Sucre", quantity: 5, lastPriceMinor: 9500 });
  });
  it("mois invalide et montants négatifs refusés", () => {
    expect(() => buildClientSnapshot([], [], [], "2026-13", 0)).not.toThrow();
    expect(() => buildClientSnapshot([], [], [], "septembre", 0)).toThrow();
    expect(() =>
      buildClientSnapshot([sale({ id: 9, total_minor: -5 })], [], [], "2026-09", 0),
    ).toThrow();
  });
});

describe("#39 : paramètres canoniques de dérivation PIN (devinette lente)", () => {
  it("constantes KDF exactes (tout miroir doit s'aligner)", () => {
    expect(PIN_KDF_ALGO).toBe("pbkdf2-sha256-100k");
    expect(PIN_KDF_ITERATIONS).toBe(100_000);
    expect(PIN_KDF_KEYLEN_BYTES).toBe(32);
    expect(PIN_KDF_SALT_BYTES).toBe(16);
    expect(PIN_KDF_DIGEST).toBe("SHA-256");
  });
});
