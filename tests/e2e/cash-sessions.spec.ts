// Veloria PoS — E2E : sessions de caisse (migration 0059, ADR-170).
// Surface livrée en session 96 et **jamais vue dans l'application réelle** (le
// handoff le disait). Ce spec prouve sur Electron vivant le cycle complet —
// ouverture, comptage physique, fermeture confirmée, écart signé — et les deux
// gardes que le main seul peut refuser (un poste = une session ouverte) ou que
// l'UI doit arrêter avant l'appel (comptage vide).
import { test } from "@playwright/test";
import {
  closeApp,
  expect,
  gotoModule,
  launchActivatedApp,
  readSuccessToast,
  type AppContext,
} from "./helpers";

test.describe("sessions de caisse (écran Rapports)", () => {
  let ctx: AppContext;

  test.beforeEach(async () => {
    ctx = await launchActivatedApp();
    await gotoModule(ctx.page, "Rapports");
    // Première preuve réelle : la carte `CashSessionsSection` est rendue sur une
    // base migrée 0059, avec les gates licence `reports` + staff `closings`.
    await expect(ctx.page.getByRole("heading", { name: "Sessions de caisse" })).toBeVisible();
    await expect(ctx.page.getByRole("button", { name: "Ouvrir la session" })).toBeVisible();
  });

  test.afterEach(async () => {
    await closeApp(ctx);
  });

  test("cycle complet : ouverture → comptage → fermeture, écart 20,00 DZD affiché", async () => {
    const { page } = ctx;
    await page.getByLabel("Fond d'ouverture de caisse").fill("500,00");
    await page.getByRole("button", { name: "Ouvrir la session" }).click();
    await readSuccessToast(page, /ouverte\./);

    // Le bandeau nomme la session active et son attente (= fond, aucune vente).
    await expect(page.getByText(/Session en cours :.*attente 500,00 DZD/)).toBeVisible();
    await expect(page.getByText("Ouverte", { exact: true })).toBeVisible();

    await page.getByLabel("Montant compté dans le tiroir").fill("520,00");
    await page.getByRole("button", { name: "Enregistrer le comptage" }).click();
    await readSuccessToast(page, /Comptage enregistré/);

    await page.getByRole("button", { name: "Fermer la session" }).click();
    // `Modal` porte aria-labelledby (le `title` visuel) : c'est lui qui gagne
    // sur aria-label dans le nom accessible calculé par Chromium.
    const dialog = page.getByRole("dialog", { name: "Confirmer l'action" });
    await expect(dialog.getByRole("heading", { name: "Confirmer l'action" })).toBeVisible();
    await expect(dialog.getByText(/attente sera figée/)).toBeVisible();
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await readSuccessToast(page, /Session de caisse fermée/);

    // Écart jamais stocké : compté 520,00 − attendu 500,00 = 20,00. Le contrat
    // de `formatDzdSigned` ne préfixe PAS le positif (seul le négatif porte « - »)
    // — c'est donc la ligne du registre entière qui est vérifiée, ordre des
    // colonnes compris : Fond 500,00 · Attente 500,00 · Comptage 520,00 · Écart 20,00.
    await expect(page.getByText("Fermée", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("row", {
        name: /Caisse 1 — journée.*500,00 DZD 500,00 DZD 520,00 DZD 20,00 DZD Fermée/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Écart net des sessions fermées de la période : 20,00 DZD/),
    ).toBeVisible();
    // Plus aucune session ouverte : comptage et fermeture sont neutralisés.
    await expect(page.getByRole("button", { name: "Enregistrer le comptage" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Fermer la session" })).toBeDisabled();
  });

  test("un poste ne peut ouvrir deux sessions : refus FR du main", async () => {
    const { page } = ctx;
    await page.getByLabel("Fond d'ouverture de caisse").fill("100,00");
    await page.getByRole("button", { name: "Ouvrir la session" }).click();
    await readSuccessToast(page, /ouverte\./);

    await page.getByLabel("Fond d'ouverture de caisse").fill("200,00");
    await page.getByRole("button", { name: "Ouvrir la session" }).click();
    await expect(page.getByRole("alert").first()).toContainText(
      "Une session est déjà ouverte pour le poste",
    );
    // Le refus n'a pas écrasé la session en cours : fond toujours 100,00.
    await expect(page.getByText(/Session en cours :.*attente 100,00 DZD/)).toBeVisible();
  });

  test("comptage vide : l'UI refuse avant d'appeler le main", async () => {
    const { page } = ctx;
    await page.getByLabel("Fond d'ouverture de caisse").fill("300,00");
    await page.getByRole("button", { name: "Ouvrir la session" }).click();
    await readSuccessToast(page, /ouverte\./);

    await page.getByLabel("Montant compté dans le tiroir").fill("");
    await page.getByRole("button", { name: "Fermer la session" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Saisissez le montant compté dans le tiroir.",
    );
    // Rien n'a été fermé : la session reste ouverte et fermable.
    await expect(page.getByText("Ouverte", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Confirmer l'action" })).toHaveCount(0);
  });
});
