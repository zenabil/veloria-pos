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
  // GATE-05 : le relais miroir local est démarré ICI, pas à la main.
  // Avant ce correctif, `npm run test:e2e` était ROUGE sur une machine
  // propre : le test `full-loop-client` exige un relais sur 127.0.0.1:8100 et
  // échouait (au lieu de se sauter) si personne ne l'avait lancé. Le CI le
  // lançait à la main — la commande locale, elle, ne l'était pas.
  // `webServer` rend la commande auto-suffisante : un opérateur n'a plus à
  // connaître le prérequis, et le test de boucle locale s'exerce vraiment.
  // (Le test CLOUD reste conditionné à des identifiants : il se saute.)
  webServer: {
    // Chemin relatif au FICHIER DE CONFIGURATION (config/), pas au cwd :
    // `../scripts/...` et non `scripts/...` (résolu par Playwright depuis
    // config/, d'où le MODULE_NOT_FOUND sinon).
    command: "node ../scripts/e2e-mirror-relay.mjs",
    url: "http://127.0.0.1:8100",
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
