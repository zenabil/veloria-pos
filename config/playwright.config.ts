// Veloria PoS — Playwright E2E (application réelle, base de test isolée).
// Lancement : `npm run test:e2e` (après `npm run build` + `npm run build:electron`).
// Chaque test démarre l'app avec PROGRAMDATA + userData temporaires : aucune
// donnée de production n'est touchée, base recréée à chaque fois.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  // Relatif au fichier de configuration (config/), pas au cwd Playwright.
  testDir: "../tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Une seule instance à la fois (verrou single-instance de l'app).
  workers: 1,
  // `test.only` accidentellement commité exécuterait une seule suite en CI :
  // refus explicite (loi de Hyrum).
  forbidOnly: true,
  reporter: [["list"]],
  use: { actionTimeout: 15_000 },
});
