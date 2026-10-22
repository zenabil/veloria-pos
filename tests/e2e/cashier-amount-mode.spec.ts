// Veloria PoS — E2E caisse : article libre (focus) + vente au poids en mode
// « Montant » (montant exact, ligne verrouillée, ticket imprimable).
//
// Régression des bugs signalés par le propriétaire le 2026-10-21 et des
// corrections de la revue UI du 2026-10-22 (ADR-131/132) :
//  1) « Article libre » : le prix n'acceptait qu'UN chiffre puis le focus
//     revenait au champ Nom (le nom prenait les chiffres suivants).
//  2) Mode « Montant (DZD) » : 50,00 DZD saisis à 700 DZD/kg étaient
//     facturés 49,70 DZD ; la ligne est désormais facturée 50,00 DZD, sa
//     quantité/prix sont verrouillés (sinon l'écran de caisse mourait) et le
//     ticket sort avec la mention « montant saisi » + la majoration d'écart.
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

/** Produit vendu au KG (unité continue → dialogue « quantité vendue »). */
async function createWeightProduct(name: string, priceDzd: string, stock: string): Promise<void> {
  const { page } = ctx;
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(name);
  await page.getByLabel("Unité").selectOption("KG");
  await page.getByLabel("Prix de vente", { exact: true }).fill(priceDzd);
  await page.getByLabel("Stock", { exact: true }).fill(stock);
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
}

test("article libre : le focus reste dans le prix (plus de retour au nom)", async () => {
  const { page } = ctx;
  await gotoModule(page, "Caisse");
  await page
    .getByRole("button", { name: /Article libre/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Article libre" });
  await expect(dialog).toBeVisible();

  const name = page.getByLabel("Nom du produit libre", { exact: true });
  const price = page.getByLabel("Prix unitaire", { exact: true });
  await name.fill("Sachet plastique");
  // Entrée dans le nom = passer au prix (raccourci caissier).
  await name.press("Enter");
  await expect(price).toBeFocused();

  // AVANT : un seul chiffre passait, puis le focus revenait au NOM et les
  // chiffres suivants s'écrivaient dans le nom. Le prix doit garder les 3.
  await price.pressSequentially("500", { delay: 40 });
  await expect(price).toHaveValue("500");
  await expect(price).toBeFocused();
  await expect(name).toHaveValue("Sachet plastique");
});

test("vente au poids en mode Montant : 50,00 DZD facturés, ligne verrouillée, ticket OK", async () => {
  const { page } = ctx;
  const name = uniqueTag("E2EMontant");
  await createWeightProduct(name, "700", "50");
  await gotoModule(page, "Caisse");

  // Recherche du produit au poids → dialogue « quantité vendue ».
  await page.getByLabel("Recherche produit", { exact: true }).fill(name);
  await page
    .getByRole("option", { name: new RegExp(name) })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Quantité vendue" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // Mode « Montant (DZD) » : le montant saisi est facturé tel quel.
  await dialog.getByRole("button", { name: "Montant (DZD)" }).click();
  const amount = page.getByLabel("Montant à facturer", { exact: true });
  await amount.fill("50");
  await expect(dialog.getByText("Total à facturer")).toBeVisible();
  await expect(dialog.getByText("50,00 DZD")).toBeVisible();
  // L'écart d'arrondi du poids est explicité (0,071 kg × 700,00 = 49,70).
  await expect(dialog.getByText(/Écart d'arrondi/)).toBeVisible();
  await dialog.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(dialog).toBeHidden();

  // Ligne du panier : total facturé = 50,00 DZD (pas 49,70).
  const qty = page.getByLabel(`Quantité verrouillée — ${name}`, { exact: true });
  await expect(page.getByText("Montant saisi", { exact: true })).toBeVisible();
  // Le verrou est EXPLIQUÉ à l'écran (une caisse tactile n'a pas d'infobulle).
  await expect(page.getByText(/quantité et prix verrouillés/)).toBeVisible();
  await expect(qty).toHaveValue("0.071");
  // Quantité et prix VERROUILLÉS (sinon la ligne devenait incohérente et
  // l'écran de caisse mourait au premier « + »).
  await expect(qty).toBeDisabled();
  await expect(page.getByRole("button", { name: `Augmenter ${name}` })).toBeDisabled();
  await expect(page.getByRole("button", { name: `Prix verrouillé — ${name}` })).toBeDisabled();
  // L'écran de caisse est toujours vivant.
  await expect(page.getByRole("heading", { name: "Caisse" })).toBeVisible();

  // Vente comptant : 50,00 DZD encaissés.
  await page.getByRole("button", { name: "Encaisser", exact: true }).click();
  await settlePayment(page, "50", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);
  // L'APERÇU DU TICKET est disponible (remise signée acceptée par le schéma
  // d'impression) et porte la mention « montant saisi » + la majoration.
  await expect(page.locator("pre", { hasText: "montant saisi" })).toBeVisible();
  await expect(page.locator("pre", { hasText: "Majoration" })).toBeVisible();
  await expect(page.getByText("Aperçu indisponible.")).toHaveCount(0);
});
