// Veloria PoS — E2E : navigation des paramètres reconstruits (rubriques,
// recherche globale et sous-navigation). Aucune donnée métier modifiée.
import { test } from "@playwright/test";
import { closeApp, gotoModule, launchActivatedApp, expect, type AppContext } from "./helpers.ts";

let ctx: AppContext;

test.beforeEach(async () => {
  ctx = await launchActivatedApp();
});

test.afterEach(async () => {
  await closeApp(ctx);
});

test("paramètres : rubriques, recherche et sous-navigation", async () => {
  const { page } = ctx;
  await gotoModule(page, "Paramètres");
  await expect(page.getByRole("heading", { name: "Entreprise" }).first()).toBeVisible();

  const cases: [string, string][] = [
    ["Commerce (vente, clients, fournisseurs)", "Vente"],
    ["Catalogue (produits, stock)", "Produits"],
    ["Documents (factures, impression, zakat)", "Facturation"],
    ["Données (sauvegarde, base)", "Sauvegarde"],
    ["Équipe (gérant, utilisateurs)", "Changer mon code"],
    ["Système (sécurité, à propos)", "Sécurité et affichage"],
  ];
  for (const [button, heading] of cases) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }

  const search = page.getByLabel("Rechercher dans les paramètres", { exact: true });
  await search.fill("restauration");
  await page.getByRole("button", { name: /^Sauvegarde/ }).click();
  await expect(page.getByRole("heading", { name: "Sauvegarde" }).first()).toBeVisible();

  await search.fill("cred");
  await page
    .getByRole("button", { name: /^Vente/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Vente" }).first()).toBeVisible();

  // Sous-navigation : le raccourci « Miroir Android » amène à sa carte.
  await page.getByRole("button", { name: "Données (sauvegarde, base)", exact: true }).click();
  await page.getByRole("button", { name: "Miroir Android", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Miroir Android" })).toBeVisible();
});
