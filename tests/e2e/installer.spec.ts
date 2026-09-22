// Veloria PoS — E2E installeur NSIS : fresh install, réinstallation
// (même chemin que la mise à jour : GUID stable), désinstallation et
// préservation base/sauvegardes/réglages (dirs externes au dossier d'install).
// Ignoré proprement si l'installeur n'est pas construit (`package:win`).
// Base et profil temporaires : aucune donnée de production.
import { test } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  closeApp,
  gotoModule,
  isElevated,
  launchActivatedApp,
  launchIsolatedApp,
  makeIsolatedDirs,
  readSuccessToast,
  uniqueTag,
  expect,
  type AppContext,
} from "./helpers.ts";

test.setTimeout(600_000);

// P1-8 : version lue de package.json (jamais de constante soudée — un bump
// cassait l'E2E sans changement de code).
function expectedVersionPrefix(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
      version?: unknown;
    };
    const v = typeof pkg.version === "string" ? pkg.version : "1.0.0";
    return v
      .split(".")
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\.");
  } catch {
    return "1\\.0\\.0";
  }
}

function findInstaller(): string | null {
  const dir = path.join(process.cwd(), "release");
  if (!fs.existsSync(dir)) return null;
  const found = fs
    .readdirSync(dir)
    .filter((f) => /^Veloria-PoS-Setup-.*\.exe$/i.test(f))
    .sort();
  const first = found.at(0);
  return typeof first === "string" ? path.join(dir, first) : null;
}

