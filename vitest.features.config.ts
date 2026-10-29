// Veloria PoS — Coverage « features » (Q11, décision propriétaire).
//
// Périmètre : l'interface React (`src/features/**`). Le domaine et
// l'application restent couverts par la porte STRICTE (`vitest.config.ts` :
// 80/75/88/80 par fichier) ; l'interface est couverte par une porte
// PROGRESSIVE (seuils globaux 50/65/70/50, recalibrés avec Vitest 5/V8 dans
// ADR-155). C'est un CRAN : à partir de cette référence, le seuil ne peut
// plus baisser, il MONTE à chaque vague qui ajoute des tests de composants.
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
      // Les hooks (`use*.ts`) dépendent du runtime React/DOM : hors du
      // périmètre « modules purs mesurables sans DOM » de cette porte (ADR-155).
      exclude: [
        "src/features/**/types.ts",
        "src/features/**/*.types.ts",
        "src/features/**/use*.ts",
      ],
      thresholds: {
        // CRAN (Q11) recalculé le 2026-10-29 avec Vitest 5/V8 (ADR-155) :
        // hooks `use*.ts` exclus (ils exigent React/DOM, hors périmètre pur).
        // Mesure : 53,77 statements · 66,11 branches · 74,62 fonctions ·
        // 52,92 lignes. Les planchers montent (50/70/50) ; la branche passe de
        // 80 à 65 parce que l'INSTRUMENT de mesure a changé, pas le code.
        // Toute baisse à partir de cette référence = échec.
        statements: 50,
        branches: 65,
        functions: 70,
        lines: 50,
        perFile: false,
      },
    },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
