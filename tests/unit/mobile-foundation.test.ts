// Veloria Client (APK) — fondations : tokens, i18n, formateurs, appel sync.
import { describe, expect, it } from "vitest";
import { COLORS, debtColor, SIZES } from "../../mobile/src/tokens";
import { allKeys, direction, t, type Lang } from "../../mobile/src/i18n";
import {
  errorReportText,
  formatDateFr,
  formatDateTimeFr,
  formatMinor,
  monthLabel,
  normalizeDigits,
} from "../../mobile/src/format";
import { assertCredentials, fetchInvoiceDetail, syncNow, SyncError } from "../../mobile/src/api";
import {
  clearCache,
  loadCache,
  loadDetail,
  loadLastPhone,
  saveCache,
  saveDetail,
  saveLastPhone,
} from "../../mobile/src/cache";
import { EMPTY_CACHE } from "../../mobile/src/store";

describe("tokens", () => {
  it("identité Veloria : header sombre + contenu clair + touch 48", () => {
    expect(COLORS.headerBg).toBe("#051424");
    expect(COLORS.primary).toBe("#fbbf24");
    expect(SIZES.touchMin).toBe(48);
    expect(SIZES.pageSize).toBe(20);
  });
  it("couleurs de dette : rouge au-delà / dépassement, ambre si due", () => {
    expect(debtColor("overdue", false)).toBe(COLORS.debtOverdue);
    expect(debtColor("due", false)).toBe(COLORS.debtDue);
    expect(debtColor("due", true)).toBe(COLORS.debtOverdue);
    expect(debtColor("none", false)).toBe(COLORS.debtOk);
  });
});

describe("i18n", () => {
  it("chaque clé a ar + fr non vides, sens d'écriture correct", () => {
    for (const k of allKeys()) {
      expect(t("ar", k).length).toBeGreaterThan(0);
      expect(t("fr", k).length).toBeGreaterThan(0);
    }
    expect(direction("ar")).toBe("rtl");
    expect(direction("fr")).toBe("ltr");
  });
  it("glossaire verrouillé : libellés critiques présents", () => {
    const ar: Lang = "ar";
    expect(t(ar, "debtRemaining")).toBe("الدين المتبقي");
    expect(t("fr", "lastSync")).toBe("Dernière synchro");
  });
  it("staleData : phrase COMPLÈTE, jamais un fragment attendant une date", () => {
    // Régression : « Magasin hors ligne, données du » / « … نسخة من » se
    // lisait uniquement suivi d'une date (en-tête et toasts sont seuls).
    const fr = t("fr", "staleData");
    const ar = t("ar", "staleData");
    expect(fr.endsWith("du")).toBe(false);
    expect(fr.endsWith(",")).toBe(false);
    expect(ar.endsWith("من")).toBe(false);
    expect(fr).toContain("Magasin hors ligne");
    expect(ar).toContain("المحل غير متصل");
  });
});

describe("formateurs", () => {
  it("centimes → groupés insécables + unité (jamais de float)", () => {
    expect(formatMinor(1250000, "fr")).toBe("12 500,00 DZD");
    expect(formatMinor(1250000, "ar")).toBe("12 500,00 دج");
    expect(formatMinor(0, "fr")).toBe("0,00 DZD");
    expect(() => formatMinor(12.5, "fr")).toThrow();
    expect(() => formatMinor(Number.NaN, "fr")).toThrow();
  });
  it("dates ISO → JJ/MM/AAAA, invalide → —", () => {
    expect(formatDateFr("2026-09-28T10:00:00.000Z")).toBe("28/09/2026");
    expect(formatDateFr("nope")).toBe("—");
  });
  it("horodatage ISO → JJ/MM HH:MM (heure locale), invalide → —", () => {
    expect(formatDateTimeFr("nope")).toBe("—");
    // Instant EXPLICITE (UTC) : l'affichage se fait en heure d'Alger
    // (UTC+1) et le résultat NE DOIT PAS dépendre du fuseau de la machine
    // (le runner CI est en UTC, le poste vendor en UTC+1).
    const d = new Date("2026-10-30T14:21:00.000Z");
    expect(formatDateTimeFr(d.toISOString())).toBe("30/10 15:21");
  });
  it("chiffres arabes/persans → ASCII (clavier arabe)", () => {
    expect(normalizeDigits("٠٥٥٠١٢٣٤٥٦")).toBe("0550123456");
    expect(normalizeDigits("۱۲۳۴۵۶")).toBe("123456");
    expect(normalizeDigits("05 5012-3456")).toBe("05 5012-3456");
  });
  it("mois AAAA-MM → nom local (référentiel algérien)", () => {
    expect(monthLabel("2026-09", "ar")).toBe("سبتمبر 2026");
    expect(monthLabel("2026-09", "fr")).toBe("Septembre 2026");
    expect(monthLabel("2026-01", "ar")).toBe("جانفي 2026");
    expect(monthLabel("2026-07", "ar")).toBe("جويلية 2026");
    expect(monthLabel("nope", "ar")).toBe("nope");
  });
  it("texte WhatsApp pré-rempli bilingue", () => {
    const ar = errorReportText({
      lang: "ar",
      name: "Karim",
      invoice: "FAC-1",
      amountMinor: 100000,
    });
    expect(ar).toContain("FAC-1");
    expect(ar).toContain("1 000,00 دج");
    expect(errorReportText({ lang: "fr", name: "K", invoice: "F", amountMinor: 0 })).toContain(
      "Merci",
    );
  });
});

