// Veloria PoS — E2E : étiquettes de la sélection MULTI-PAGES.
//
// Régression propriétaire (2026-10-26) : après avoir coché des produits sur
// plusieurs pages du Catalogue, « Étiquettes » n'imprimait que les lignes de
// la page affichée. Le test importe 21 produits (2 pages), sélectionne un
// produit sur chaque page et vérifie que l'aperçu contient BIEN 2 étiquettes.
import { test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("Catalogue : les étiquettes couvrent la sélection des autres pages", async () => {
  const { page } = ctx;
  const tag = uniqueTag("E2ELbl");
  const suffix = String(Date.now()).slice(-6);
  const names = Array.from(
    { length: 21 },
    (_, i) => `${tag} Article ${String(i + 1).padStart(2, "0")}`,
  );
  const csvPath = path.join(os.tmpdir(), `veloria-labels-${tag}.csv`);
  fs.writeFileSync(
    csvPath,
    "nom;vente;achat;quantité;code-barres\n" +
      names
        .map((name, i) => `${name};100;50;5;LBL${suffix}${String(i + 1).padStart(2, "0")}`)
        .join("\n") +
      "\n",
    "utf-8",
  );

  await gotoModule(page, "Catalogue");
  await page.setInputFiles('input[type="file"]', csvPath);
  const confirm = page.getByRole("dialog", { name: "Confirmer l'action" });
  await confirm.waitFor();
  await confirm.getByRole("button", { name: "Confirmer" }).click();
  await readSuccessToast(page, /produit\(s\) importé/);

  // Filtre « tag » ⇒ exactement 21 produits, donc 2 pages (20 + 1).
  await page.getByLabel("Rechercher un produit", { exact: true }).fill(tag);
  await page.getByText("Page 1 sur 2").waitFor();

  // Page 1 : premier produit.
  await page.getByRole("checkbox", { name: `Sélectionner ${names[0]}` }).click();
  await page.getByRole("button", { name: /Suivant/ }).click();
  await page.getByText("Page 2 sur 2").waitFor();

  // Page 2 : seul produit de la page.
  await page.getByRole("checkbox", { name: `Sélectionner ${names[20]}` }).click();
  await expect(page.getByText("2 sélectionné(s)")).toBeVisible();

  // Étiquettes : l'aperçu doit contenir les 2 produits sélectionnés.
  await page.getByRole("button", { name: "Étiquettes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Étiquettes code-barres" });
  await dialog.waitFor();
  const preview = dialog.frameLocator('iframe[title="Aperçu étiquettes"]');
  await expect(preview.locator(".label")).toHaveCount(2);
});
