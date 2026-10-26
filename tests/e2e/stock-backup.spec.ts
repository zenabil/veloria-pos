// Veloria PoS — E2E : réception stock, sauvegarde, restauration.
// Base vierge par test : répétable, indépendant de l'ordre.
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
}

async function stockQtyOf(name: string): Promise<string> {
  const { page } = ctx;
  await gotoModule(page, "Stock");
  await page.getByLabel("Rechercher un produit en stock", { exact: true }).fill(name);
  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.waitFor();
  return ((await row.textContent()) ?? "").replace(/\s+/g, " ").trim();
}

test("réception fournisseur : le stock augmente", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EStock");
  await createProduct(name, "100", "10");
  expect(await stockQtyOf(name)).toMatch(/10 PIECE/);
  await page.locator('button[title="Réception fournisseur (facture + livraison)"]').click();
  const dialog = page.getByRole("dialog", { name: /Réception/ });
  await dialog.getByLabel("Rechercher produit ligne 1", { exact: true }).fill(name);
  await dialog
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await page.getByLabel("Prix achat ligne 1", { exact: true }).fill("80");
  await page.getByRole("button", { name: "Valider la réception" }).click();
  const toast = await readSuccessToast(page, /Réception #\d+ enregistrée/);
  expect(toast).toMatch(/Réception/);
  // 10 + 1 réceptionnée = 11.
  expect(await stockQtyOf(name)).toMatch(/11 PIECE/);
});

test("réception : Entrée ne valide pas et une ligne incomplète bloque", async () => {
  const { page } = ctx;
  await gotoModule(page, "Stock");
  await page.locator('button[title="Réception fournisseur (facture + livraison)"]').click();
  const dialog = page.getByRole("dialog", { name: /Réception/ });

  // Entrée dans un champ ne doit jamais déclencher la validation globale.
  await dialog.getByLabel("Numéro de facture", { exact: true }).fill("FAC-TEST");
  await dialog.getByLabel("Numéro de facture", { exact: true }).press("Enter");
  await page.waitForTimeout(400);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  await dialog.getByLabel("Rechercher produit ligne 1", { exact: true }).fill("zzz");
  await dialog.getByRole("button", { name: "Valider la réception" }).click();
  await page.locator('[role="alert"]', { hasText: /incomplète/ }).waitFor();
  // La réception reste ouverte : rien n'a été enregistré en ignorant la ligne.
  await expect(dialog).toBeVisible();
});

test("sauvegarde manuelle : copie créée et listée", async () => {
  const { page } = ctx;
  await gotoModule(page, "Paramètres");
  await page
    .getByRole("list", { name: "Rubriques paramètres" })
    .getByRole("button", { name: "Données (sauvegarde, base)" })
    .click();
  await page.getByRole("button", { name: "Sauvegarder maintenant" }).click();
  await readSuccessToast(page, /Sauvegarde créée/);
  await expect(page.getByRole("button", { name: "Restaurer" }).first()).toBeVisible();
});

test("restauration : la base revient à l'état sauvegardé", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2ERestore");
  await gotoModule(page, "Paramètres");
  await page
    .getByRole("list", { name: "Rubriques paramètres" })
    .getByRole("button", { name: "Données (sauvegarde, base)" })
    .click();
  await page.getByRole("button", { name: "Sauvegarder maintenant" }).click();
  await readSuccessToast(page, /Sauvegarde créée/);
  // Donnée postérieure à la sauvegarde.
  await createProduct(name, "100", "5");
  // Retour aux sauvegardes puis restauration (la plus récente).
  await gotoModule(page, "Paramètres");
  await page
    .getByRole("list", { name: "Rubriques paramètres" })
    .getByRole("button", { name: "Données (sauvegarde, base)" })
    .click();
  // La confirmation est une modale applicative (ConfirmProvider), pas un
  // dialogue natif : on clique sur « Confirmer ». La liste se rafraîchit en
  // arrière-plan (sauvegarde auto) : le clic est rejoué jusqu'à ouverture.
  await expect(async () => {
    await page.getByRole("button", { name: "Restaurer" }).first().click({ timeout: 5_000 });
    await page.getByRole("dialog", { name: /Confirmer l'action/ }).waitFor({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await page
    .getByRole("dialog", { name: /Confirmer l'action/ })
    .getByRole("button", { name: "Confirmer" })
    .click();
  await readSuccessToast(page, /Base restaurée/);
  // Le produit post-sauvegarde a disparu.
  await gotoModule(page, "Catalogue");
  await page.getByPlaceholder("Nom ou code-barres…").fill(name);
  await expect(page.getByText("Aucun produit")).toBeVisible();
});
