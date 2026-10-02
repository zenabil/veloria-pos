// Smoke visuel du License Manager (outil vendor) : boot réel + capture.
// S1 : ce script rendait TOUJOURS exit(0) (waitForTimeout aveugle puis
// exit(0), y compris sur écran blanc/crash) — il ne pouvait donc jamais
// échouer. Ici : assertion de contenu réel (titre + contrôle rendu) et
// exit(1) sur toute défaillance (launch/timeout/assertion/crash).
import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const EXPECTED_TITLE = "Veloria License Manager";
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-mgr-"));
const exe =
  process.platform === "win32"
    ? path.join(root, "node_modules", "electron", "dist", "electron.exe")
    : path.join(root, "node_modules", "electron", "dist", "electron");

function fail(msg) {
  console.error(`MANAGER_SMOKE ÉCHEC: ${msg}`);
  process.exit(1);
}

let app = null;
try {
  app = await electron.launch({
    executablePath: exe,
    args: [
      path.join("dist-license-manager", "license-manager", "main", "main.js"),
      `--user-data-dir=${userData}`,
    ],
    cwd: root,
    timeout: 60000,
  });
  const page = await app.firstWindow({ timeout: 60000 });
  // Rendu EFFECTIF attendu : le titre seul survivrait à un renderer vide.
  await page.waitForFunction(
    (expected) => document.title === expected && document.body.innerText.trim().length > 0,
    EXPECTED_TITLE,
    { timeout: 30000 },
  );
  const title = await page.title().catch(() => "");
  if (title !== EXPECTED_TITLE) fail(`titre ${JSON.stringify(title)} ≠ ${EXPECTED_TITLE}`);
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (!bodyText || bodyText.trim().length === 0) fail("renderer sans contenu (écran blanc)");
  const shot = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "veloria-mgr-shot-")),
    "manager.png",
  );
  await page.screenshot({ path: shot });
  const size = fs.statSync(shot).size;
  if (size < 1024) fail(`capture vide (${size} octets)`);
  console.log(`MANAGER_SMOKE title=${JSON.stringify(title)} shot=${shot} bytes=${size}`);
} catch (err) {
  fail(String((err && err.message) || err));
} finally {
  if (app) await app.close().catch(() => {});
}
process.exit(0);
