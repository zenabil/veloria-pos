// Captures APK (Stitch) via Chromium headless — usage manuel/E2E visuel.
// Pré-requis :
//   1. `npx expo start --web --port 8083` avec EXPO_PUBLIC_SYNC_URL pointant
//      le relais CORS-compatible `scripts/demo-client-sync-server.mjs` (port
//      8099) ou `scripts/e2e-mirror-relay.mjs` (port 8100) ;
//   2. variables obligatoires PHONE et PIN — aucun code n'est stocké ici :
//        PHONE=0555xxxxxx PIN=xxxxxx node scripts/e2e-mobile-shots.mjs
// Sortie : test-results/e2e-loop/m-home.png, m-invoices.png, m-detail.png,
//          m-boutique.png, m-cart.png, m-orders.png
import fs from "node:fs";
import { chromium } from "@playwright/test";

const PHONE = process.env.PHONE ?? "";
const PIN = process.env.PIN ?? "";
const URL = "http://127.0.0.1:8083";
const OUT = "test-results/e2e-loop";
const SHOTS = [
  `${OUT}/m-home.png`,
  `${OUT}/m-invoices.png`,
  `${OUT}/m-detail.png`,
  `${OUT}/m-boutique.png`,
  `${OUT}/m-cart.png`,
  `${OUT}/m-orders.png`,
];
// Un profil neuf démarre en arabe (langue par défaut, ADR-051) : toute ancre
// arabe manquante doit échouer en le disant explicitement.
const LANG_HINT = "Langue attendue : arabe (défaut d'un profil neuf, ADR-051).";

const missing = ["PHONE", "PIN"].filter((name) => (process.env[name] ?? "") === "");
if (missing.length > 0) {
  console.error(`Variables d'environnement manquantes : ${missing.join(", ")}`);
  console.error("Usage : PHONE=0555xxxxxx PIN=xxxxxx node scripts/e2e-mobile-shots.mjs");
  process.exit(1);
}

/** Attend une ancre ; sinon échec EXPLICITE (jamais de faux « shots-ok »). */
async function expectAnchor(locator, what, timeout, hint) {
  try {
    await locator.first().waitFor({ timeout });
  } catch {
    throw new Error(`Ancre « ${what} » introuvable après ${timeout} ms. ${hint}`);
  }
}

