// Veloria PoS — E2E : tableau de bord reconstruit (période, KPI, détails,
// export). Une vente réelle est créée dans la base isolée pour éviter l'état vide.
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

test("tableau de bord : période, KPI, onglets de détail et export", async () => {
  const { page } = ctx;
  const product = uniqueTag("E2EDash");

  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(product);
  await page.getByLabel("Prix de vente", { exact: true }).fill("100");
  await page.getByLabel("Stock", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  await gotoModule(page, "Caisse");
  await page.getByLabel("Recherche produit", { exact: true }).fill(product);
  await page
    .getByRole("option", { name: new RegExp(product) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser", exact: true }).click();
  await settlePayment(page, "100", false);
  await readSuccessToast(page, /Vente .* enregistrée/);

  await gotoModule(page, "Tableau de bord");
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await expect(page.getByText("Ventes nettes", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Marge brute", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/100,00/).first()).toBeVisible();

  const presets = page.getByRole("group", { name: "Périodes prédéfinies" });
  await expect(presets.getByRole("button", { name: "Aujourd'hui" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await presets.getByRole("button", { name: "7 derniers jours" }).click();
  await expect(presets.getByRole("button", { name: "7 derniers jours" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("tab", { name: /Stock & dettes/ }).click();
  await expect(page.getByText("Dettes", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Activité récente" }).click();
  await expect(page.getByText("Dernières ventes", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-details.png" });

  await page.getByRole("main").evaluate((el) => {
    el.scrollTo({ top: 0 });
  });
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });

  await page.locator("summary").filter({ hasText: "Exporter" }).click();
  await expect(page.getByRole("button", { name: "Aperçu PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Excel (CSV)" })).toBeVisible();
});
