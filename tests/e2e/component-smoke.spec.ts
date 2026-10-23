// Veloria PoS — E2E smoke : composants. Pour chaque écran, vérifie le rendu
// et l'absence de crash/console errors ; clique les boutons d'ajout et ferme
// les dialogues sans valider.
import { test } from "@playwright/test";
import { closeApp, gotoModule, launchActivatedApp, type AppContext } from "./helpers.ts";

const MODULE_LABELS = [
  "Caisse",
  "Tableau de bord",
  "Historique",
  "Rapports",
  "Zakat",
  "Catalogue",
  "Stock",
  "Fournisseurs",
  "Clients",
  "Dettes",
  "Retours",
  "Dépenses",
  "Devis",
  "Impression",
  "Paramètres",
  "Licence",
];

let ctx: AppContext;

test.beforeEach(async () => {
  ctx = await launchActivatedApp();
});

test.afterEach(async () => {
  await closeApp(ctx);
});

test("component-smoke : rendu et clics sans crash", async () => {
  const { page } = ctx;
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  for (const label of MODULE_LABELS) {
    await gotoModule(page, label);
    // Vérifie que le titre de l'écran est présent.
    await page.getByRole("heading", { name: label }).first().waitFor({ timeout: 15_000 });
    // Tente d'ouvrir un dialogue d'ajout s'il existe, puis le referme.
    // Toujours limité au <main> puis au dialogue : le bouton « Fermer » de la
    // barre de titre ne doit jamais être cliqué (il quitterait l'application).
    const main = page.getByRole("main");
    const addBtn = main.getByRole("button", { name: /Ajouter|Nouveau|Créer|Nouvelle/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      const dialog = page.getByRole("dialog").last();
      if (await dialog.isVisible().catch(() => false)) {
        const cancel = dialog.getByRole("button", { name: /Annuler|Fermer/i }).first();
        if (await cancel.isVisible().catch(() => false)) {
          await cancel.click({ timeout: 5_000 }).catch(() => undefined);
        } else {
          await page.keyboard.press("Escape").catch(() => undefined);
        }
      }
      await page.waitForTimeout(200);
    }
  }
  await gotoModule(page, "Caisse");
  const real = consoleErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  if (real.length > 0) {
    throw new Error(`Erreurs console pendant le smoke composants :\n${real.join("\n")}`);
  }
});
