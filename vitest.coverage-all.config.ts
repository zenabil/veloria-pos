// Porte de MESURE (non bloquante) : couverture de TOUTE la couche logique du
// projet — pas seulement `src/domain`. Elle répond à une question que aucune
// autre porte ne posait : quels modules exécutables ne sont testés PAR RIEN.
//
// Périmètre volontaire : les `.ts` (décisions, calcul, entrées/sorties). Les
// `.tsx` (40 fichiers) rendent dans un DOM ; leur preuve réelle est la suite
// Playwright sur Electron (`npm run test:e2e`), pas un pourcentage V8 — couvrir
// l'UI par de la ligne de test DOM factice serait une métrique de vanité.
//
// Usage : npx vitest run --config vitest.coverage-all.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@domain": path.resolve(import.meta.dirname, "src/domain"),
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
      "@features": path.resolve(import.meta.dirname, "src/features"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    allowOnly: false,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/database/**/*.test.ts",
    ],
    // Les modules `*.ts` de `mobile/` et `owner/` sont purs (aucun import de
    // `react-native` — vérifié : il n'y en a que dans les `.tsx`), donc la
    // suite node les exerce tels quels, sans shim.
    coverage: {
      provider: "v8",
      //Sans ce drapeau, `vitest run --config …` n'instrumentait RIEN (la suite
      // tournait à la vitesse normale et ne produisait aucun rapport) : le
      // bloc `coverage` d'un config ne suffit pas, il faut `enabled`.
      enabled: true,
      all: true,
      reporter: ["text-summary", "json-summary", "html"],
      // Les deux premières clés valides sont `reporter` et `reportsDirectory` :
      // un dossier dédié évite d'écraser le rapport de la porte `src/domain`.
      reportsDirectory: "coverage/all",
      include: [
        "src/domain/**/*.ts",
        "src/application/**/*.ts",
        "src/shared/**/*.ts",
        "src/features/**/*.ts",
        "electron/**/*.ts",
        "license-manager/**/*.ts",
        "mobile/src/**/*.ts",
        "owner/src/**/*.ts",
      ],
      // Fichiers sans instruction exécutable (types, déclarations, shims) :
      // 0 % par construction — exclusion de la mesure, pas un abaissement.
      exclude: [
        "**/*.d.ts",
        "**/types.ts",
        "**/*.types.ts",
        "src/vite-env.d.ts",
        "tests/**",
        "**/*.test.ts",
      ],
      // RATCHET, pas cible de vanité : planchers posés JUSTE sous la mesure
      // réelle. 2026-11-03 (1ʳᵉ mesure) : 51,84 / 50,84 / 44,94 / 53,90 sur
      // 15 283 instructions. 2026-11-03 (après audit ADR-174 + tests de
      // renfort) : 51,98 instructions / 51,45 branches / 45,23 fonctions /
      // 54,06 lignes sur 15 546 instructions (245 fichiers). Une régression de
      // la couche logique fait donc échouer `test:coverage:all`, tandis qu'un
      // progrès reste gratuit. Les relever demande une mesure nouvelle — jamais
      // un édit à la main de ces chiffres.
      thresholds: {
        statements: 51,
        branches: 51,
        functions: 45,
        lines: 54,
      },
    },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
