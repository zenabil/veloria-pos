// Veloria PoS — E2E : un code-barres saisi en minuscules est affiché et
// stocké en majuscules, puis retrouvé dans le catalogue et la caisse.
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

test("code-barres : saisie minuscule → majuscules et recherche insensible", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EBarcode");

  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  const barcode = page.getByLabel("Ajouter un code-barres", { exact: true });
  await barcode.fill("abc-42x");
  await expect(barcode).toHaveValue("ABC-42X");
  await barcode.press("Enter");
  await expect(page.getByText("ABC-42X", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  const search = page.getByLabel("Rechercher un produit", { exact: true });
  await search.fill("abc-42x");
  await expect(search).toHaveValue("ABC-42X");
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();

  await gotoModule(page, "Caisse");
  const sellSearch = page.getByLabel("Recherche produit", { exact: true });
  // Code partiel : pas d'ajout automatique, on vérifie seulement l'affichage.
  await sellSearch.fill("abc-42");
  await expect(sellSearch).toHaveValue("ABC-42");
});
