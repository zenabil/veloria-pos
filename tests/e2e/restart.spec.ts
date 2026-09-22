// Veloria PoS — E2E : redémarrage de l'application (persistance des données).
// L'UI n'expose aucun bouton Redémarrer : le redémarrage est déclenché via le
// pont applicatif (même canal `app.restart` qu'utiliserait un bouton), puis
// l'app est relancée sur les MÊMES dossiers et l'historique est vérifié.
// Base vierge : répétable, indépendant de l'ordre.
import { test } from "@playwright/test";
import {
  closeApp,
  gotoModule,
  killStaleTestInstances,
  launchActivatedApp,
  readSuccessToast,
  settlePayment,
  relaunchApp,
  uniqueTag,
  waitForProcessExit,
  expect,
  type AppContext,
} from "./helpers.ts";

test.setTimeout(180_000);

let ctx: AppContext;

test.beforeEach(async () => {
  ctx = await launchActivatedApp();
});

test.afterEach(async () => {
  await closeApp(ctx);
});

test("restart : la vente reste enregistrée après redémarrage", async () => {
  const name = uniqueTag("E2ERestart");
  const { page } = ctx;
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  await page.getByLabel("Prix de vente", { exact: true }).fill("100");
  await page.getByLabel("Stock", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
  await gotoModule(page, "Vente");
  await page.getByLabel("Recherche produit", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser [F10]" }).click();
  await settlePayment(page, "100", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);

  // Redémarrage réel via le pont (canal app.restart) : la promesse est
  // rejetée quand la page se ferme — attendu, la suite le vérifie.
  const child = ctx.app.process();
  await page.evaluate("window.veloria.app.restart()").catch(() => undefined);
  await page.waitForEvent("close", { timeout: 30_000 }).catch(() => undefined);
  await waitForProcessExit(child, 30_000);
  // Une relance automatique a pu garder le verrou : on nettoie les instances
  // de test orphelines avant de relancer proprement sur les mêmes dossiers.
  await killStaleTestInstances();

  // Relance sur les mêmes dossiers : démarrage normal + données conservées.
  ctx = await relaunchApp(ctx);
  await gotoModule(ctx.page, "Historique");
  await ctx.page.getByPlaceholder("N° facture / scan code-barres… [F3]").fill(invoice);
  await expect(
    ctx.page
      .getByRole("row", { name: new RegExp(invoice) })
      .filter({ hasText: "Vente" })
      .first(),
  ).toBeVisible();
});
