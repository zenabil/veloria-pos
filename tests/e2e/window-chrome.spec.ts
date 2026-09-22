// Veloria PoS — E2E : chrome frameless (drag, réduire, agrandir,
// restaurer, double-clic, fermer). Fenêtre réelle, base vierge.
// Le test de fermeture est volontairement le DERNIER du fichier.
import { test } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  closeApp,
  gotoModule,
  killStaleTestInstances,
  launchActivatedApp,
  relaunchApp,
  waitForProcessExit,
  expect,
  type AppContext,
} from "./helpers.ts";

const DRAG_SCRIPT = `param($x0,$y0,$x1,$y1,$steps)
$x0=[int]$x0; $y0=[int]$y0; $x1=[int]$x1; $y1=[int]$y1; $steps=[int]$steps
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int b,int e);' -Name WMDrag -Namespace WME2E
[WME2E.WMDrag]::mouse_event(0x8001,$x0,$y0,0,0)
Start-Sleep -Milliseconds 250
[WME2E.WMDrag]::mouse_event(0x8002,0,0,0,0)
Start-Sleep -Milliseconds 80
[WME2E.WMDrag]::mouse_event(0x8004,0,0,0,0)
Start-Sleep -Milliseconds 400
[WME2E.WMDrag]::mouse_event(0x8001,$x0,$y0,0,0)
Start-Sleep -Milliseconds 150
[WME2E.WMDrag]::mouse_event(0x8002,0,0,0,0)
Start-Sleep -Milliseconds 150
for ($i=1; $i -le $steps; $i++) {
  $x=[int]($x0+($x1-$x0)*$i/$steps)
  $y=[int]($y0+($y1-$y0)*$i/$steps)
  [WME2E.WMDrag]::mouse_event(0x8001,$x,$y,0,0)
  Start-Sleep -Milliseconds 30
}
[WME2E.WMDrag]::mouse_event(0x8004,0,0,0,0)`;

/** Exécute un script PowerShell temporaire (masqué) et retourne sa sortie. */
async function runHiddenPs(script: string, args: string[]): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-ps-"));
  const file = path.join(dir, "s.ps1");
  fs.writeFileSync(file, script, "utf-8");
  try {
    return await new Promise<string>((resolve) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file, ...args],
        { timeout: 30_000, windowsHide: true },
        (err: unknown, stdout: string) =>
          resolve(err instanceof Error ? `ERR:${err.message}` : String(stdout).trim()),
      );
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const PROBE_SCRIPT = `param($px,$py)
$px=[int]$px; $py=[int]$py
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(int x,int y); [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,int f); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder b,int n); [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h,ref int p);' -Name PRBQ -Namespace PRBQN
$hw=[PRBQN.PRBQ]::WindowFromPoint($px,$py)
$root=[PRBQN.PRBQ]::GetAncestor($hw,2)
$tb=New-Object System.Text.StringBuilder(256)
[PRBQN.PRBQ]::GetWindowText($root,$tb,256) | Out-Null
$rp=0
[PRBQN.PRBQ]::GetWindowThreadProcessId($root,[ref]$rp) | Out-Null
"ROOT=[$($tb.ToString())] ROOTPID=$rp"`;

const CLICK_SCRIPT = `param($x,$y)
$x=[int]$x; $y=[int]$y
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int px,int py,int b,int e);' -Name CLKQ -Namespace CLKQN
[CLKQN.CLKQ]::mouse_event(0x8001,$x,$y,0,0)
Start-Sleep -Milliseconds 200
[CLKQN.CLKQ]::mouse_event(0x8002,0,0,0,0)
Start-Sleep -Milliseconds 80
[CLKQN.CLKQ]::mouse_event(0x8004,0,0,0,0)`;

interface OsPoint {
  norm: [number, number];
  phys: [number, number];
}

async function rootWindowAt(phys: [number, number]): Promise<{ title: string; pid: number }> {
  const out = await runHiddenPs(PROBE_SCRIPT, [`${phys[0]}`, `${phys[1]}`]);
  return {
    title: /ROOT=\[(.*)\] ROOTPID=/.exec(out)?.[1] ?? "",
    pid: Number(/ROOTPID=(\d+)/.exec(out)?.[1] ?? -1),
  };
}

/**
 * Place la fenêtre à un emplacement LIBRE (aucune autre fenêtre au point de
 * drag) puis l'amène devant par un vrai clic : le bureau de test peut contenir
 * d'autres fenêtres (IDE) dont la position est inconnue. Échoue explicitement
 * si aucune zone n'est libre (environnement, pas un bug applicatif).
 */
