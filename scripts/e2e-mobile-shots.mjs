// Captures APK (Stitch) via Chromium headless — usage manuel/E2E visuel.
// Pré-requis :
//   1. `npx expo start --web --port 8083` avec EXPO_PUBLIC_SYNC_URL pointant
//      le relais CORS-compatible `scripts/e2e-mirror-relay.mjs` (port 8100) ;
//   2. variables obligatoires PHONE et PIN — aucun code n'est stocké ici :
//        PHONE=0555xxxxxx PIN=xxxxxx node scripts/e2e-mobile-shots.mjs
// Sortie : test-results/e2e-loop/m-home.png, m-invoices.png, m-detail.png
import fs from "node:fs";
import { chromium } from "@playwright/test";

const PHONE = process.env.PHONE ?? "";
const PIN = process.env.PIN ?? "";
const URL = "http://127.0.0.1:8083";
const OUT = "test-results/e2e-loop";
const SHOTS = [`${OUT}/m-home.png`, `${OUT}/m-invoices.png`, `${OUT}/m-detail.png`];
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

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  // Le login rend des `aria-label` issus du glossaire (i18n.ts), pas des
  // ancres techniques : `phone`/`pin` ne correspondaient plus à rien et la
  // capture échouait systématiquement. Insensible à la langue (ar défaut).
  await page.getByLabel(/هاتف|t[eé]l[eé]phone/i).fill(PHONE);
  await page.getByLabel(/رمز العميل|Code client/i).fill(PIN);
  await page.getByRole("button", { name: /دخول|Entrer/ }).click();
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
  const tabBar = page.getByTestId("tab-bar");
  await expectAnchor(
    tabBar,
    "barre d'onglets (data-testid=tab-bar)",
    15000,
    "La barre d'onglets n'est pas rendue.",
  );
  await tabBar.getByRole("button", { name: "فواتيري" }).click();
  await expectAnchor(
    page.getByText(/FAC-\d{4}-/),
    "numéro de facture /FAC-\\d{4}-/",
    15000,
    "Aucune facture dans le miroir (le motif est indépendant de l'année).",
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOTS[1] });

  // Détail : déplie la première facture puis « الوصل ».
  const cards = page.getByRole("button", { name: "عرض التفاصيل" });
  try {
    await cards.first().waitFor({ timeout: 15000 });
  } catch {
    throw new Error(
      "Aucune carte facture (« عرض التفاصيل ») : capture du détail impossible — échec explicite plutôt qu'un faux shots-ok.",
    );
  }
  await cards.first().click();
  const receipt = page.getByRole("button", { name: "الوصل" });
  await expectAnchor(receipt, "bouton « الوصل »", 15000, LANG_HINT);
  await receipt.first().click();
  await expectAnchor(
    page.getByText("تفاصيل الفاتورة"),
    "page détail « تفاصيل الفاتورة »",
    15000,
    LANG_HINT,
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOTS[2] });

  const absent = SHOTS.filter((file) => !fs.existsSync(file));
  if (absent.length > 0) {
    throw new Error(`Capture(s) absente(s) : ${absent.join(", ")}`);
  }
  console.log("shots-ok");
} finally {
  await browser.close();
}
