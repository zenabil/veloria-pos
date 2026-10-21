// Veloria PoS — E2E : import & export CSV (Clients, Catalogue).
//
// Vérification RÉELLE de la feature dans l'application (base vierge, app
// activée) : le fichier CSV est réellement importé par le main (transaction
// atomique), la fiche apparaît dans le tableau, et l'export parcourt le
// filtre et rapporte le compte de lignes.
//
// Note : l'événement `download` de Playwright n'est PAS émis par Electron
// (le téléchargement est géré par la session Chromium) — l'export est donc
// vérifié par son EFFET (toast FR « N … exporté(s) »), le contenu des
// lignes étant vérifié par le test unitaire `productCsvRows`.
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

test("Clients : import CSV (prénom;nom;téléphone) puis export CSV", async () => {
  const { page } = ctx;
  const tag = uniqueTag("E2ECli");
  // Numéro unique par test (le téléphone est UNIQUE en base — E-28).
  const phone = `0550${String(Date.now()).slice(-6)}`;
  const csvPath = path.join(os.tmpdir(), `veloria-clients-${tag}.csv`);
  fs.writeFileSync(csvPath, `prénom;nom;téléphone\nAmine;${tag};${phone}\n`, "utf-8");

  await gotoModule(page, "Clients");

  // 1. Import : le fichier est choisi sur l'input masqué du bouton.
  await page.setInputFiles('input[type="file"]', csvPath);
  // Confirmation FR avant l'écriture.
  const confirm = page.getByRole("dialog", { name: "Confirmer l'action" });
  await confirm.waitFor({ timeout: 15_000 });
  await confirm.getByRole("button", { name: "Confirmer" }).click();

  // 2. Résultat : toast FR + fiche présente dans la table.
  const toast = await readSuccessToast(page, /client\(s\) importé/);
  expect(toast).toMatch(/1 client/);
  await page.getByLabel("Rechercher un client", { exact: true }).fill(tag);
  const row = page.getByRole("row", { name: new RegExp(tag) });
  await row.waitFor({ timeout: 15_000 });
  expect((await row.textContent()) ?? "").toContain(phone);

  // 3. Export : le filtre courant est parcouru et le compte est rapporté.
  await page.locator('button[title="Exporter tout le filtre (CSV)"]').click();
  const exportToast = await readSuccessToast(page, /ligne\(s\) exportée/);
  expect(exportToast).toMatch(/1 ligne/);
});

test("Clients : un fichier CSV invalide est refusé SANS écrire de fiche", async () => {
  const { page } = ctx;
  const tag = uniqueTag("E2ECliKo");
  const csvPath = path.join(os.tmpdir(), `veloria-clients-ko-${tag}.csv`);
  // Prénom vide ⇒ ligne invalide ⇒ rien ne doit être écrit.
  // (La ligne 1 est l'en-tête : la ligne fautive est la 2ᵉ.)
  fs.writeFileSync(csvPath, `prénom;nom;téléphone\n;${tag};0550000000\n`, "utf-8");

  await gotoModule(page, "Clients");
  await page.setInputFiles('input[type="file"]', csvPath);
  // Message FR du parseur (aucune confirmation : le fichier est refusé).
  const err = page.locator('[role="status"], [role="alert"]', { hasText: /Ligne 2/ });
  await err.first().waitFor({ timeout: 15_000 });
  expect((await err.first().textContent()) ?? "").toMatch(/Ligne 2/);

  // Aucune fiche créée.
  await page.getByLabel("Rechercher un client", { exact: true }).fill(tag);
  await page.waitForTimeout(1500);
  expect(await page.getByRole("row", { name: new RegExp(tag) }).count()).toBe(0);
});

test("Catalogue : export CSV du catalogue filtré", async () => {
  const { page } = ctx;
  const tag = uniqueTag("E2EProd");
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(tag);
  await page.getByLabel("Prix de vente", { exact: true }).fill("100");
  await page.getByLabel("Stock", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  await page.locator('button[title="Exporter tout le filtre (CSV)"]').click();
  const exportToast = await readSuccessToast(page, /produit\(s\) exporté/);
  expect(exportToast).toMatch(/1 produit/);
});
