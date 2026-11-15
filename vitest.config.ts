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
      // I-01 (W4, audit 2026-10-19) : les fichiers de TYPES purs ne
      // contiennent aucune instruction exécutable ⇒ 0 % de couverture par
      // construction, et le seuil par fichier les faisait échouer (faux
      // positif). Ils sont exclus du calcul (pas une baisse de seuil : les
      // seuils restent 80/75/88/80 par fichier).
      exclude: ["src/domain/**/types.ts", "src/domain/**/*.types.ts"],
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
    // I-05 (W4) : 15 s suffisaient sans instrumentation, mais la porte
    // `test:coverage` instrumente TOUT le code (v8) ⇒ les tests
    // d'intégration lourds (client-loop, repair-hardening) dépassent 15 s et
    // échouaient en faux négatif. 60 s : la porte coverage est déterministe.
    // 180 s : sur un runner GitHub à 2 vCPU, le rejeu des 66 migrations SQL
    // par fichier d'intégration dépasse 60 s (mesuré : « Hook timed out in
    // 60000ms » sur `packaging-slice`, `fifo-layers`, `atomic-slices`).
    testTimeout: 180000,
    // I-05 (W4) : `hookTimeout` par défaut (10 s) était trop court : chaque
    // `beforeEach` de tests/database|integration rejoue TOUTES les migrations
    // (66 fichiers SQL) ⇒ 12 « Hook timed out » quand la suite tournait en
    // parallèle d'autres outils lourds. 180 s : la porte devient déterministe
    // même sur un runner CI à 2 vCPU (où ce rejeu dépasse 60 s).
    hookTimeout: 180000,
  },
});
