// Veloria PoS — E2E : vente à crédit (si disponible) puis retour client.
// Base vierge par test : répétable, indépendant de l'ordre.
import { test } from "@playwright/test";
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

async function createProduct(name: string, priceDzd: string, stock: string): Promise<void> {
  const { page } = ctx;
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  await page.getByLabel("Prix de vente", { exact: true }).fill(priceDzd);
  await page.getByLabel("Stock", { exact: true }).fill(stock);
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
}

async function createCreditClient(first: string, last: string): Promise<string> {
  const { page } = ctx;
  const full = `${first} ${last}`;
  await gotoModule(page, "Clients");
  await page.locator('button[title="Créer un client"]').click();
  await page.getByLabel("Nom complet", { exact: true }).fill(full);
  await page.getByRole("switch", { name: "Crédit autorisé" }).click();
  await page.getByRole("button", { name: "Créer le client" }).click();
  await readSuccessToast(page, /créé/);
  return full;
}

test("vente à crédit : reste impayé avec client autorisé", async () => {
  const { page } = ctx;
  const tag = uniqueTag("E2E");
  const product = `Credit${tag}`;
  await createProduct(product, "100", "50");
  const client = await createCreditClient(`E2Ecli${tag}`, `Nom${tag}`);
  await gotoModule(page, "Vente");
  await page.getByLabel("Rechercher un client", { exact: true }).fill(`E2Ecli${tag}`);
  await page
    .getByRole("button", { name: new RegExp(client) })
    .first()
    .click();
  await expect(page.getByText("Crédit autorisé").first()).toBeVisible();
  await page.getByLabel("Recherche produit", { exact: true }).fill(product);
  await page
    .getByRole("button", { name: new RegExp(product) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser [F10]" }).click();
  // Paiement partiel : 50 sur 100 → reste à crédit.
  await settlePayment(page, "50", true);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  expect(toast).toMatch(/FAC-/);
});

test("retour client : remboursement partiel depuis une facture", async () => {
  const { page } = ctx;
  const tag = uniqueTag("E2E");
  const product = `Retour${tag}`;
  await createProduct(product, "100", "50");
  await gotoModule(page, "Vente");
  await page.getByLabel("Recherche produit", { exact: true }).fill(product);
  await page
    .getByRole("button", { name: new RegExp(product) })
    .first()
    .click();
  await page.getByRole("button", { name: `Augmenter ${product}` }).click();
  await page.getByRole("button", { name: "Encaisser [F10]" }).click();
  await settlePayment(page, "200", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);

  await gotoModule(page, "Retours");
  await page.locator('button[title="Nouveau retour"]').click();
  await page.getByPlaceholder(/N° facture ou scan/).fill(invoice);
  await page.getByRole("button", { name: "Chercher" }).click();
  await page.getByLabel(`Quantité ${product}`, { exact: true }).fill("1");
  await page.getByLabel("Montant remboursé", { exact: true }).fill("100");
  await page.getByRole("button", { name: /Valider le retour/ }).click();
  const retToast = await readSuccessToast(page, /Retour .* enregistré/);
  expect(retToast).toMatch(/RET-/);
  // Le retour apparaît dans le journal (référence = facture d'origine).
  await expect(page.getByRole("row", { name: new RegExp(invoice) }).first()).toBeVisible();
});