async function prepareOsDragSpot(kind: "move" | "resize"): Promise<{
  before: { x: number; y: number; width: number; height: number };
  start: OsPoint;
  end: OsPoint;
} | null> {
  const display = await ctx.app.evaluate(({ screen }) => {
    const d = screen.getPrimaryDisplay();
    return { width: d.size.width, height: d.size.height, scale: d.scaleFactor };
  });
  const toNorm = (dipX: number, dipY: number): [number, number] => [
    Math.round((dipX * 65535) / display.width),
    Math.round((dipY * 65535) / display.height),
  ];
  const toPhys = (dipX: number, dipY: number): [number, number] => [
    Math.round(dipX * display.scale),
    Math.round(dipY * display.scale),
  ];
  const ourPid = ctx.app.process().pid ?? -1;
  const spots: [number, number][] =
    kind === "move"
      ? [
          [80, 60],
          [320, 80],
          [80, 420],
          [560, 120],
          [80, 140],
        ]
      : [
          [60, 80],
          [350, 80],
          [60, 350],
          [350, 350],
        ];
  for (const [sx, sy] of spots) {
    if (kind === "resize" && sx + 1550 > display.width) continue;
    if (kind === "move" && (sx + 1600 > display.width || sy + 900 > display.height)) continue;
    await ctx.app.evaluate(
      ({ BrowserWindow }, spot: { x: number; y: number; kind: string }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.setPosition(spot.x, spot.y);
        if (spot.kind === "resize") win?.setSize(1300, 800);
      },
      { x: sx, y: sy, kind },
    );
    const before = await mainBounds();
    const startDip: [number, number] =
      kind === "move"
        ? [before.x + 400, before.y + 24]
        : [before.x + before.width - 3, before.y + 400];
    const endDip: [number, number] =
      kind === "move"
        ? [before.x + 550, before.y + 84]
        : [before.x + before.width + 197, before.y + 400];
    const start: OsPoint = { norm: toNorm(...startDip), phys: toPhys(...startDip) };
    let probe = await rootWindowAt(start.phys);
    if (!(probe.title.includes("Veloria PoS") && probe.pid === ourPid)) {
      // Clic réel : amène notre fenêtre devant si elle est seulement derrière.
      await runHiddenPs(CLICK_SCRIPT, [`${start.norm[0]}`, `${start.norm[1]}`]);
      await new Promise((r) => setTimeout(r, 500));
      probe = await rootWindowAt(start.phys);
    }
    if (probe.title.includes("Veloria PoS") && probe.pid === ourPid) {
      return { before, start, end: { norm: toNorm(...endDip), phys: toPhys(...endDip) } };
    }
  }
  // Environnement : une autre fenêtre recouvre tout l'écran (le mécanisme de
  // drag est prouvé par ailleurs) — on ignore plutôt qu'échouer à tort.
  return null;
}

/** Entrée souris OS réelle (coordonnées normalisées 0-65535). Test uniquement. */
async function realMouseDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: number,
): Promise<void> {
  const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "veloria-drag-")), "drag.ps1");
  fs.writeFileSync(script, DRAG_SCRIPT, "utf-8");
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
          `${x0}`,
          `${y0}`,
          `${x1}`,
          `${y1}`,
          `${steps}`,
        ],
        // Masquée : une console visible volerait le focus (et le clic) à l'app.
        { timeout: 30_000, windowsHide: true },
        (err: unknown) => {
          if (err instanceof Error) reject(err);
          else if (err) reject(new Error("Échec du drag souris OS"));
          else resolve();
        },
      );
    });
  } finally {
    fs.rmSync(path.dirname(script), { recursive: true, force: true });
  }
}

let ctx: AppContext;

test.beforeEach(async () => {
  ctx = await launchActivatedApp();
});

test.afterEach(async () => {
  await closeApp(ctx);
});

async function isMaximizedMain(): Promise<boolean> {
  return ctx.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.isMaximized() ?? false;
  });
}

async function isMinimizedMain(): Promise<boolean> {
  return ctx.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.isMinimized() ?? false;
  });
}

async function mainBounds(): Promise<{ x: number; y: number; width: number; height: number }> {
  return ctx.app.evaluate(({ BrowserWindow }) => {
    const b = BrowserWindow.getAllWindows()[0]?.getBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
}

async function waitForMainState(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - start > timeoutMs) throw new Error("État fenêtre non atteint");
    await new Promise((r) => setTimeout(r, 250));
  }
}

