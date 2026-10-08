// Veloria PoS — E2E : réinitialisation d'usine (zone dangereuse).
// Crée un produit → Paramètres > Données → Réinitialiser (confirmation
// tapée REINITIALISER) → redémarrage → base VIERGE (produit introuvable,
// caisse prête). Base isolée par test : aucun impact production.
import { test } from "@playwright/test";
import {
  closeApp,
  gotoModule,
  killStaleTestInstances,
  launchActivatedApp,
  readSuccessToast,
  relaunchApp,
  uniqueTag,
  waitForProcessExit,
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

test("factory reset : base vierge après réinitialisation confirmée", async () => {
  const name = uniqueTag("E2EReset");
  const { page } = ctx;
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  await page.getByLabel("Prix de vente", { exact: true }).fill("100");
  await page.getByLabel("Stock", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();

  // Paramètres > Données (sauvegarde, base) > Zone dangereuse.
  await gotoModule(page, "Paramètres");
  await page
    .getByRole("list", { name: "Rubriques paramètres" })
    .getByRole("button", { name: /Données/ })
    .click();
  await page.getByRole("button", { name: "Réinitialiser…" }).click();
  // Confirmation tapée exigée (le bouton reste inactif sinon).
  await expect(page.getByRole("button", { name: "Tout effacer" })).toBeDisabled();
  await page.getByLabel("Confirmation de réinitialisation", { exact: true }).fill("REINITIALISER");
  await expect(page.getByRole("button", { name: "Tout effacer" })).toBeEnabled();
  await page.getByRole("button", { name: "Tout effacer" }).click();

  // Redémarrage réel via app.restart : la page se ferme, on relance proprement.
  const child = ctx.app.process();
  await page.waitForEvent("close", { timeout: 30_000 }).catch(() => undefined);
  await waitForProcessExit(child, 30_000);
  await killStaleTestInstances();

  ctx = await relaunchApp(ctx);
  // Base vierge : produit disparu, caisse prête, schéma courant.
  await gotoModule(ctx.page, "Catalogue");
  await expect(ctx.page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
  await gotoModule(ctx.page, "Caisse");
  await expect(ctx.page.getByText("Caisse prête")).toBeVisible();
});
