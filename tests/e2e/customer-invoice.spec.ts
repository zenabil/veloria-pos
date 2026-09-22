// Veloria PoS — E2E : fiche client depuis la caisse + aperçu facture double
// format (requêtes 1-3). Dossiers isolés.
import { test } from "@playwright/test";
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

test.beforeEach(async () => {
  ctx = await launchActivatedApp(makeIsolatedDirs());
});

test.afterEach(async () => {
  await closeApp(ctx);
});

test("fiche client depuis la vente + aperçu facture 80mm/A4", async () => {
  const { page } = ctx;
  const product = uniqueTag("E2ECli");
  const who = `Cli${uniqueTag("X").slice(-8)} Nom${uniqueTag("Y").slice(-8)}`;

  await gotoModule(page, "Clients");
  await page.locator('button[title="Créer un client"]').click();
  await page.getByLabel("Nom complet", { exact: true }).fill(who);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await readSuccessToast(page, /créé/);

  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(product);
  await page.getByLabel("Prix de vente", { exact: true }).fill("100");
  await page.getByLabel("Stock", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  // Vente comptant au client (facture liée, soldée).
  await gotoModule(page, "Vente");
  await page.getByLabel("Recherche produit", { exact: true }).fill(product);
  await page
    .getByRole("button", { name: new RegExp(product) })
    .first()
    .click();
  await page.getByLabel("Rechercher un client").fill(who.slice(0, 14));
  await page
    .getByRole("button", { name: new RegExp(who.slice(0, 10)) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser [F10]" }).click();
  await settlePayment(page, "100", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);
  // Fermer l'aperçu de vente (Échap) pour retrouver la caisse.
  await page.keyboard.press("Escape");

  // La vente vide le panier (comportement caisse voulu) : re-sélectionner
  // le client pour ouvrir sa fiche depuis la caisse.
  await page.getByLabel("Rechercher un client").fill(who.slice(0, 14));
  await page
    .getByRole("button", { name: new RegExp(who.slice(0, 10)) })
    .first()
    .click();

  // Requête 1 : entrée directe à la fiche depuis le nom en caisse.
  // (le nom accessible vient de l'aria-label « Ouvrir la fiche de … »,
  // pas du texte visible « · Fiche » qu'il remplace).
  await page.getByRole("button", { name: /Ouvrir la fiche de/ }).click();
  await expect(page.getByText("Dette actuelle")).toBeVisible();
  await page.getByRole("button", { name: /Voir les factures/ }).click();
  await expect(page.getByText(invoice, { exact: false }).first()).toBeVisible();
  // Requête 2 : aperçu facture depuis la fiche, deux formats.
  // (nom accessible = aria-label « Apercevoir la facture … », pas le texte
  // visible « Aperçu / Réimprimer » qu'il remplace — même piège que la fiche).
  await page
    .getByRole("button", { name: new RegExp(`Apercevoir la facture ${invoice}`) })
    .first()
    .click();
  await expect(page.getByRole("tab", { name: "Facture A4" })).toBeVisible();
  await page.getByRole("tab", { name: "Ticket 80mm" }).click();
  await expect(page.getByLabel(new RegExp(`Aperçu ticket ${invoice}`))).toBeVisible();
  await page.getByRole("tab", { name: "Facture A4" }).click();
  await expect(page.locator("iframe").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
});

test("historique : aperçu facture 80mm + A4", async () => {
  const { page } = ctx;
  const product = uniqueTag("E2EHist");
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(product);
  await page.getByLabel("Prix de vente", { exact: true }).fill("50");
  await page.getByLabel("Stock", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  await gotoModule(page, "Vente");
  await page.getByLabel("Recherche produit", { exact: true }).fill(product);
  await page
    .getByRole("button", { name: new RegExp(product) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser [F10]" }).click();
  await settlePayment(page, "50", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);
  await page.keyboard.press("Escape");

  // Requête 3 : double format depuis l'historique.
  await gotoModule(page, "Historique");
  await page.getByPlaceholder("N° facture / scan code-barres… [F3]").fill(invoice);
  await page
    .getByRole("row", { name: new RegExp(invoice) })
    .filter({ hasText: "Vente" })
    .first()
    .click();
  await page.getByRole("button", { name: /Voir le document/ }).click();
  await expect(page.getByRole("tab", { name: "Facture A4" })).toBeVisible();
  await expect(page.locator("iframe").first()).toBeVisible();
  await page.getByRole("tab", { name: "Ticket 80mm" }).click();
  await expect(page.getByLabel("Aperçu ticket 80mm")).toBeVisible();
});
