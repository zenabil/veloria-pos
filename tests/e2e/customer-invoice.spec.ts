// Veloria PoS — E2E : fiche client depuis la caisse + aperçu ticket 58/80
// (requêtes 1-3). Politique opération → format : une vente s'affiche et
// s'imprime en ticket uniquement, jamais en A4. Dossiers isolés.
import { test } from "@playwright/test";
import {
  closeApp,
  gotoModule,
  launchActivatedApp,
  makeIsolatedDirs,
  readSuccessToast,
  settlePayment,
  uniqueTag,
  expect,
  type AppContext,
} from "./helpers.ts";

let ctx: AppContext;

test.beforeEach(async () => {
  ctx = await launchActivatedApp(makeIsolatedDirs());
});

test.afterEach(async () => {
  await closeApp(ctx);
});

test("fiche client depuis la vente + aperçu ticket 58/80", async () => {
  const { page } = ctx;
  const product = uniqueTag("E2ECli");
  const who = `Cli${uniqueTag("X").slice(-8)} Nom${uniqueTag("Y").slice(-8)}`;

  await gotoModule(page, "Clients");
  await page.locator('button[title="Créer un client"]').click();
  await page.getByLabel("Nom complet", { exact: true }).fill(who);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await readSuccessToast(page, /créé/);

  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(product);
  await page.getByLabel("Prix de vente", { exact: true }).fill("100");
  await page.getByLabel("Stock", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  // Vente comptant au client (facture liée, soldée).
  await gotoModule(page, "Caisse");
  await page.getByLabel("Recherche produit", { exact: true }).fill(product);
  await page
    .getByRole("option", { name: new RegExp(product) })
    .first()
    .click();
  await page.getByLabel("Rechercher un client").fill(who.slice(0, 14));
  await page
    .getByRole("button", { name: new RegExp(who.slice(0, 10)) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser", exact: true }).click();
  await settlePayment(page, "100", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);
  // Fermer l'aperçu de vente (Échap) pour retrouver la caisse.
  await page.keyboard.press("Escape");

  // La vente vide le panier (comportement caisse voulu) : re-sélectionner
  // le client pour ouvrir sa fiche depuis la caisse.
  await page.getByLabel("Rechercher un client").fill(who.slice(0, 14));
  await page
    .getByRole("button", { name: new RegExp(who.slice(0, 10)) })
    .first()
    .click();

  // Requête 1 : entrée directe à la fiche depuis le nom en caisse.
  // (le nom accessible vient de l'aria-label « Ouvrir la fiche de … »,
  // pas du texte visible « · Fiche » qu'il remplace).
  await page.getByRole("button", { name: /Ouvrir la fiche de/ }).click();
  await expect(page.getByText("Dette actuelle")).toBeVisible();
  await page.getByRole("tab", { name: "Factures" }).click();
  await expect(page.getByText(invoice, { exact: false }).first()).toBeVisible();
  // Requête 2 : aperçu facture depuis la fiche — ticket 58/80 uniquement.
  // (nom accessible = aria-label « Ouvrir la facture … », pas le texte
  // visible « Facture » qu'il remplace — même piège que la fiche.)
  await page
    .getByRole("button", { name: new RegExp(`Ouvrir la facture ${invoice}`) })
    .first()
    .click();
  await expect(page.getByLabel(new RegExp(`Aperçu ticket ${invoice}`))).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer le ticket" })).toBeVisible();
  // Politique opération → format : plus d'onglet A4 pour une vente.
  await expect(page.getByRole("tab", { name: "Facture A4" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
});

test("historique : aperçu ticket 58/80", async () => {
  const { page } = ctx;
  const product = uniqueTag("E2EHist");
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(product);
  await page.getByLabel("Prix de vente", { exact: true }).fill("50");
  await page.getByLabel("Stock", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  await gotoModule(page, "Caisse");
  await page.getByLabel("Recherche produit", { exact: true }).fill(product);
  await page
    .getByRole("option", { name: new RegExp(product) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser", exact: true }).click();
  await settlePayment(page, "50", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);
  await page.keyboard.press("Escape");

  // Requête 3 : aperçu ticket depuis l'historique (jamais d'A4 pour une vente).
  await gotoModule(page, "Historique");
  await page
    .getByLabel("Rechercher dans l'historique (ticket, client, référence ou code-barres)")
    .fill(invoice);
  const histRow = page
    .getByRole("row", { name: new RegExp(invoice) })
    .filter({ hasText: "Vente" })
    .first();
  // Ouverture via le bouton « Voir … » de la colonne Actions (colonne
  // visible, pas de recouvrement) plutôt que le clic sur la ligne (thead
  // sticky + scroll horizontal min-w-[1240px] — voir ADR-077).
  // Alignement explicite : fin horizontale (colonne Actions à droite) +
  // centre vertical (sous le thead sticky grâce au scroll-padding).
  await histRow.evaluate((el) => el.scrollIntoView({ block: "center", inline: "end" }));
  await histRow.getByRole("button", { name: /Voir/ }).click();
  await page.getByRole("button", { name: /Voir le document/ }).click();
  await expect(page.getByLabel("Aperçu ticket 58/80 mm — Ticket de vente")).toBeVisible();
  // Aperçu 100% ticket : aucun onglet A4, aucun iframe.
  await expect(page.getByRole("tab", { name: "Facture A4" })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
});
