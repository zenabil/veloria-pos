// Veloria PoS — E2E helpers : lancement isolé + navigation + toasts.
// Chaque test obtient une base SQLite VIERGE (PROGRAMDATA + userData
// temporaires) : répétable, sans production, indépendant de l'ordre.

import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encodeVlic, signPayload } from "../../electron/licensing/protocol";
import { LICENSE_PAGES } from "../../electron/licensing/catalog";
import { getHardwareFingerprint } from "../../electron/licensing/fingerprint";

export const REPO_ROOT = process.cwd();

export function electronExecutable(): string {
  // VELORIA_E2E_EXE : binaire à tester (défaut = Electron du repo).
  // Permet de viser l'application INSTALLÉE (Veloria PoS.exe).
  const override = process.env["VELORIA_E2E_EXE"];
  if (override) {
    if (!fs.existsSync(override)) throw new Error(`Binaire E2E introuvable : ${override}`);
    return override;
  }
  const exe =
    process.platform === "win32"
      ? path.join(REPO_ROOT, "node_modules", "electron", "dist", "electron.exe")
      : path.join(REPO_ROOT, "node_modules", "electron", "dist", "electron");
  if (!fs.existsSync(exe)) throw new Error(`Binaire Electron introuvable : ${exe}`);
  if (!fs.existsSync(path.join(REPO_ROOT, "dist", "index.html"))) {
    throw new Error("Build renderer absent : lancez `npm run build` avant `npm run test:e2e`.");
  }
  if (!fs.existsSync(path.join(REPO_ROOT, "dist-electron", "main", "main.js"))) {
    throw new Error(
      "Build electron absent : lancez `npm run build:electron` avant `npm run test:e2e`.",
    );
  }
  return exe;
}

export interface IsolatedDirs {
  root: string;
  programData: string;
  userData: string;
}

export function makeIsolatedDirs(): IsolatedDirs {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-e2e-"));
  const programData = path.join(root, "ProgramData");
  const userData = path.join(root, "userData");
  fs.mkdirSync(programData, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  return { root, programData, userData };
}

export interface AppContext extends IsolatedDirs {
  app: ElectronApplication;
  page: Page;
}

/** Clé privée vendor (machine vendor uniquement, jamais en CI sans clé). */
export function vendorPrivateKey(): string | null {
  const candidate = path.join(REPO_ROOT, "private", "vendor-keys", "private.key");
  try {
    const pem = fs.readFileSync(candidate, "utf-8");
    return pem.includes("PRIVATE KEY") ? pem : null;
  } catch {
    return null;
  }
}

/** Ignore proprement les tests exigeant une licence sans clé vendor. */
export function skipIfNoVendorKey(): void {
  test.skip(
    vendorPrivateKey() == null,
    "Clé vendor absente (private/vendor-keys) : activation E2E impossible.",
  );
}

/**
 * Installeur per-machine (Program Files) : l'installation/désinstallation
 * silencieuse exige l'élévation UAC. Sans elle, `net session` échoue et le
 * test est ignoré proprement (pas d'invite UAC bloquante en CI non-élevé).
 */
export async function isElevated(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("net", ["session"], { timeout: 15_000, windowsHide: true }, (err) => {
      resolve(!err);
    });
  });
}

export interface TestLicenseDates {
  startsAt: string;
  expiresAt: string | null;
}

/**
 * Émet une vraie licence d'essai (clé vendor + empreinte RÉELLE du poste)
 * et l'importe dans l'état chiffré RÉEL des dossiers isolés — sans crochet
 * de test dans l'application (même code que l'opérateur).
 */
