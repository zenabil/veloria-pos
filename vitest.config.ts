import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@domain": path.resolve(__dirname, "src/domain"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@features": path.resolve(__dirname, "src/features"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // #37 : aucun `.only` commis ne passe (échec FORT au lieu d'une
    // sélection silencieuse qui masquerait le reste de la suite).
    allowOnly: false,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/database/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/domain/**/*.ts", "src/application/**/*.ts"],
      // P3 : seuils bloquants — toute baisse sous ces planchers fait échouer
      // `test:coverage` (jamais de métrique vanité toujours verte).
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 88,
        lines: 80,
        // RADICAL: seuils par fichier (pas de moyenne vanité) — toute
        // régression d'un module critique (domain/handlers) échoue.
        perFile: true,
      },
    },
    testTimeout: 15000,
  },
});
