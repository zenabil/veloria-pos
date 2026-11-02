// Veloria PoS — E2E : porte session 0041 (choix d'utilisateur à chaque
// ouverture, code initial aléatoire affiché une fois au premier boot R6,
// changement forcé vers 6 chiffres, code de secours affiché une fois,
// récupération par secours).
// Base vierge par test (helpers) : répétable, indépendant de l'ordre.
import { test } from "@playwright/test";
import {
  closeApp,
  launchActivatedApp,
  readFirstBootCode,
  E2E_STAFF_CODE,
  expect,
  type AppContext,
} from "./helpers.ts";

let ctx: AppContext;

test.beforeEach(async () => {
  // Sans connexion auto : c'est ce spec qui franchit la porte à la main.
  ctx = await launchActivatedApp(undefined, undefined, { autoStaffLogin: false });
});

test.afterEach(async () => {
  await closeApp(ctx);
});

test("porte session : code faux refusé, code initial impose le changement", async () => {
  const { page } = ctx;
  await expect(page.getByRole("heading", { name: "Choisir l'utilisateur" })).toBeVisible();

  // Code faux : erreur FR générique, porte toujours affichée.
  await page.getByLabel("Code à 6 chiffres").fill("000000");
  await page.getByRole("button", { name: "Ouvrir la session" }).click();
  await expect(page.getByText("Identifiants invalides.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choisir l'utilisateur" })).toBeVisible();

  // Bootstrap R6 : code initial affiché une fois sur la porte, puis
  // changement forcé vers 6 chiffres (l'ancien = le code initial).
  const first = await readFirstBootCode(page);
  expect(first).toMatch(/^[0-9]{6}$/);
  await page.getByLabel("Code à 6 chiffres").fill(first ?? "");
  await page.getByRole("button", { name: "Ouvrir la session" }).click();
  // R6 : le code initial s'affiche encore UNE fois en plein écran — acquitté.
  await expect(page.getByRole("heading", { name: "Code initial" })).toBeVisible();
  await page.getByRole("button", { name: "Je l'ai noté" }).click();
  await expect(page.getByRole("heading", { name: "Changement de code exigé" })).toBeVisible();
  await page.getByLabel("Code initial reçu").fill(first ?? "");
  await page.getByLabel("Nouveau code (6 chiffres)").fill(E2E_STAFF_CODE);
  await page.getByLabel("Confirmer le nouveau code").fill(E2E_STAFF_CODE);
  await page.getByRole("button", { name: "Enregistrer le code" }).click();

  // Secours affiché une fois : on l'acquitte, puis la coquille apparaît.
  await expect(page.getByRole("heading", { name: "Code de secours" })).toBeVisible();
  await page.getByRole("button", { name: "Je l'ai noté" }).click();
  // La coquille est ouverte : le bandeau rend l'opérateur connecté (contrôle
  // « Changer d'utilisateur »). L'ancienne attente ciblait le texte
  // « Session : », retiré de la coquille par la refonte visuelle (commit
  // `9b7c564`, 2026-10-27) — le spec n'avait pas suivi depuis.
  await expect(page.getByRole("button", { name: /^Changer d/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
});

test("verrouillage : changer d'utilisateur rouvre la porte", async () => {
  const { page } = ctx;
  const first = await readFirstBootCode(page);
  await page.getByLabel("Code à 6 chiffres").fill(first ?? "");
  await page.getByRole("button", { name: "Ouvrir la session" }).click();
  // R6 : écran unique du code initial, acquitté avant le changement forcé.
  await expect(page.getByRole("heading", { name: "Code initial" })).toBeVisible();
  await page.getByRole("button", { name: "Je l'ai noté" }).click();
  await page.getByLabel("Code initial reçu").fill(first ?? "");
  await page.getByLabel("Nouveau code (6 chiffres)").fill(E2E_STAFF_CODE);
  await page.getByLabel("Confirmer le nouveau code").fill(E2E_STAFF_CODE);
  await page.getByRole("button", { name: "Enregistrer le code" }).click();
  await page.getByRole("button", { name: "Je l'ai noté" }).click();
  // La coquille est ouverte : le bandeau rend l'opérateur connecté (contrôle
  // « Changer d'utilisateur »). L'ancienne attente ciblait le texte
  // « Session : », retiré de la coquille par la refonte visuelle (commit
  // `9b7c564`, 2026-10-27) — le spec n'avait pas suivi depuis.
  await expect(page.getByRole("button", { name: /^Changer d/ })).toBeVisible();

  await page.getByRole("button", { name: "Changer d'utilisateur" }).click();
  await expect(page.getByRole("heading", { name: "Choisir l'utilisateur" })).toBeVisible();

  await page.getByLabel("Code à 6 chiffres").fill(E2E_STAFF_CODE);
  await page.getByRole("button", { name: "Ouvrir la session" }).click();
  // La coquille est ouverte : le bandeau rend l'opérateur connecté (contrôle
  // « Changer d'utilisateur »). L'ancienne attente ciblait le texte
  // « Session : », retiré de la coquille par la refonte visuelle (commit
  // `9b7c564`, 2026-10-27) — le spec n'avait pas suivi depuis.
  await expect(page.getByRole("button", { name: /^Changer d/ })).toBeVisible();
});

test("secours : code noté une fois puis récupération d'accès", async () => {
  const { page } = ctx;
  const first = await readFirstBootCode(page);
  await page.getByLabel("Code à 6 chiffres").fill(first ?? "");
  await page.getByRole("button", { name: "Ouvrir la session" }).click();
  // R6 : écran unique du code initial, acquitté avant le changement forcé.
  await expect(page.getByRole("heading", { name: "Code initial" })).toBeVisible();
  await page.getByRole("button", { name: "Je l'ai noté" }).click();
  await page.getByLabel("Code initial reçu").fill(first ?? "");
  await page.getByLabel("Nouveau code (6 chiffres)").fill(E2E_STAFF_CODE);
  await page.getByLabel("Confirmer le nouveau code").fill(E2E_STAFF_CODE);
  await page.getByRole("button", { name: "Enregistrer le code" }).click();

  // Le secours affiché une fois est capturé tel que l'opérateur le noterait.
  const onceCode = ((await page.getByRole("status").textContent()) ?? "").replace(/\D/g, "");
  expect(onceCode).toMatch(/^[0-9]{8}$/);
  await page.getByRole("button", { name: "Je l'ai noté" }).click();
  // La coquille est ouverte : le bandeau rend l'opérateur connecté (contrôle
  // « Changer d'utilisateur »). L'ancienne attente ciblait le texte
  // « Session : », retiré de la coquille par la refonte visuelle (commit
  // `9b7c564`, 2026-10-27) — le spec n'avait pas suivi depuis.
  await expect(page.getByRole("button", { name: /^Changer d/ })).toBeVisible();

  // Oubli simulé : porte → Code oublié → secours + nouveau code.
  await page.getByRole("button", { name: "Changer d'utilisateur" }).click();
  await page.getByRole("button", { name: "Code oublié ?" }).click();
  await page.getByLabel("Code de secours (8 chiffres)").fill(onceCode);
  await page.getByLabel("Nouveau code (6 chiffres)").fill("654321");
  await page.getByLabel("Confirmer le nouveau code").fill("654321");
  await page.getByRole("button", { name: "Rétablir l'accès" }).click();

  // Le nouveau code ouvre la session.
  await expect(page.getByRole("heading", { name: "Choisir l'utilisateur" })).toBeVisible();
  await page.getByLabel("Code à 6 chiffres").fill("654321");
  await page.getByRole("button", { name: "Ouvrir la session" }).click();
  // La coquille est ouverte : le bandeau rend l'opérateur connecté (contrôle
  // « Changer d'utilisateur »). L'ancienne attente ciblait le texte
  // « Session : », retiré de la coquille par la refonte visuelle (commit
  // `9b7c564`, 2026-10-27) — le spec n'avait pas suivi depuis.
  await expect(page.getByRole("button", { name: /^Changer d/ })).toBeVisible();
});