export async function issueTestLicense(
  dirs: IsolatedDirs,
  opts?: { dates?: TestLicenseDates; tag?: string; allowExpiredSeed?: boolean },
): Promise<string> {
  const priv = vendorPrivateKey();
  if (!priv) throw new Error("Clé vendor absente.");
  const { fingerprint } = getHardwareFingerprint();
  const now = new Date();
  const startsAt = opts?.dates?.startsAt ?? now.toISOString();
  const expiresAt =
    opts?.dates?.expiresAt ?? new Date(now.getTime() + 365 * 86400_000).toISOString();
  const payload = {
    schemaVersion: 1 as const,
    licenseId: `VLIC-E2E-${Date.now().toString(36).toUpperCase()}`,
    productId: "veloria-pos",
    edition: "professional" as const,
    licenseType: "term" as const,
    hardwareFingerprint: fingerprint,
    issuedAt: now.toISOString(),
    startsAt,
    expiresAt,
    // H-3/§19 : licence MODERNE à capabilities explicites — `pages` couvrant
    // les 17 modules (comme le Manager émet). L'octroi silencieux legacy
    // (pages absentes) est refusé pour les licences émises après le cutoff :
    // le harnais E2E doit parler le contrat actuel, pas l'ancien.
    pages: Object.fromEntries(LICENSE_PAGES.map((p) => [p, true])),
    // Features = celles exigées par les flux E2E (vente→preview 80mm/A4,
    // crédit, retours, backup/restore) — sans elles, les gardes refuseraient
    // par conception.
    features: [
      "advanced-reports",
      "multi-printer",
      "ocr",
      "receipt-80mm",
      "invoice-a4",
      "pdf-export",
      "debt-management",
      "partial-payments",
      "returns",
      "automatic-backup",
      "restore-backup",
    ],
  };
  const vlic = encodeVlic({ payload, signature: signPayload(payload, priv) });
  const file = path.join(dirs.root, `test-license-${opts?.tag ?? "a"}.vlic`);
  fs.writeFileSync(file, vlic, "utf-8");
  // Import externe AVANT tout lancement (deux Chromium sur le même userData
  // corrompraient le trousseau DPAPI partagé — jamais en concurrence).
  await new Promise<void>((resolve, reject) => {
    const exe =
      process.platform === "win32"
        ? path.join(REPO_ROOT, "node_modules", "electron", "dist", "electron.exe")
        : path.join(REPO_ROOT, "node_modules", "electron", "dist", "electron");
    const expected = opts?.allowExpiredSeed
      ? /"state":"(ACTIVE|EXPIRING_SOON|EXPIRED)"/
      : /"state":"(ACTIVE|EXPIRING_SOON)"/;
    execFile(
      exe,
      [
        path.join("scripts", "licensing", "import-local-license.cjs"),
        file,
        `--user-data-dir=${dirs.userData}`,
        ...(opts?.allowExpiredSeed ? ["--allow-expired"] : []),
      ],
      {
        cwd: REPO_ROOT,
        timeout: 90_000,
        windowsHide: true,
        env: { ...process.env, VELORIA_E2E: "1" },
      },
      (err, stdout, stderr) => {
        // Expirée attendue : le script sort 1 avec un JSON EXPIRED valide.
        if (err && opts?.allowExpiredSeed && /"state":"EXPIRED"/.test(String(stdout))) {
          resolve();
          return;
        }
        if (err) {
          reject(
            new Error(
              `Import licence E2E impossible (${String(err.message).slice(0, 200)}): ${String(stdout).slice(-300)} ## ${String(stderr).slice(-300)}`,
            ),
          );
          return;
        }
        if (!expected.test(String(stdout))) {
          reject(new Error(`Licence E2E inattendue : ${String(stdout).slice(-500)}`));
          return;
        }
        resolve();
      },
    );
  });
  return file;
}

/**
 * Démarre l'app réelle ACTIVÉE.
 * Séquence obligatoire : boot (profil Chromium + trousseau DPAPI créés par
 * l'app) → fermeture → import externe (chiffré avec LA clé du profil) →
 * reboot. Un import avant tout boot corrompt la continuité du trousseau
 * (deux Chromium ne partagent jamais un userData).
 * Sans clé vendor, le test est ignoré (pas d'activation possible).
 */
export async function launchActivatedApp(
  dirs?: IsolatedDirs,
  issueOpts?: { dates?: TestLicenseDates; tag?: string; allowExpiredSeed?: boolean },
): Promise<AppContext> {
  skipIfNoVendorKey();
  const d = dirs ?? makeIsolatedDirs();
  const boot = await bootApp(d);
  await boot.page
    .getByRole("heading", { name: "Activation de Veloria POS" })
    .waitFor({ timeout: 60_000 });
  await closeApp(boot, true);
  await issueTestLicense(d, issueOpts);
  return launchIsolatedApp(d);
}