/** Clique un onglet par son libellé (ar ou fr : le profil peut être bilingue). */
async function clickTab(page, label) {
  const tabBar = page.getByTestId("tab-bar");
  await expectAnchor(
    tabBar,
    "barre d'onglets (data-testid=tab-bar)",
    15000,
    "La barre d'onglets n'est pas rendue.",
  );
  const button = tabBar.getByRole("button", { name: label });
  await button.first().click();
  await page.waitForTimeout(700);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const loc = msg.location();
      consoleErrors.push(`${msg.text()} (${loc?.url ?? ""}:${loc?.lineNumber ?? "?"})`);
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  // Le login rend des `aria-label` issus du glossaire (i18n.ts), pas des
  // ancres techniques : `phone`/`pin` ne correspondaient plus à rien et la
  // capture échouait systématiquement. Insensible à la langue (ar défaut).
  await page.getByLabel(/هاتف|t[eé]l[eé]phone/i).fill(PHONE);
  await page.getByLabel(/رمز العميل|Code client/i).fill(PIN);
  // Le libellé « دخول » est contenu dans « كيفية الدخول لأول مرة؟ » : on
  // ancre le bouton de connexion (mode strict de Playwright). L'application
  // V5 ENVOIE DÈS LE 6ᵉ CHIFFRE : le bouton peut déjà avoir disparu (la
  // connexion est partie) — le clic est donc tolérant, l'ancre d'accueil
  // fait foi.
  const loginButton = page.getByRole("button", { name: /^(دخول|Entrer)$/ });
  if (await loginButton.count()) {
    await loginButton
      .first()
      .click({ timeout: 5000 })
      .catch(() => undefined);
  }
  await expectAnchor(
    page.getByText("الدين المتبقي"),
    "accueil « الدين المتبقي »",
    30000,
    LANG_HINT,
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS[0] });

  // Onglet uniquement : le raccourci Accueil porte le même libellé « فواتيري »
  // (ordre DOM non garanti) → on se restreint à la barre d'onglets (tab-bar).
  // ADR-182 tranche D : les onglets « Factures » et « Paiements » sont
  // regroupés dans « النشاط » (Activity), qui s'ouvre sur les factures.
  await clickTab(page, /نشاطي|Activité/);
  await expectAnchor(
    page.getByText(/FAC-\d{4}-/),
    "numéro de facture /FAC-\\d{4}-/",
    15000,
    "Aucune facture dans le miroir (le motif est indépendant de l'année).",
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOTS[1] });

  // Détail V5 : la ligne de facture entière ouvre la page détail.
  const cards = page.getByRole("button", { name: /FAC-\d{4}-/ });
  try {
    await cards.first().waitFor({ timeout: 15000 });
  } catch {
    throw new Error(
      "Aucune ligne facture : capture du détail impossible — échec explicite plutôt qu'un faux shots-ok.",
    );
  }
  await cards.first().click();
  await expectAnchor(
    page.getByText("تفاصيل الفاتورة"),
    "page détail « تفاصيل الفاتورة »",
    15000,
    LANG_HINT,
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOTS[2] });

  // --- ADR-182 : la BOUTIQUE (catalogue) ---------------------------------
  // Retour au sommaire : l'application est une SPA (pas d'historique) — on
  // ferme la superposition « détail » par son bouton de retour.
  const back = page.getByRole("button", { name: /رجوع|Retour/ });
  if (await back.count()) {
    await back.first().click();
  } else {
    await page.goBack({ waitUntil: "networkidle" }).catch(() => undefined);
  }
  await page.waitForTimeout(900);
  await clickTab(page, /المتجر|Boutique/);
  await expectAnchor(
    page.getByText(/^المتجر$|^Boutique$/),
    "titre de la boutique",
    15000,
    "Le catalogue n'est pas servi par le miroir de démonstration.",
  );
  // On ajoute trois produits au panier (le « + » de chaque carte). Le
  // sélecteur EXCLUT les boutons désactivés (un produit indisponible n'est
  // pas ajoutable) — Playwright refuse de cliquer un bouton désactivé.
  const addButtons = page.locator(
    'button[aria-label*="أضف إلى السلة"]:not([disabled]), button[aria-label*="Ajouter au panier"]:not([disabled])',
  );
  const count = await addButtons.count();
  if (count < 2) {
    throw new Error(
      `Catalogue quasi vide (${count} produit(s) ajoutables) : capture de la boutique impossible.`,
    );
  }
  for (let i = 0; i < 3 && i < count; i += 1) {
    await addButtons.nth(i).click();
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS[3] });

  // --- ADR-182 : le PANIER ------------------------------------------------
  await clickTab(page, /السلة|Panier/);
  await expectAnchor(
    page.getByText(/الإجمالي التقديري|Total estimé/),
    "total estimé du panier",
    15000,
    "Le panier ne montre pas son total : la commande ne peut pas partir.",
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS[4] });

  // --- ADR-182 tranche D : les COMMANDES (segment de l'onglet Activité) ---
  await clickTab(page, /نشاطي|Activité/);
  const ordersChip = page.getByRole("button", { name: /طلباتي|Mes commandes/ });
  try {
    await ordersChip.first().waitFor({ timeout: 10000 });
  } catch {
    throw new Error("Segment « طلباتي » absent : l'onglet Activité ne propose pas les commandes.");
  }
  await ordersChip.first().click();
  await expectAnchor(
    page.getByText(/CMD-\d{4}-\d{5}/),
    "référence de commande /CMD-\\d{4}-\\d{5}/",
    15000,
    "Le cliché ne porte aucune commande (le miroir de démo en envoie 4).",
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS[5] });

  const absent = SHOTS.filter((file) => !fs.existsSync(file));
  if (absent.length > 0) {
    throw new Error(`Capture(s) absente(s) : ${absent.join(", ")}`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`Erreurs console pendant les captures : ${consoleErrors.join(" | ")}`);
  }
  console.log("shots-ok");
} finally {
  await browser.close();
}
