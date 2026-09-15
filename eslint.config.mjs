import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "dist-electron/**", "release/**", "coverage/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.mjs",
            "scripts/database/verify-migrations.mjs",
            "scripts/quality/verify-perf.mjs",
            "scripts/release/smoke.js",
            "scripts/release/stamp-electron-pkg.js",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      // @ts-expect-error - plugin type interop
      "react-hooks": reactHooks,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // `onClick={() => void save()}` is the intended promise-discard idiom.
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      // Money/quantity formatting interpolates integers everywhere.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // Plain JS scripts: no type-aware rules (no tsconfig project for these).
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["electron/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["src/**/*.tsx", "src/**/*.ts"],
    rules: {
      // Domain must stay framework-free (enforced by review + this guardrail hint).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["electron"],
              message: "Domain/Application must not import Electron directly.",
            },
          ],
        },
      ],
    },
  },
);
