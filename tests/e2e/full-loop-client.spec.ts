// Veloria PoS — E2E boucle locale complète POS → miroir (clic réel).
// Scénario demandé : lancer → activer → créer client → activer son APK →
// créer produit → vente à crédit partiel → synchroniser → pousser vers le
// miroir (relais local E2E : scripts/e2e-mirror-relay.mjs sur :8100).
// Base vierge isolée. Captures : test-results/e2e-loop/01..08.
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

const RELAY = "http://127.0.0.1:8100";
// JWT factice (rôle anon) : seule la FORME est validée côté app
// (QR V2 embarque URL + anon — ADR-068) ; le relais l'ignore.
const E2E_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImV4cCI6OTk5OTk5OTk5OX0.e2e-fake-signature-0123456789abcdef";
const SHOT = "test-results/e2e-loop";

test.setTimeout(300_000);

let ctx: AppContext;

test.beforeEach(async () => {
  const reachable = await fetch(`${RELAY}/`, { signal: AbortSignal.timeout(10000) })
    .then((r) => r.ok)
    .catch(() => false);
  if (!reachable) {
    throw new Error(
      `Relais miroir E2E injoignable sur ${RELAY} : lancez 'node scripts/e2e-mirror-relay.mjs' avant ce test.`,
    );
  }
  ctx = await launchActivatedApp(makeIsolatedDirs());
});

test.afterEach(async () => {
  await closeApp(ctx);
});

