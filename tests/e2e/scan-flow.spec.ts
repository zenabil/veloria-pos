// Veloria PoS — E2E : scan douchette en caisse (clavier USB).
// Base vierge par test (helpers) : répétable, indépendant de l'ordre.
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

async function createProductWithBarcode(
  name: string,
  barcode: string,
  unit?: string,
): Promise<void> {
  const { page } = ctx;
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  // ADR-114 : unité continue (KG/G/L/ML/CL/M) → dialogue « quantité vendue ».
  if (unit !== undefined) {
    await page.getByLabel("Unité").selectOption(unit);
  }
  await page.getByLabel("Prix de vente", { exact: true }).fill("100");
  await page.getByLabel("Stock", { exact: true }).fill("50");
  await page.getByLabel("Ajouter un code-barres").fill(barcode);
  await page.getByLabel("Ajouter un code-barres").press("Enter");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
}

test("scan connu : ajout direct unique, même sans focus (rafale + Entrée)", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EScan");
  // EAN-13 à clé valide (la fiche rejette les clés invalides, cf. barcode-rules).
  const barcode = "6190000000019";
  await createProductWithBarcode(name, barcode);
  await gotoModule(page, "Caisse");
  // Focus perdu (clic hors champ) puis rafale douchette + Entrée suffixe,
  // envoyées au clavier système comme un wedge HID (sans focus préalable).
  await page.getByText("Scanner prêt").click();
  await page.keyboard.type(barcode, { delay: 15 });
  await page.keyboard.press("Enter");
  const field = page.getByLabel("Recherche produit", { exact: true });
  // Hit exact → une seule ligne (quantité 1), champ vidé pour le scan suivant.
  await expect(page.getByLabel(`Quantité ${name}`, { exact: true })).toHaveValue("1", {
    timeout: 15_000,
  });
  await expect(page.getByLabel(/Quantité /)).toHaveCount(1);
  await expect(field).toHaveValue("");
});

test("scan inconnu : message FR, aucun ajout", async () => {
  const { page } = ctx;
  await gotoModule(page, "Caisse");
  // EAN-13 valide mais absent du catalogue → échec de recherche, pas de validation.
  await page.getByLabel("Recherche produit", { exact: true }).fill("6190000000026");
  const toast = page.locator('[role="alert"]', { hasText: /Code-barres inconnu/ });
  await toast.first().waitFor({ timeout: 15_000 });
  // Panier toujours vide : aucun ajout silencieux.
  await expect(page.getByLabel(/Quantité /)).toHaveCount(0);
});

test("scan produit au poids (ADR-114) : dialogue quantité, 1,5 kg, puis annulation Échap", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EPoids");
  // EAN-13 à clé valide, produit vendu au KG.
  const barcode = "6190000000033";
  await createProductWithBarcode(name, barcode, "KG");
  await gotoModule(page, "Caisse");

  // Scan d'une unité continue : le dialogue s'ouvre — jamais « 1 kg » deviné.
  const search = page.getByLabel("Recherche produit", { exact: true });
  const line = page.getByLabel(`Quantité ${name}`, { exact: true });
  await search.fill(barcode);
  const dialog = page.getByRole("dialog", { name: "Quantité vendue" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(line).toHaveCount(0);

  // Saisie du poids (virgule FR) + Entrée : la ligne sort à 1,5 kg.
  const field = page.getByLabel("Poids vendu", { exact: true });
  await field.fill("1,5");
  await field.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(line).toHaveValue("1.5");

  // Second scan puis Échap : aucun nouvel ajout, la ligne 1,5 reste seule.
  await search.fill(barcode);
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(line).toHaveCount(1);
});

test("scan sans Entrée : ajout direct par le debounce (rafale douchette)", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2ESansEntree");
  // EAN-13 à clé valide, unité PIECE.
  const barcode = "6190000000040";
  await createProductWithBarcode(name, barcode);
  await gotoModule(page, "Caisse");
  const search = page.getByLabel("Recherche produit", { exact: true });
  await search.click();
  // Rafale clavier SANS Entrée : l'idle court douchette ajoute tout seul.
  await page.keyboard.type(barcode, { delay: 15 });
  await expect(page.getByLabel(`Quantité ${name}`, { exact: true })).toHaveValue("1", {
    timeout: 15_000,
  });
  // Une seule ligne, champ vidé pour la douchette suivante.
  await expect(page.getByLabel(/Quantité /)).toHaveCount(1);
  await expect(search).toHaveValue("");
});

test("scan sans Entrée, focus perdu : la frappe revient au champ et s'ajoute", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2ESansEntreeFocus");
  const barcode = "6190000000057";
  await createProductWithBarcode(name, barcode);
  await gotoModule(page, "Caisse");
  // Focus perdu (clic hors champ) puis rafale SANS Entrée.
  await page.getByText("Scanner prêt").click();
  await page.keyboard.type(barcode, { delay: 15 });
  await expect(page.getByLabel(`Quantité ${name}`, { exact: true })).toHaveValue("1", {
    timeout: 15_000,
  });
});

test("scan sans Entrée : deux scans rapprochés (180 ms) → deux lignes", async () => {
  const { page } = ctx;
  const nameA = uniqueTag("E2ERafaleA");
  const nameB = uniqueTag("E2ERafaleB");
  const barcodeA = "6190000000064";
  const barcodeB = "6190000000071";
  await createProductWithBarcode(nameA, barcodeA);
  await createProductWithBarcode(nameB, barcodeB);
  await gotoModule(page, "Caisse");
  const search = page.getByLabel("Recherche produit", { exact: true });
  await search.click();
  // Cadence opérateur : le premier scan doit être ajouté avant que le second
  // ne commence (idle court), sinon les deux codes se concatèneraient.
  await page.keyboard.type(barcodeA, { delay: 15 });
  await page.waitForTimeout(180);
  await page.keyboard.type(barcodeB, { delay: 15 });
  await expect(page.getByLabel(`Quantité ${nameA}`, { exact: true })).toHaveValue("1", {
    timeout: 15_000,
  });
  await expect(page.getByLabel(`Quantité ${nameB}`, { exact: true })).toHaveValue("1");
  await expect(page.getByLabel(/Quantité /)).toHaveCount(2);
});
