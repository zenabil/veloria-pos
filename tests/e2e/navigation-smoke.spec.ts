// Veloria PoS — E2E smoke : navigation. Clique chaque entrée de la sidebar,
// attend le rendu de l'écran, vérifie l'absence de crash / erreur console.
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

test("navigation-smoke : tous les modules s'ouvrent sans crash", async () => {
  const { page } = ctx;
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  for (const label of MODULE_LABELS) {
    await gotoModule(page, label);
    await page.waitForTimeout(300);
  }
  // Retour à la caisse pour finir dans un état stable.
  await gotoModule(page, "Caisse");
  // Filtrer les erreurs bénignes (ex. favicon) — on garde les vraies.
  const real = consoleErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  if (real.length > 0) {
    throw new Error(`Erreurs console pendant la navigation :\n${real.join("\n")}`);
  }
});