/** Démarre l'app réelle et retourne la première fenêtre (sans présumer). */
export async function bootApp(dirs?: IsolatedDirs): Promise<AppContext> {
  const d = dirs ?? makeIsolatedDirs();
  const exe = electronExecutable();
  const installed = exe.toLowerCase().endsWith("veloria pos.exe");
  const app = await electron.launch({
    executablePath: exe,
    // Binaire installé : pas d'argument dossier (l'app empaquetée démarre seule).
    args: installed ? [`--user-data-dir=${d.userData}`] : [".", `--user-data-dir=${d.userData}`],
    cwd: REPO_ROOT,
    env: { ...process.env, PROGRAMDATA: d.programData },
    timeout: 60_000,
  });
  const page = await app.firstWindow({ timeout: 60_000 });
  return { ...d, app, page };
}

/** Démarre l'app réelle sur une base vierge et attend la coquille. */
export async function launchIsolatedApp(dirs?: IsolatedDirs): Promise<AppContext> {
  const ctx = await bootApp(dirs);
  // Écran pont indisponible exclu : la coquille est chargée.
  await ctx.page
    .getByRole("navigation", { name: "Navigation principale" })
    .waitFor({ timeout: 60_000 });
  return ctx;
}

/** Relance l'app sur les MÊMES dossiers (persistance après restart). */
export async function relaunchApp(dirs: IsolatedDirs): Promise<AppContext> {
  return launchIsolatedApp(dirs);
}

export async function closeApp(ctx: AppContext, keepDirs = false): Promise<void> {
  let child: import("node:child_process").ChildProcess | null = null;
  try {
    child = ctx.app.process();
  } catch {
    /* poignée déjà morte */
  }
  try {
    await ctx.app.close();
  } catch {
    /* déjà quittée (cas du restart) */
  }
  // Attend la sortie réelle : aucune fenêtre fantôme ne doit recouvrir le test
  // suivant (ni garder le verrou single-instance, ni verrouiller les fichiers).
  if (child) {
    const start = Date.now();
    while (Date.now() - start < 15_000) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    } catch {
      /* déjà sorti */
    }
  }
  if (!keepDirs) {
    try {
      fs.rmSync(ctx.root, { recursive: true, force: true });
    } catch {
      /* nettoyage best-effort */
    }
  }
}

/** Attend la sortie d'un processus (avec terminaison de secours, test uniquement). */
export async function waitForProcessExit(
  child: import("node:child_process").ChildProcess,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  try {
    child.kill();
  } catch {
    /* déjà sorti */
  }
}

function staleInstanceFilter(): { cmd: string; args: string[] } {
  // Ne cible QUE nos instances de test (dossier tmp `veloria-e2e-*`), jamais
  // une autre application Electron (ex. l'éditeur de l'utilisateur).
  if (process.platform === "win32") {
    return {
      cmd: "powershell.exe",
      args: [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" | Where-Object { $_.CommandLine -like '*veloria-e2e-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
      ],
    };
  }
  return { cmd: "pkill", args: ["-f", "veloria-e2e-"] };
}

/**
 * Tue les instances Electron orphelines de CE run de test (ex. relance
 * `app.relaunch()` qui garde le verrou single-instance). Test uniquement.
 */
export async function killStaleTestInstances(): Promise<void> {
  const { cmd, args } = staleInstanceFilter();
  const { execFile } = await import("node:child_process");
  await new Promise<void>((resolve) => {
    execFile(cmd, args, { timeout: 15_000, windowsHide: true }, () => resolve());
  });
}

/**Suffixe unique : chaque test crée SES entités (indépendant de l'ordre). */
export function uniqueTag(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export async function gotoModule(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("button", { name: label })
    .click();
  await page.getByRole("heading", { name: label }).first().waitFor();
}

/**
 * Lit le texte d'un toast de succès et le retourne.
 * (Sélecteur `[role]` + `hasText` : la correspondance par nom accessible ne
 * fonctionne pas sur ces régions live dans Chromium.)
 */
export async function readSuccessToast(page: Page, pattern: RegExp): Promise<string> {
  const toast = page.locator('[role="status"]', { hasText: pattern });
  await toast.first().waitFor();
  return ((await toast.first().textContent()) ?? "").trim();
}

export function acceptNextConfirm(page: Page): void {
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
}

export { expect };