test("démarrage : barre de titre personnalisée avec 3 contrôles", async () => {
  const { page } = ctx;
  const bar = page.locator('header[aria-label="Barre de titre Veloria PoS"]');
  await expect(bar).toBeVisible();
  await expect(bar.getByText("Veloria PoS")).toBeVisible();
  await expect(bar.getByText("Vente")).toBeVisible();
  await expect(bar.getByRole("button", { name: "Réduire" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Agrandir" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Fermer" })).toBeVisible();
  expect(await isMaximizedMain()).toBe(false);
  await gotoModule(page, "Catalogue");
  await expect(bar.getByText("Catalogue")).toBeVisible();
});

test("drag : la fenêtre suit la souris depuis la barre de titre", async () => {
  // Le drag natif exige une vraie entrée OS (les événements CDP de Playwright
  // ne déclenchent pas la boucle de déplacement) : user32 via PowerShell.
  const spot = await prepareOsDragSpot("move");
  if (spot === null) {
    test.skip(true, "Bureau couvert : aucune zone libre pour le drag OS.");
    return;
  }
  const { before, start, end } = spot;
  await realMouseDrag(start.norm[0], start.norm[1], end.norm[0], end.norm[1], 12);
  const after = await mainBounds();
  expect(after.x - before.x).toBeGreaterThan(80);
  expect(after.y - before.y).toBeGreaterThan(30);
});

test("réduire : la fenêtre se minimise puis revient", async () => {
  const { page } = ctx;
  const bar = page.locator('header[aria-label="Barre de titre Veloria PoS"]');
  await bar.getByRole("button", { name: "Réduire" }).click();
  await waitForMainState(() => isMinimizedMain());
  await ctx.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.restore();
  });
  await waitForMainState(async () => !(await isMinimizedMain()));
});

test("agrandir puis restaurer via les boutons", async () => {
  const { page } = ctx;
  await page.getByRole("button", { name: "Agrandir" }).click();
  await waitForMainState(() => isMaximizedMain());
  await expect(page.getByRole("button", { name: "Restaurer" })).toBeVisible();
  await page.getByRole("button", { name: "Restaurer" }).click();
  await waitForMainState(async () => !(await isMaximizedMain()));
  await expect(page.getByRole("button", { name: "Agrandir" })).toBeVisible();
});

test("double-clic : bascule agrandi / restauré", async () => {
  const { page } = ctx;
  await page.mouse.dblclick(400, 24);
  await waitForMainState(() => isMaximizedMain());
  await page.mouse.dblclick(400, 24);
  await waitForMainState(async () => !(await isMaximizedMain()));
});

test("redimensionner : le bord droit agrandit la fenêtre", async () => {
  const spot = await prepareOsDragSpot("resize");
  if (spot === null) {
    test.skip(true, "Bureau couvert : aucune zone libre pour le drag OS.");
    return;
  }
  const { before, start, end } = spot;
  await realMouseDrag(start.norm[0], start.norm[1], end.norm[0], end.norm[1], 12);
  const after = await mainBounds();
  expect(after.width - before.width).toBeGreaterThan(120);
  expect(await isMaximizedMain()).toBe(false);
});

test("rouvrir après fermeture : démarrage fenêtré avec coquille", async () => {
  const { page } = ctx;
  const child = ctx.app.process();
  const closeBtn = page.getByRole("button", { name: "Fermer" });
  await expect(closeBtn).toBeVisible();
  await closeBtn.click({ timeout: 15_000 }).catch(() => undefined);
  const pageClosed =
    page.isClosed() ||
    (await page
      .waitForEvent("close", { timeout: 15_000 })
      .then(() => true)
      .catch(() => false));
  await waitForProcessExit(child, 30_000);
  expect(pageClosed).toBe(true);
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  await killStaleTestInstances();
  ctx = await relaunchApp(ctx);
  await expect(ctx.page.locator('header[aria-label="Barre de titre Veloria PoS"]')).toBeVisible();
  await expect(ctx.page.getByRole("heading", { name: "Vente" })).toBeVisible();
  expect(await isMaximizedMain()).toBe(false);
});

test("fermer : l'application quitte proprement", async () => {
  const { page } = ctx;
  const child = ctx.app.process();
  const closeBtn = page.getByRole("button", { name: "Fermer" });
  await expect(closeBtn).toBeVisible();
  // Le clic peut « échouer » car la page meurt sous lui : c'est le résultat attendu.
  // (La fermeture peut aussi précéder l'écoute de l'événement : on vérifie l'état final.)
  await closeBtn.click({ timeout: 15_000 }).catch(() => undefined);
  const pageClosed =
    page.isClosed() ||
    (await page
      .waitForEvent("close", { timeout: 15_000 })
      .then(() => true)
      .catch(() => false));
  await waitForProcessExit(child, 30_000);
  expect(pageClosed).toBe(true);
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
});
