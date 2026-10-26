// Veloria PoS — E2E : studio d'impression reconstruit (documents, modèles,
// réglages repliables et aperçu). Base isolée, aucune impression réelle.
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

test("studio impression : documents, réglages, aperçu et sauvegarde", async () => {
  const { page } = ctx;
  await gotoModule(page, "Impression");
  await expect(page.getByRole("heading", { name: "Studio d'impression" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ticket 58/80" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Aperçu", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Aperçu modèle")).toBeVisible();

  // Devis : A4 imposé et groupes de réglages repliables.
  await page.getByRole("tab", { name: "Devis A4" }).click();
  await expect(page.getByRole("tab", { name: "Devis A4" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Papier", { exact: true })).toHaveValue("A4");
  const codes = page.getByRole("button", { name: /Codes & étiquettes/ });
  await codes.click();
  await expect(page.getByRole("switch", { name: "Code-barres" })).toBeVisible();
  await page.getByRole("button", { name: /Codes & étiquettes/ }).click();
  await expect(page.getByRole("switch", { name: "Code-barres" })).toBeHidden();

  // Renommage + sauvegarde réelle dans la base isolée.
  const name = uniqueTag("E2EModele");
  await page.getByLabel("Nom du modèle", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await readSuccessToast(page, /Modèle enregistré/);
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();

  await page.getByRole("main").evaluate((el) => {
    el.scrollTo({ top: 0 });
  });
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/print-studio.png", fullPage: true });
});
