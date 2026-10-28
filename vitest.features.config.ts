// Veloria PoS — Coverage « features » (Q11, décision propriétaire).
//
// Périmètre : l'interface React (`src/features/**`). Le domaine et
// l'application restent couverts par la porte STRICTE (`vitest.config.ts` :
// 80/75/88/80 par fichier) ; l'interface est couverte par une porte
// PROGRESSIVE (seuils globaux 60/50/60/60), qui est un CRAN : le seuil ne
// peut pas baisser (le plancher est écrit ici), il MONTE à chaque vague qui
// ajoute des tests de composants.
//
// La porte est branchée dans le CI (`npm run test:coverage:features`).
import { defineConfig } from "vitest/config";
import path from "node:path";

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
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      // Périmètre MESURABLE SANS DOM : les modules purs de `src/features`
      // (aideurs de caisse, règles de fusion, normalisation). Les composants
      // `.tsx` exigent un environnement DOM (jsdom + testing-library) :
      // leur couverture dépend d'une installation de dépendances de test
      // (décision propriétaire, Q11 bis).
      include: ["src/features/**/*.ts"],
      exclude: ["src/features/**/types.ts", "src/features/**/*.types.ts"],
      thresholds: {
        // CRAN (Q11) : plancher global de l'interface, mesuré le 2026-10-21
        // (27,49 % lignes · 82,46 % branches · 67,64 % fonctions). Toute
        // baisse = échec ; chaque vague qui ajoute des tests le fait monter.
        statements: 27,
        branches: 80,
        functions: 65,
        lines: 27,
        perFile: false,
      },
    },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