function runHidden(
  exe: string,
  args: string[],
  timeoutMs = 300_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      const code =
        err && typeof err === "object" && "code" in err
          ? ((err as { code?: number | null }).code ?? 1)
          : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function waitForPath(p: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (fs.existsSync(p)) return;
    if (Date.now() - start > timeoutMs) throw new Error(`Chemin attendu absent : ${p}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Désinstallation NSIS avec dossier personnalisé (/D=) : le désinstalleur
 * retire tous les fichiers installés mais peut laisser la coquille vide.
 * On exige donc : disparu OU vide (aucun fichier applicatif restant).
 */
async function waitForUninstalled(dir: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (!fs.existsSync(dir)) return;
    const leftovers = fs.readdirSync(dir);
    // Vide = désinstallé (la coquille peut rester verrouillée un instant : on
    // ne la supprime pas nous-mêmes, aucun fichier applicatif ne subsiste).
    if (leftovers.length === 0) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Désinstallation incomplète, restes : ${leftovers.join(", ")}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

let ctx: AppContext | null = null;

test.afterEach(async () => {
  if (ctx) {
    const c = ctx;
    ctx = null;
    await closeApp(c);
  }
});

test("installeur : install, réinstall, désinstall sans perte de données", async () => {
  const installer = findInstaller();
  if (installer === null) {
    test.skip(true, "Installeur absent : lancez `npm run package:win` d'abord.");
    return;
  }
  // Per-machine (Program Files) : UAC obligatoire pour /S. Sans élévation,
  // l'installeur afficherait une invite bloquante → skip propre documenté.
  if (!(await isElevated())) {
    test.skip(true, "Installeur per-machine : relancez en administrateur (UAC).");
    return;
  }
  const setup: string = installer;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-inst-"));
  const installDir = path.join(scratch, "VeloriaTest");
  const tag = uniqueTag("E2EInst");
  const product = `Installeur${tag}`;

  // 1. Fresh install silencieuse dans un dossier dédié (sans espaces : /D=).
  const fresh = await runHidden(setup, ["/S", `/D=${installDir}`]);
  expect(fresh.code).toBe(0);
  const appExe = path.join(installDir, "Veloria PoS.exe");
  await waitForPath(appExe);
  const uninstaller = path.join(installDir, "Uninstall Veloria PoS.exe");
  await waitForPath(uninstaller);

  // 2. Branding : nom, version, éditeur depuis les ressources de l'exécutable.
  const verJson = await runHidden("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-Item '${appExe}').VersionInfo | Select-Object ProductName,ProductVersion,CompanyName | ConvertTo-Json -Compress`,
  ]);
  const ver = JSON.parse(verJson.stdout) as {
    ProductName: string;
    ProductVersion: string;
    CompanyName: string;
  };
  expect(ver.ProductName).toMatch(/Veloria PoS/);
  expect(ver.ProductVersion).toMatch(new RegExp(`^${expectedVersionPrefix()}`));
  expect(ver.CompanyName).toMatch(/Veloria/);

  // 3. Raccourcis per-machine (tous utilisateurs) : menu Démarrer partagé +
  // bureau public. (`perMachine:true` — les chemins per-user ne sont plus créés.)
  const programData = process.env["PROGRAMDATA"] ?? "C:\\ProgramData";
  const startMenu = path.join(
    programData,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Veloria",
    "Veloria PoS.lnk",
  );
  expect(fs.existsSync(startMenu)).toBe(true);
  const publicDesktop = path.join(
    path.dirname(programData),
    "Users",
    "Public",
    "Desktop",
    "Veloria PoS.lnk",
  );
  expect(fs.existsSync(publicDesktop)).toBe(true);

  // 4. L'app installée démarre sur une base vierge : on y crée une donnée.
  //    Les dossiers sont conservés entre les phases (données à prouver).
  const dirs = makeIsolatedDirs();
  process.env["VELORIA_E2E_EXE"] = appExe;
  try {
    ctx = await launchActivatedApp(dirs);
    const { page } = ctx;
    await gotoModule(page, "Catalogue");
    await page.locator('button[title="Créer un produit"]').click();
    await page.getByLabel("Nom du produit", { exact: true }).fill(product);
    await page.getByLabel("Prix de vente", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await readSuccessToast(page, /créé/);
    // Sauvegarde manuelle pour prouver sa préservation après désinstall.
    await gotoModule(page, "Paramètres");
    await page
      .getByRole("list", { name: "Rubriques paramètres" })
      .getByRole("button", { name: "Données (sauvegarde, base)" })
      .click();
    await page.getByRole("button", { name: "Sauvegarder maintenant" }).click();
    await readSuccessToast(page, /Sauvegarde créée/);
    const dbFile = path.join(dirs.programData, "Veloria PoS", "Data", "Veloria POS DB.sqlite");
    expect(fs.existsSync(dbFile)).toBe(true);
    const backupDir = path.join(dirs.userData, "backups");
    const backupsBefore = fs.readdirSync(backupDir).filter((f) => f.endsWith(".vposdb"));
    expect(backupsBefore.length).toBeGreaterThan(0);
  } finally {
    delete process.env["VELORIA_E2E_EXE"];
  }
  await closeApp(ctx, true);
  ctx = null;

  // 5. Réinstallation (même GUID/mécanisme qu'une mise à jour) : données intactes.
  // Les dirs sont CONSERVÉS (dont l'état licence) : l'app rouvre directement
  // la coquille (pas d'écran d'activation) — launchIsolatedApp, pas Activated.
  const reinstall = await runHidden(setup, ["/S", `/D=${installDir}`]);
  expect(reinstall.code).toBe(0);
  await waitForPath(appExe);
  process.env["VELORIA_E2E_EXE"] = appExe;
  try {
    ctx = await launchIsolatedApp(dirs);
    await gotoModule(ctx.page, "Catalogue");
    await ctx.page.getByPlaceholder("Nom ou code-barres…").fill(product);
    await expect(ctx.page.getByRole("row", { name: new RegExp(product) })).toBeVisible();
  } finally {
    delete process.env["VELORIA_E2E_EXE"];
  }
  await closeApp(ctx, true);
  ctx = null;

  // 6. Désinstallation silencieuse : fichiers partis, raccourci parti, données conservées.
  //    Le désinstalleur NSIS se recopie en temp et finit APRÈS la sortie du
  //    processus : on attend l'état final plutôt que la fin du processus.
  const un = await runHidden(uninstaller, ["/S"]);
  expect(un.code).toBe(0);
  await waitForUninstalled(installDir);
  {
    const start = Date.now();
    for (;;) {
      if (!fs.existsSync(startMenu)) break;
      if (Date.now() - start > 90_000) {
        throw new Error("Raccourci menu Démarrer toujours présent après désinstall.");
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  expect(
    fs.existsSync(path.join(dirs.programData, "Veloria PoS", "Data", "Veloria POS DB.sqlite")),
  ).toBe(true);
  expect(
    fs.readdirSync(path.join(dirs.userData, "backups")).filter((f) => f.endsWith(".vposdb")).length,
  ).toBeGreaterThan(0);
  expect(fs.existsSync(dirs.userData)).toBe(true);

  for (const d of [scratch, dirs.root]) {
    for (let i = 0; i < 5; i += 1) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
});
