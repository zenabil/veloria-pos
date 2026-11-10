// Veloria PoS — E2E boucle RÉELLE : POS → vrai Supabase → contrat client-sync.
// Diffère de `full-loop-client.spec.ts` (relais local :8100) en ce qu'il frappe
// le projet Supabase du commerçant : schéma réel, RLS réel, Edge Function réelle.
// Les identifiants viennent UNIQUEMENT de l'environnement (jamais du dépôt) :
//   VELORIA_MIRROR_URL / VELORIA_MIRROR_SERVICE_KEY / VELORIA_MIRROR_ANON_KEY
// sans eux la suite est annoncée IGNORÉE avec le motif (jamais vert par absence).
// Laisse le miroir propre : les lignes de test sont supprimées en fin de run.
import { test } from "@playwright/test";
import { createHash } from "node:crypto";
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

const MIRROR_URL = (process.env["VELORIA_MIRROR_URL"] ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env["VELORIA_MIRROR_SERVICE_KEY"] ?? "";
const ANON_KEY = process.env["VELORIA_MIRROR_ANON_KEY"] ?? "";
const CONFIGURED = MIRROR_URL !== "" && SERVICE_KEY !== "" && ANON_KEY !== "";
/**
 * `VELORIA_MIRROR_KEEP_DATA=1` : laisse les lignes du run (identifiants affichés
 * en fin de test) pour vérifier à la main dans l'APK/le web. Sans ça le miroir
 * reste propre : une base de test jetée ne doit rien laisser derrière elle.
 */
const KEEP_DATA = process.env["VELORIA_MIRROR_KEEP_DATA"] === "1";
const MISSING_REASON =
  "Miroir réel non fourni : relancer avec VELORIA_MIRROR_URL + VELORIA_MIRROR_SERVICE_KEY + VELORIA_MIRROR_ANON_KEY (`npm run test:e2e:cloud`).";

const phoneHash = (phone: string): string =>
  createHash("sha256").update(phone.trim()).digest("hex");

async function rest(pathAndQuery: string, key: string, init?: RequestInit): Promise<unknown> {
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const extra = init?.headers;
  if (extra && !Array.isArray(extra) && !(extra instanceof Headers)) {
    for (const [k, v] of Object.entries(extra)) headers[k] = v;
  }
  const res = await fetch(`${MIRROR_URL}${pathAndQuery}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${pathAndQuery} : ${text.slice(0, 300)}`);
  return text === "" ? null : (JSON.parse(text) as unknown);
}

test.setTimeout(420_000);
// Garde de fichier (pas de test) : sans identifiants, AUCUN hook ne tourne —
// sinon `beforeEach` lance l'app et échoue pour une raison qui n'est pas le
// motif d'ignorance annoncé.
test.skip(!CONFIGURED, MISSING_REASON);

let ctx: AppContext;
let testPhone = "";
let testCustomerId: number | null = null;

test.beforeEach(async () => {
  ctx = await launchActivatedApp(makeIsolatedDirs());
});

test.afterEach(async () => {
  await closeApp(ctx);
  // Le miroir se reconstruit depuis le POS : les lignes de ce run n'ont plus
  // de contrepartie locale (base jetée), elles resteraient orphelines.
  if (CONFIGURED && testPhone !== "" && !KEEP_DATA) {
    try {
      await rest(`/rest/v1/client_access?phone_hash=eq.${phoneHash(testPhone)}`, SERVICE_KEY, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      console.log(`E2E-CLOUD cleanup: client_access supprimé pour ${testPhone}`);
    } catch (err) {
      console.log(`E2E-CLOUD cleanup ÉCHEC (à faire à la main) : ${String(err).slice(0, 200)}`);
    }
  }
});

test("boucle réelle : clés Supabase saisies, vente visible par le contrat client-sync", async () => {
  const { page } = ctx;
  testCustomerId = null;
  const who = `Nuage${uniqueTag("C").slice(-6)} Test${uniqueTag("T").slice(-6)}`;
  testPhone = `0556${String(Math.floor(100000 + Math.random() * 900000))}`;
  const pin = "731904";
  const product = uniqueTag("NuageProduit");

  // 1. Coquille activée, miroir saisi AVANT l'activation (le QR V2 embarque
  // URL + clé anon — ADR-068).
  await expect(page.getByRole("heading", { name: "Caisse" })).toBeVisible();
  await gotoModule(page, "Paramètres");
  await page.getByRole("button", { name: /Données/ }).click();
  await expect(page.getByRole("heading", { name: "Miroir Android" })).toBeVisible();
  const mirror = page.locator('[data-settings-card="sync"]');
  await mirror.getByLabel("Adresse du serveur (URL)", { exact: true }).fill(MIRROR_URL);
  await mirror.getByLabel("Clé anon Supabase", { exact: true }).fill(ANON_KEY);
  await mirror.getByRole("button", { name: "Enregistrer" }).click();

  // 2. Client + téléphone.
  await gotoModule(page, "Clients");
  await page.locator('button[title="Créer un client"]').click();
  await page.getByLabel("Nom complet", { exact: true }).fill(who);
  await page.getByLabel("Téléphone", { exact: true }).fill(testPhone);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await readSuccessToast(page, /créé/);
  await expect(page.getByRole("row", { name: new RegExp(testPhone) })).toBeVisible();

  // 3. Activation de l'application mobile (PIN).
  async function openDrawer(): Promise<void> {
    const row = page.getByRole("row", { name: new RegExp(who.slice(0, 12)) }).first();
    await row.scrollIntoViewIfNeeded();
    await row.locator('button[title="Détails de la fiche"]').click();
    await expect(page.getByText("Application mobile")).toBeVisible();
  }
  await openDrawer();
  await page.getByLabel("PIN à 6 chiffres", { exact: true }).fill(pin);
  await page.getByRole("button", { name: "Activer l'application" }).click();
  await expect(page.getByText("Activée", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Fermer le détail" }).click();

  // 4. Produit.
  await gotoModule(page, "Catalogue");
  await page.locator('button[title="Créer un produit"]').click();
  await page.getByLabel("Nom du produit", { exact: true }).fill(product);
  await page.getByLabel("Prix de vente", { exact: true }).fill("250");
  await page.getByLabel("Stock", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await readSuccessToast(page, /créé/);

  // 5. Vente : 2 × 250 = 500, réglée intégralement (espèces).
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
  await settlePayment(page, "500", false);
  const toast = await readSuccessToast(page, /Vente .* enregistrée/);
  const invoice = /FAC-\S+/.exec(toast)?.[0] ?? "";
  expect(invoice).toMatch(/FAC-/);
  await page.keyboard.press("Escape");

  // 6. Mise en file depuis la fiche, puis poussée RÉELLE vers le miroir.
  await gotoModule(page, "Clients");
  await openDrawer();
  await page.getByRole("button", { name: "Synchroniser" }).click();
  await readSuccessToast(page, /mis en file/);
  await page.getByRole("dialog").getByRole("button", { name: "Fermer le détail" }).click();

  await gotoModule(page, "Paramètres");
  await page.getByRole("button", { name: /Données/ }).click();
  await mirror.getByLabel("Clé service Supabase", { exact: true }).fill(SERVICE_KEY);
  await mirror.getByLabel("Cadence de poussée", { exact: true }).fill("15");
  const syncSwitch = mirror.getByRole("switch", { name: "Synchronisation miroir" });
  if ((await syncSwitch.getAttribute("aria-checked")) !== "true") await syncSwitch.click();
  await mirror.getByRole("button", { name: "Enregistrer" }).click();
  await mirror.getByRole("button", { name: "Pousser maintenant" }).click();
  const anyToast = page.locator('[role="status"], [role="alert"]');
  await anyToast.first().waitFor({ timeout: 40_000 });
  const pushedText = (await anyToast.allTextContents()).join(" | ");
  console.log(`E2E-CLOUD push: ${pushedText.slice(0, 400)}`);
  const pushed = await readSuccessToast(page, /Miroir poussé/);
  expect(pushed, `poussée vers le cloud réel : ${pushedText}`).toMatch(
    /Miroir poussé : \d+ cliché/,
  );

  // 7. Côté Supabase : la ligne d'accès existe, condensat du téléphone réel.
  const access = (await rest(
    `/rest/v1/client_access?select=customer_id,phone_hash,pin_algo,revoked_at&phone_hash=eq.${phoneHash(testPhone)}`,
    SERVICE_KEY,
  )) as { customer_id: number; phone_hash: string; pin_algo: string; revoked_at: string | null }[];
  expect(access.length, "1 ligne client_access pour le téléphone de test").toBe(1);
  testCustomerId = access[0]?.customer_id ?? null;
  expect(access[0]?.phone_hash).toBe(phoneHash(testPhone));
  expect(access[0]?.revoked_at).toBeNull();

  const payloads = (await rest(
    `/rest/v1/client_payloads?select=kind,operation_id&customer_id=eq.${testCustomerId}&order=id.asc`,
    SERVICE_KEY,
  )) as { kind: string; operation_id: string }[];
  const kinds = new Set(payloads.map((p) => p.kind));
  for (const kind of ["customer_snapshot", "invoice_list", "payment_list", "invoice_detail"]) {
    expect(kinds.has(kind), `cliché « ${kind} » reçu (${payloads.length} lignes)`).toBe(true);
  }

  // 8. Le VRAI contrat de l'APK : login téléphone + PIN via l'Edge Function.
  const login = (await rest("/functions/v1/client-sync", ANON_KEY, {
    method: "POST",
    body: JSON.stringify({ phone: testPhone, pin }),
  })) as {
    ok: boolean;
    data: {
      customer?: { id?: number; name?: string };
      invoices?: { sales?: { id: number; invoice_number: string; total_minor?: number }[] };
      syncedAt?: string;
    };
  };
  expect(login.ok).toBe(true);
  const sales = login.data.invoices?.sales ?? [];
  const found = sales.find((s) => s.invoice_number === invoice);
  expect(found, `facture ${invoice} servie par le cloud (sales=${sales.length})`).toBeDefined();
  expect(Number(found?.total_minor), "montant en centimes côté cloud").toBe(50_000);

  // 9. Détail de facture (page détail de l'APK), même endpoint + saleId.
  const detail = (await rest("/functions/v1/client-sync", ANON_KEY, {
    method: "POST",
    body: JSON.stringify({ phone: testPhone, pin, saleId: Number(found?.id) }),
  })) as {
    ok: boolean;
    data?: { detail?: { sale?: { invoice_number?: string; total_minor?: number } } };
  };
  expect(detail.ok).toBe(true);
  expect(detail.data?.detail?.sale?.invoice_number).toBe(invoice);

  // 10. Un mauvais PIN doit être refusé PAR LE CLOUD (le miroir n'est pas un
  // simple transcript : la porte d'entrée est vérifiée côté serveur).
  let badStatus = 0;
  try {
    await rest("/functions/v1/client-sync", ANON_KEY, {
      method: "POST",
      body: JSON.stringify({ phone: testPhone, pin: "000000" }),
    });
  } catch (err) {
    badStatus = Number(/HTTP (\d{3})/.exec(String(err))?.[1] ?? 0);
  }
  expect(badStatus, "PIN erroné refusé par l'Edge Function").toBe(401);

  console.log(
    `E2E-CLOUD result: invoice=${invoice} customer_id=${testCustomerId} payloads=${payloads.length} kinds=${[...kinds].join(",")}`,
  );
  console.log(
    KEEP_DATA
      ? `E2E-CLOUD creds APK (laissées en place) : phone=${testPhone} pin=${pin}`
      : `E2E-CLOUD creds APK (supprimées en cleanup) : phone=${testPhone} pin=${pin}`,
  );
});
