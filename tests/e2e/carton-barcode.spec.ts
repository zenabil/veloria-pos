// Veloria PoS — E2E : code-barres carton (ADR-149, Phase 3 d'ADR-136).
// Produit : Jben, 10,00 DZD la pièce, carton de 16 facturé 150,00 DZD.
// Deux codes sur la même fiche — pièce et carton. Deux scans du code carton
// doivent ajouter deux cartons (32 unités de base) et facturer 300,00 DZD,
// jamais 320,00 DZD (32 × prix pièce).
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

test("scanne deux cartons : 300 DZD exacts, 32 pièces sorties, liaison en base", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EJben");
  // La fiche normalise les codes en majuscules (étiquettes Code 39) : la
  // preuve SQL compare la valeur telle qu'elle est stockée.
  const pieceCode = `${uniqueTag("P")}16`.toUpperCase();
  const cartonCode = `${uniqueTag("C")}16`.toUpperCase();

  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  await page.getByLabel("Prix d'achat", { exact: true }).fill("8,44");
  await page.getByLabel("Prix de vente", { exact: true }).fill("10");
  await page.getByLabel("Stock", { exact: true }).fill("100");

  // Les deux étiquettes d'abord : la section Conditionnement ne fait que
  // désigner laquelle est un carton (le prix et le facteur restent sur le
  // conditionnement).
  await page.getByLabel("Ajouter un code-barres").fill(pieceCode);
  await page.getByLabel("Ajouter un code-barres").press("Enter");
  await page.getByLabel("Ajouter un code-barres").fill(cartonCode);
  await page.getByLabel("Ajouter un code-barres").press("Enter");

  await page.getByRole("switch", { name: "Activer le conditionnement" }).click();
  await page.getByLabel("Libellé du conditionnement").fill("Carton ×16");
  await page.getByLabel("Taille du carton").fill("16");
  await page.getByLabel("Prix du carton", { exact: true }).fill("150");
  await page.getByLabel("Prix d'achat du carton").fill("135");
  await page.getByLabel("Ajouter un code-barres de carton").fill(cartonCode);
  await page.getByLabel("Ajouter un code-barres de carton").press("Enter");

  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();

  await gotoModule(page, "Caisse");
  const search = page.getByLabel("Recherche produit", { exact: true });
  await search.fill(cartonCode);
  await expect(page.getByText("Tarif carton")).toBeVisible();
  await expect(page.getByText("150,00 DZD").first()).toBeVisible();

  // Second scan : un carton de plus, pas seize pièces au prix pièce.
  await search.fill(cartonCode);
  await expect(page.getByText("300,00 DZD").first()).toBeVisible();

  await page.getByRole("button", { name: "Encaisser", exact: true }).click();
  await settlePayment(page, "300", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);

  const ticket = page.locator("pre", { hasText: invoice });
  await expect(ticket).toBeVisible();
  await expect(ticket).toContainText(/Carton ×16/i);
  await expect(ticket).toContainText("300,00");

  // Preuve SQLite : deux lignes carton ×16, stock 100 → 68, et la liaison du
  // code scanné posée sur le seul code carton.
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
    expect(Number(sale.subtotal_minor)).toBe(32_000);
    expect(Number(sale.discount_amount_minor)).toBe(2_000);
    expect(Number(sale.total_minor)).toBe(30_000);
    expect(Number(sale.amount_paid_minor)).toBe(30_000);

    const items = db
      .prepare(
        "SELECT quantity, unit_factor, packaging_id, unit_price_minor, line_total_minor, unit_code FROM sale_items WHERE sale_id = ? ORDER BY id",
      )
      .all(sale.id) as {
      quantity: number;
      unit_factor: number;
      packaging_id: number | null;
      unit_price_minor: number;
      line_total_minor: number;
      unit_code: string;
    }[];
    // Deux scans du même code rejoignent la même ligne panier (produit + prix
    // identiques) : une ligne de 2 cartons, pas deux lignes.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      quantity: 2,
      unit_factor: 16,
      unit_price_minor: 15_000,
      line_total_minor: 30_000,
      unit_code: "Carton ×16",
    });
    expect(items[0]?.packaging_id).not.toBeNull();

    const product = db.prepare("SELECT quantity FROM products WHERE name = ?").get(name) as {
      quantity: number;
    };
    expect(Number(product.quantity)).toBe(68);

    const links = db
      .prepare(
        `SELECT b.barcode AS barcode, b.packaging_id AS packaging_id
         FROM product_barcodes b JOIN products p ON p.id = b.product_id
         WHERE p.name = ?`,
      )
      .all(name) as { barcode: string; packaging_id: number | null }[];
    const bound = new Map(links.map((l) => [l.barcode, l.packaging_id !== null]));
    expect(bound.get(cartonCode)).toBe(true);
    expect(bound.get(pieceCode)).toBe(false);
  } finally {
    db.close();
  }
});
