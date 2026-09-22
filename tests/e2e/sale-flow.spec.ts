// Veloria PoS — E2E : ouverture, produit, panier, quantités, totaux,
// vente comptant, historique, stock, aperçu d'impression.
// Base vierge par test (helpers) : répétable, indépendant de l'ordre.
import { test } from "@playwright/test";
import {
  closeApp,
  gotoModule,
  launchActivatedApp,
  readSuccessToast,
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

async function createProduct(name: string, priceDzd: string, stock: string): Promise<void> {
  const { page } = ctx;
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  await page.getByLabel("Prix de vente", { exact: true }).fill(priceDzd);
  await page.getByLabel("Stock", { exact: true }).fill(stock);
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
}

test("ouverture normale : coquille chargée, module Vente actif", async () => {
  const { page } = ctx;
  await expect(page.getByRole("heading", { name: "Vente" })).toBeVisible();
  await expect(page.getByLabel("Recherche produit", { exact: true })).toBeVisible();
  await expect(page.getByText("Caisse prête")).toBeVisible();
});

test("création et sélection d'un produit", async () => {
  const name = uniqueTag("E2EProduit");
  await createProduct(name, "100", "50");
});

test("panier : ajout, quantité, sous-total et total", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EPanier");
  await createProduct(name, "100", "50");
  await gotoModule(page, "Vente");
  await page.getByLabel("Recherche produit", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.getByLabel(`Quantité ${name}`, { exact: true })).toHaveValue("1");
  await page.getByRole("button", { name: `Augmenter ${name}` }).click();
  await expect(page.getByLabel(`Quantité ${name}`, { exact: true })).toHaveValue("2");
  // Ligne : 2 × 100,00 DZD puis total à payer.
  await expect(page.getByText("200,00 DZD").first()).toBeVisible();
  await expect(page.getByText("Total à payer")).toBeVisible();
});

test("vente comptant : historique, stock et aperçu sans imprimante", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EVente");
  await createProduct(name, "100", "50");
  await gotoModule(page, "Vente");
  await page.getByLabel("Recherche produit", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await page.getByRole("button", { name: `Augmenter ${name}` }).click();
  await page.getByRole("button", { name: "Encaisser [F10]" }).click();
  await page.getByLabel("Montant reçu", { exact: true }).fill("200");
  await page.getByRole("button", { name: /Valider ·/ }).click();
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);
  // Panier vidé après vente.
  await expect(page.getByText("Caisse prête")).toBeVisible();
  // Aperçu d'impression (mode 80mm par défaut, sans imprimante).
  await expect(page.getByRole("heading", { name: new RegExp(invoice) })).toBeVisible();
  await expect(page.locator("pre", { hasText: invoice })).toBeVisible();
  // Historique : la facture est enregistrée.
  await gotoModule(page, "Historique");
  await page.getByPlaceholder("N° facture / scan code-barres… [F3]").fill(invoice);
  // La ligne de vente (le paiement lié partage la référence : on filtre le type).
  await expect(
    page
      .getByRole("row", { name: new RegExp(invoice) })
      .filter({ hasText: "Vente" })
      .first(),
  ).toBeVisible();
  // Stock : 50 − 2 = 48.
  await gotoModule(page, "Stock");
  await page.getByLabel("Rechercher un produit en stock", { exact: true }).fill(name);
  await expect(page.getByRole("row", { name: new RegExp(name) }).getByText(/48/)).toBeVisible();
});