describe("cache local", () => {
  it("vide au départ", () => {
    expect(EMPTY_CACHE.syncedAt).toBeNull();
  });
  it("repli mémoire : détail relisible, purge complète au logout (web/sans natif)", () => {
    // Sous vitest, expo-sqlite est absent → branche mémoire de cache.ts.
    clearCache();
    saveCache({
      snapshot: null,
      invoices: null,
      payments: null,
      catalog: null,
      catalogVersion: null,
      catalogPublishedAt: null,
      syncedAt: "2026-09-29T10:00:00Z",
    });
    saveDetail(42, { sale: { id: 42, invoice_number: "FAC-1" } }, "2026-09-29T10:00:00Z");
    expect(loadCache().syncedAt).toBe("2026-09-29T10:00:00Z");
    expect(loadDetail(42)?.detail).toMatchObject({ sale: { id: 42 } });
    // clearCache doit purger AUSSI les `kv.detail:<id>` : sans cela, les
    // factures de la session précédente survivent (fuite cross-session).
    clearCache();
    expect(loadCache().syncedAt).toBeNull();
    expect(loadDetail(42)).toBeNull();
  });
  it("téléphone mémorisé : survit à la purge du cache, jamais le PIN", async () => {
    await saveLastPhone("0550123456");
    expect(await loadLastPhone()).toBe("0550123456");
    // Déconnexion = purge des clichés et des détails ; le numéro déjà saisi
    // reste (V5 « Connexion directe » : l'écran s'ouvre posé sur le PIN).
    clearCache();
    expect(loadCache().syncedAt).toBeNull();
    expect(await loadLastPhone()).toBe("0550123456");
    // Vide ou surdimensionné : refus silencieux, la valeur stockée survit.
    await saveLastPhone("");
    await saveLastPhone("x".repeat(31));
    expect(await loadLastPhone()).toBe("0550123456");
  });
});

describe("appel client-sync", () => {
  interface MockRes {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }
  type MockFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<MockRes>;
  const okPayload = {
    ok: true,
    data: { snapshot: {}, invoices: {}, payments: {}, syncedAt: "x" },
  };
  const okFetch: MockFetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(okPayload),
      text: () => Promise.resolve(""),
    });
  it("valide avant réseau (même règle que le POS)", async () => {
    await expect(syncNow("u", "k", "", "123456", okFetch)).rejects.toMatchObject({
      code: "AUTH_ERROR",
    });
    await expect(syncNow("u", "k", "0550", "12345", okFetch)).rejects.toMatchObject({
      code: "AUTH_ERROR",
    });
    expect(() => assertCredentials("0550", "12345a")).toThrow(SyncError);
  });
  it("succès → clichés + syncedAt", async () => {
    const r = await syncNow("https://x.supabase.co/", "k", "0550", "123456", okFetch);
    expect(r.syncedAt).toBe("x");
  });
  it("envoie apikey + Authorization: Bearer (passerelle Supabase verify_jwt)", async () => {
    let headers: Record<string, string> = {};
    const capture: MockFetch = (_url, init) => {
      headers = init.headers;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(okPayload),
        text: () => Promise.resolve(""),
      });
    };
    await syncNow("https://x.supabase.co/", "anon-1", "0550", "123456", capture);
    expect(headers["apikey"]).toBe("anon-1");
    expect(headers["Authorization"]).toBe("Bearer anon-1");
  });
  it("401/429/403 mappés, timeout → OFFLINE", async () => {
    const errFetch =
      (code: string): MockFetch =>
      () =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ ok: false, code, message: "?" }),
          text: () => Promise.resolve(""),
        });
    await expect(
      syncNow("u", "k", "0550", "123456", errFetch("LOCKED_ERROR")),
    ).rejects.toMatchObject({
      code: "LOCKED_ERROR",
    });
    await expect(
      syncNow("u", "k", "0550", "123456", errFetch("REVOKED_ERROR")),
    ).rejects.toMatchObject({
      code: "REVOKED_ERROR",
    });
    const hanging: MockFetch = () => new Promise<MockRes>(() => {});
    await expect(syncNow("u", "k", "0550", "123456", hanging, 20)).rejects.toMatchObject({
      code: "OFFLINE_ERROR",
    });
  });
  it("détail : saleId envoyé, NOT_FOUND mappé, id invalide refusé sans réseau", async () => {
    let seen = "";
    const detailFetch: MockFetch = (_url, init) => {
      seen = init.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            data: { detail: { sale: { id: 9 }, items: [] }, syncedAt: "y" },
          }),
        text: () => Promise.resolve(""),
      });
    };
    const r = await fetchInvoiceDetail("u", "k", "0550", "123456", 9, detailFetch);
    expect((JSON.parse(seen) as { saleId: number }).saleId).toBe(9);
    expect(r.syncedAt).toBe("y");
    const notFound: MockFetch = () =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ ok: false, code: "NOT_FOUND", message: "?" }),
        text: () => Promise.resolve(""),
      });
    await expect(fetchInvoiceDetail("u", "k", "0550", "123456", 9, notFound)).rejects.toMatchObject(
      {
        code: "NOT_FOUND_ERROR",
      },
    );
    await expect(
      fetchInvoiceDetail("u", "k", "0550", "123456", 0, detailFetch),
    ).rejects.toMatchObject({
      code: "NOT_FOUND_ERROR",
    });
    expect(seen).not.toBe("");
  });
});
