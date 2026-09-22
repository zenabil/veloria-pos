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
      },
    },
    testTimeout: 15000,
  },
});
