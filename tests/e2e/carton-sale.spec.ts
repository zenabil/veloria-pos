// Veloria PoS — E2E : vente d'un carton + 4 pièces (conditionnement réel).
// Produit : œufs, 1 carton = 30 pièces, achat carton 540 DZD, vente carton
// 650 DZD, vente pièce 25 DZD. Le panier raisonne en pièces (34), la vente
// doit produire 1 ligne carton + 1 ligne pièces, déduire 34 unités de base et
// facturer 650 + 4 × 25 = 750 DZD.
import { test } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import {
  closeApp,
  gotoModule,
  launchActivatedApp,
  readSuccessToast,
  settlePayment,
  uniqueTag,
  expect,
  type AppContext,
} from "./helpers.ts";

let ctx: AppContext;

test.beforeEach(async () => {
  ctx = await launchActivatedApp();
});

test.afterEach(async () => {
  await closeApp(ctx);
});

test("vend 1 carton de 30 + 4 pièces : totaux, ticket, stock et lignes carton", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EOeufs");

  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  await page.getByLabel("Prix d'achat", { exact: true }).fill("18");
  await page.getByLabel("Prix de vente", { exact: true }).fill("25");
  await page.getByLabel("Stock", { exact: true }).fill("34");
  await page.getByRole("switch", { name: "Activer le conditionnement" }).click();
  await page.getByLabel("Libellé du conditionnement").fill("Carton de 30");
  await page.getByLabel("Taille du carton").fill("30");
  await page.getByLabel("Prix du carton", { exact: true }).fill("650");
  await page.getByLabel("Prix d'achat du carton").fill("540");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();

  await gotoModule(page, "Caisse");
  await page.getByLabel("Recherche produit", { exact: true }).fill(name);
  await page
    .getByRole("option", { name: new RegExp(name) })
    .first()
    .click();
  await page.getByLabel(`Quantité ${name}`, { exact: true }).fill("34");

  // Panier : 34 pièces = 1 carton de 30 + 4 pièces, tarif carton appliqué.
  await expect(page.getByText(/1 carton de 30 \+ 4 unité\(s\)/)).toBeVisible();
  await expect(page.getByText("Tarif carton")).toBeVisible();
  await expect(page.getByText(/Économie/)).toBeVisible();
  await expect(page.getByText("100,00 DZD").first()).toBeVisible();
  await expect(page.getByText("750,00 DZD").first()).toBeVisible();

  await page.getByRole("button", { name: "Encaisser", exact: true }).click();
  await settlePayment(page, "750", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);

  // Ticket : lignes carton + pièces, total exact.
  const ticket = page.locator("pre", { hasText: invoice });
  await expect(ticket).toBeVisible();
  await expect(ticket).toContainText(/Carton de 30/i);
  await expect(ticket).toContainText("750,00");

  // Preuve SQLite : 1 ligne carton ×30 + 1 ligne pièces ×4, stock 0.
  const dbPath = path.join(ctx.programData, "Veloria PoS", "Data", "Veloria POS DB.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA query_only = ON;");
  try {
    const sale = db
      .prepare(
        "SELECT id, subtotal_minor, discount_amount_minor, total_minor, amount_paid_minor FROM sales ORDER BY id DESC LIMIT 1",
      )
      .get() as {
      id: number;
      subtotal_minor: number;
      discount_amount_minor: number;
      total_minor: number;
      amount_paid_minor: number;
    };
    expect(Number(sale.subtotal_minor)).toBe(85000);
    expect(Number(sale.discount_amount_minor)).toBe(10000);
    expect(Number(sale.total_minor)).toBe(75000);
    expect(Number(sale.amount_paid_minor)).toBe(75000);

    const items = db
      .prepare(
        "SELECT quantity, unit_factor, packaging_id, unit_price_minor, original_unit_price_minor, line_total_minor, unit_code FROM sale_items WHERE sale_id = ? ORDER BY id",
      )
      .all(sale.id) as {
      quantity: number;
      unit_factor: number;
      packaging_id: number | null;
      unit_price_minor: number;
      original_unit_price_minor: number;
      line_total_minor: number;
      unit_code: string;
    }[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      quantity: 1,
      unit_factor: 30,
      unit_price_minor: 65000,
      original_unit_price_minor: 75000,
      line_total_minor: 65000,
      unit_code: "Carton de 30",
    });
    expect(items[0]?.packaging_id).not.toBeNull();
    expect(items[1]).toMatchObject({
      quantity: 4,
      unit_factor: 1,
      packaging_id: null,
      unit_price_minor: 2500,
      original_unit_price_minor: 2500,
      line_total_minor: 10000,
    });

    const product = db.prepare("SELECT quantity FROM products WHERE name = ?").get(name) as {
      quantity: number;
    };
    expect(Number(product.quantity)).toBe(0);
    const layers = db
      .prepare(
        "SELECT COALESCE(SUM(remaining_quantity),0) AS q FROM inventory_layers WHERE product_id = (SELECT id FROM products WHERE name = ?)",
      )
      .get(name) as { q: number };
    expect(Number(layers.q)).toBe(0);
  } finally {
    db.close();
  }
});