test("boucle locale : client + vente à crédit + miroir poussé", async () => {
  const { page } = ctx;
  const who = `Boucle${uniqueTag("C").slice(-6)} Test${uniqueTag("T").slice(-6)}`;
  const phone = `0555${String(Math.floor(100000 + Math.random() * 900000))}`;
  const pin = "482916";
  console.log(`E2E-LOOP creds: phone=${phone} pin=${pin}`);
  const product = uniqueTag("BoucleProduit");

  // 1. Coquille activée.
  await expect(page.getByRole("heading", { name: "Caisse" })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/01-coquille.png` });

  // 1b. Configurer tôt URL + clé anon : le QR V2 d'activation les embarque,
  // sans miroir configuré le QR est impossible par conception (ADR-068).
  await gotoModule(page, "Paramètres");
  await page.getByRole("button", { name: /Données/ }).click();
  await expect(page.getByRole("heading", { name: "Miroir Android" })).toBeVisible();
  const preMirror = page.locator('[data-settings-card="sync"]');
  await preMirror.getByLabel("Adresse du serveur (URL)", { exact: true }).fill(RELAY);
  await preMirror.getByLabel("Clé anon Supabase", { exact: true }).fill(E2E_ANON_KEY);
  await preMirror.getByRole("button", { name: "Enregistrer" }).click();

  // 2. Créer le client (avec téléphone + crédit autorisé).
  await gotoModule(page, "Clients");
  await page.locator('button[title="Créer un client"]').click();
  await page.getByLabel("Nom complet", { exact: true }).fill(who);
  await page.getByLabel("Téléphone", { exact: true }).fill(phone);
  const creditSwitch = page.getByRole("switch", { name: "Crédit autorisé" });
  if ((await creditSwitch.getAttribute("aria-checked")) !== "true") {
    await creditSwitch.click();
  }
  await page.getByRole("button", { name: "Créer le client" }).click();
  await readSuccessToast(page, /créé/);
  await expect(page.getByRole("row", { name: new RegExp(phone) })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/02-client.png` });

  // 3. Fiche → Application mobile → activation QR/PIN.
  // (Bouton Détails : le clic ligne est intercepté par le thead sticky.)
  async function openDrawer(): Promise<void> {
    const row = page.getByRole("row", { name: new RegExp(who.slice(0, 12)) }).first();
    await row.scrollIntoViewIfNeeded();
    await row.locator('button[title="Détails de la fiche"]').click();
    await expect(page.getByText("Application mobile")).toBeVisible();
  }
  await openDrawer();
  await page.getByLabel("PIN à 6 chiffres", { exact: true }).fill(pin);
  await page.getByRole("button", { name: "Activer l'application" }).click();
  await expect(page.getByText("Carte d'activation — à recopier une seule fois")).toBeVisible();
  await expect(page.getByAltText("QR d'activation à scanner")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Activée", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/03-activation.png` });
  await page.getByRole("dialog").getByRole("button", { name: "Fermer le détail" }).click();
  await expect(page.getByText("Application mobile")).toBeHidden();

  // 4. Créer le produit.
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(product);
  await page.getByLabel("Prix de vente", { exact: true }).fill("250");
  await page.getByLabel("Stock", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);
  await page.screenshot({ path: `${SHOT}/04-produit.png` });

  // 5. Vente à crédit partiel au client (2 × 250 = 500, payé 200, reste 300).
  await gotoModule(page, "Caisse");
  await page.getByLabel("Recherche produit", { exact: true }).fill(product);
  await page
    .getByRole("option", { name: new RegExp(product) })
    .first()
    .click();
  await page.getByRole("button", { name: `Augmenter ${product}` }).click();
  await page.getByLabel("Rechercher un client").fill(who.slice(0, 14));
  await page
    .getByRole("button", { name: new RegExp(who.slice(0, 10)) })
    .first()
    .click();
  await page.getByRole("button", { name: "Encaisser", exact: true }).click();
  await settlePayment(page, "200", true);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);
  await page.screenshot({ path: `${SHOT}/05-vente.png` });
  await page.keyboard.press("Escape");

  // 6. Fiche client → Synchroniser (3 clichés + détails).
  await gotoModule(page, "Clients");
  await openDrawer();
  await page.getByRole("button", { name: "Synchroniser" }).click();
  await readSuccessToast(page, /mis en file/);
  await page.screenshot({ path: `${SHOT}/06-sync.png` });
  await page.getByRole("dialog").getByRole("button", { name: "Fermer le détail" }).click();
  await expect(page.getByText("Application mobile")).toBeHidden();

  // 7. Paramètres → rubrique Données → Miroir APK → configurer + pousser.
  // (Section = Card : remonte de 2 niveaux depuis le titre h3.)
  await gotoModule(page, "Paramètres");
  await page.getByRole("button", { name: /Données/ }).click();
  await expect(page.getByRole("heading", { name: "Miroir Android" })).toBeVisible();
  const mirror = page.locator('[data-settings-card="sync"]');
  await mirror.getByLabel("Adresse du serveur (URL)", { exact: true }).fill(RELAY);
  await mirror
    .getByLabel("Clé service Supabase", { exact: true })
    .fill("e2e-service-key-0123456789");
  await mirror.getByLabel("Cadence de poussée", { exact: true }).fill("15");
  const syncSwitch = mirror.getByRole("switch", { name: "Synchronisation miroir" });
  if ((await syncSwitch.getAttribute("aria-checked")) !== "true") {
    await syncSwitch.click();
  }
  await mirror.getByRole("button", { name: "Enregistrer" }).click();
  await page.screenshot({ path: `${SHOT}/07-miroir-config.png` });
  await mirror.getByRole("button", { name: "Pousser maintenant" }).click();
  const anyToast = page.locator('[role="status"], [role="alert"]');
  await anyToast.first().waitFor({ timeout: 25000 });
  console.log(`E2E-LOOP toasts: ${JSON.stringify(await anyToast.allTextContents())}`);
  const pushed = await readSuccessToast(page, /Miroir poussé/);
  expect(pushed).toMatch(/Miroir poussé : \d+ cliché/);
  await page.screenshot({ path: `${SHOT}/08-push.png` });

  // 8. Le relais a reçu la file : accès + clichés (dont la facture créée).
  const state = (await fetch(`${RELAY}/`).then((r) => r.json())) as {
    access: number;
    payloads: number;
  };
  expect(state.access).toBeGreaterThanOrEqual(1);
  expect(state.payloads).toBeGreaterThanOrEqual(4);
  // La facture créée est servie par le contrat client-sync (login réel).
  const login = (await fetch(`${RELAY}/functions/v1/client-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin }),
  }).then((r) => r.json())) as {
    ok: boolean;
    data: { invoices: { sales: { id: number; invoice_number: string }[] } };
  };
  expect(login.ok).toBe(true);
  const found = login.data.invoices.sales.find((s) => s.invoice_number === invoice);
  expect(found, `facture ${invoice} visible côté APK`).toBeDefined();
});
