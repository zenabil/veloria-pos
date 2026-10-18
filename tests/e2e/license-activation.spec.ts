// Veloria PoS — E2E : activation hors-ligne obligatoire.
// Sans licence : fenêtre d'activation bloquante (jamais la coquille).
// Après import : bascule vers la coquille. Expirée : lecture seule.
// Requiert la clé vendor (machine vendor), sinon ignoré.
import { _electron as electron } from "@playwright/test";
import { test } from "@playwright/test";
import {
  REPO_ROOT,
  closeApp,
  electronExecutable,
  gotoModule,
  issueTestLicense,
  launchActivatedApp,
  makeIsolatedDirs,
  skipIfNoVendorKey,
  staffLoginIfNeeded,
  expect,
  type AppContext,
} from "./helpers";

test.describe("Activation obligatoire", () => {
  test("sans licence : fenêtre d'activation, pas de coquille", async () => {
    const dirs = makeIsolatedDirs();
    const exe = electronExecutable();
    const installed = exe.toLowerCase().endsWith("veloria pos.exe");
    const app = await electron.launch({
      executablePath: exe,
      args: installed
        ? [`--user-data-dir=${dirs.userData}`]
        : [".", `--user-data-dir=${dirs.userData}`],
      cwd: REPO_ROOT,
      env: { ...process.env, PROGRAMDATA: dirs.programData },
      timeout: 60_000,
    });
    let ctx: AppContext | null = null;
    try {
      const page = await app.firstWindow({ timeout: 60_000 });
      await page
        .getByRole("heading", { name: "Activation de Veloria POS" })
        .waitFor({ timeout: 30_000 });
      await expect(page.locator("#hwid")).toContainText(/^[A-Z0-9]{4}-[A-Z0-9]{4}/);
      expect(await page.getByRole("navigation", { name: "Navigation principale" }).count()).toBe(0);
      ctx = { ...dirs, app, page };
    } finally {
      if (ctx) await closeApp(ctx);
      else await app.close().catch(() => undefined);
    }
  });

  test("import externe + redémarrage : bascule vers la coquille", async () => {
    // Deux Chromium sur le même userData corrompraient le trousseau DPAPI :
    // l'import externe se fait app FERMÉE (l'import en session passe par le
    // dialogue natif, même processus — QA manuelle, voir SECURITY_TEST_REPORT).
    skipIfNoVendorKey();
    const dirs = makeIsolatedDirs();
    const exe = electronExecutable();
    const launch = (): ReturnType<typeof electron.launch> =>
      electron.launch({
        executablePath: exe,
        args: [".", `--user-data-dir=${dirs.userData}`],
        cwd: REPO_ROOT,
        env: { ...process.env, PROGRAMDATA: dirs.programData },
        timeout: 60_000,
      });
    let app = await launch();
    try {
      const licensePage = await app.firstWindow({ timeout: 60_000 });
      await licensePage
        .getByRole("heading", { name: "Activation de Veloria POS" })
        .waitFor({ timeout: 30_000 });
      await app.close().catch(() => undefined);
      await issueTestLicense(dirs, { tag: "switch" });
      app = await launch();
      const mainPage = await app.firstWindow({ timeout: 60_000 });
      // Porte session 0041 : base neuve = bootstrap admin + code initial
      // affiché une fois — on franchit la porte comme l'opérateur.
      await staffLoginIfNeeded(mainPage);
      await mainPage
        .getByRole("navigation", { name: "Navigation principale" })
        .waitFor({ timeout: 60_000 });
      const ctx: AppContext = { ...dirs, app, page: mainPage };
      await closeApp(ctx);
    } catch (e) {
      await app.close().catch(() => undefined);
      throw e;
    }
  });

  test("expirée : coquille en lecture seule + bannière", async () => {
    const ctx = await launchActivatedApp(undefined, {
      tag: "expired",
      allowExpiredSeed: true,
      dates: { startsAt: "2024-01-01T00:00:00.000Z", expiresAt: "2024-06-01T00:00:00.000Z" },
    });
    try {
      await ctx.page
        .getByRole("navigation", { name: "Navigation principale" })
        .waitFor({ timeout: 60_000 });
      await expect(ctx.page.getByRole("alert")).toContainText(/Licence expirée/);
    } finally {
      await closeApp(ctx);
    }
  });

  test("activée : coquille complète + module Licence", async () => {
    skipIfNoVendorKey();
    const ctx = await launchActivatedApp();
    try {
      await gotoModule(ctx.page, "Licence");
      await expect(ctx.page.getByText("Active", { exact: true }).first()).toBeVisible();
    } finally {
      await closeApp(ctx);
    }
  });
});
