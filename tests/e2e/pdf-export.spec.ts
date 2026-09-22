// Veloria PoS — E2E : export PDF ticket 80mm + facture A4, contenu vérifié.
// Requête 4 : les deux formats s'exportent en PDF lisibles (en-tête %PDF +
// nº de facture et article extraits du texte via pdfjs local).
// Chemins explicites (pas de dialogue natif en E2E). Dossiers isolés.
import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  closeApp,
  gotoModule,
  launchActivatedApp,
  makeIsolatedDirs,
  readSuccessToast,
  settlePayment,
  uniqueTag,
  expect,
  type AppContext,
} from "./helpers.ts";

let ctx: AppContext;
let dirs: { root: string; userData: string; programData: string };

test.beforeEach(async () => {
  dirs = makeIsolatedDirs();
  ctx = await launchActivatedApp(dirs);
});

test.afterEach(async () => {
  await closeApp(ctx);
});

interface Bridge {
  veloria: {
    sales: {
      history: (p: unknown) => Promise<unknown>;
      get: (p: unknown) => Promise<unknown>;
    };
    printing: {
      exportReceiptPdf: (p: unknown) => Promise<unknown>;
      exportA4Pdf: (p: unknown) => Promise<unknown>;
    };
  };
}

async function pdfText(file: string): Promise<string> {
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (opts: { data: Uint8Array }) => { promise: Promise<unknown> };
  };
  const doc = (await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise) as {
    numPages: number;
    getPage: (n: number) => Promise<{
      getTextContent: () => Promise<{ items: { str?: unknown }[] }>;
    }>;
  };
  let out = "";
  for (let p = 1; p <= doc.numPages; p += 1) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items) out += `${typeof it.str === "string" ? it.str : ""} `;
  }
  return out;
}

test("export PDF 80mm + A4 d'une vente comptant (contenu vérifié)", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EPdf");
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  await page.getByLabel("Prix de vente", { exact: true }).fill("250");
  await page.getByLabel("Stock", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  await gotoModule(page, "Vente");
  await page.getByLabel("Recherche produit", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser [F10]" }).click();
  await settlePayment(page, "250", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);

  const pdfDir = path.join(dirs.root, "pdf");
  fs.mkdirSync(pdfDir, { recursive: true });
  const file80 = path.join(pdfDir, "ticket-80mm.pdf");
  const fileA4 = path.join(pdfDir, "facture-A4.pdf");

  // Payload reconstruit côté page depuis la vente stockée (valeurs cohérentes
  // garanties : mêmes totaux que la vente validée côté main à la création).
  const payload = await page.evaluate((inv) => {
    const w = window as unknown as Bridge;
    return (async (): Promise<Record<string, unknown>> => {
      // Bridge brut (sans `call()`) : outcome `{ok, data}` non déballé.
      const h = (await w.veloria.sales.history({ query: inv, page: 1, pageSize: 5 })) as {
        ok: boolean;
        data: { rows: { id: number }[] };
      };
      if (!h.ok) throw new Error("historique indisponible");
      const row = h.data.rows[0];
      if (!row) throw new Error("vente introuvable");
      const g = (await w.veloria.sales.get({ id: row.id })) as {
        ok: boolean;
        data: {
          sale: Record<string, string | number | null>;
          items: Record<string, string | number | null>[];
        };
      };
      if (!g.ok) throw new Error("vente illisible");
      const d = g.data;
      const num = (v: string | number | null | undefined): number =>
        typeof v === "number" ? v : 0;
      const txt = (v: string | number | null | undefined): string => (v == null ? "" : String(v));
      return {
        company: "Veloria",
        companyPhone: "",
        companyAddress: "",
        companyCity: "",
        companyEmail: "",
        companyRc: "",
        companyNif: "",
        companyLogo: "",
        customerName: "",
        customerPhone: "",
        customerAddress: "",
        customerCode: "",
        paymentMethod: txt(d.sale["payment_method"]) || null,
        dueDate: txt(d.sale["due_date"]),
        invoice: txt(d.sale["invoice_number"]),
        date: txt(d.sale["created_at"]),
        lines: d.items.map((l) => ({
          name: txt(l["product_name_snapshot"]),
          qty: num(l["quantity"]),
          unit: txt(l["unit_code"]),
          unitPriceMinor: num(l["unit_price_minor"]),
          lineTotalMinor: num(l["line_total_minor"]),
          ref: typeof l["product_id"] === "number" ? String(l["product_id"]).padStart(5, "0") : "—",
        })),
        subtotalMinor: num(d.sale["subtotal_minor"]),
        discountMinor: num(d.sale["discount_amount_minor"]),
        deliveryMinor: num(d.sale["delivery_fee_minor"]),
        totalMinor: num(d.sale["total_minor"]),
        paidMinor: num(d.sale["amount_paid_minor"]),
      };
    })();
  }, invoice);

  const exp80 = (await page.evaluate(
    ([p, f]: unknown[]) =>
      (window as unknown as Bridge).veloria.printing.exportReceiptPdf({
        ...(p as Record<string, unknown>),
        filePath: f as string,
      }),
    [payload, file80],
  )) as { ok: boolean; data: { saved: boolean; path: string } };
  expect(exp80.ok).toBe(true);
  expect(exp80.data.saved).toBe(true);
  const expA4 = (await page.evaluate(
    ([p, f]: unknown[]) =>
      (window as unknown as Bridge).veloria.printing.exportA4Pdf({
        ...(p as Record<string, unknown>),
        filePath: f as string,
      }),
    [payload, fileA4],
  )) as { ok: boolean; data: { saved: boolean; path: string } };
  expect(expA4.ok).toBe(true);
  expect(expA4.data.saved).toBe(true);

  const t80 = await pdfText(file80);
  const tA4 = await pdfText(fileA4);
  expect(t80).toContain(invoice);
  expect(tA4).toContain(invoice);
  expect(t80).toContain(name);
  expect(tA4).toContain(name);
  expect(fs.statSync(file80).size).toBeGreaterThan(1000);
  expect(fs.statSync(fileA4).size).toBeGreaterThan(1000);
});
