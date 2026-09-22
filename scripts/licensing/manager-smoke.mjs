// Smoke visuel du License Manager (outil vendor) : boot réel + capture.
import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-mgr-"));
const exe =
  process.platform === "win32"
    ? path.join(root, "node_modules", "electron", "dist", "electron.exe")
    : path.join(root, "node_modules", "electron", "dist", "electron");

const app = await electron.launch({
  executablePath: exe,
  args: [
    path.join("dist-license-manager", "license-manager", "main", "main.js"),
    `--user-data-dir=${userData}`,
  ],
  cwd: root,
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
await page.waitForTimeout(3000);
const shot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "veloria-mgr-shot-")), "manager.png");
await page.screenshot({ path: shot });
const title = await page.title().catch(() => "");
console.log(`MANAGER_SMOKE title=${JSON.stringify(title)} shot=${shot}`);
await app.close();
process.exit(0);
