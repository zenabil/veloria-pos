import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "dist-license-manager/**",
      "dist-license-manager-renderer/**",
      "release/**",
      "coverage/**",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.mjs",
            "vite.license-manager.config.ts",
            "scripts/database/integrity.js",
            "scripts/database/verify-migrations.mjs",
            "scripts/licensing/secret-scan.mjs",
            "scripts/licensing/sign-integrity.mjs",
            "scripts/licensing/sign-manager-integrity.mjs",
            "scripts/licensing/keygen.mjs",
            "scripts/licensing/import-local-license.cjs",
            "scripts/licensing/issue-local-license.cjs",
            "scripts/quality/verify-perf.mjs",
            "scripts/release/checksums.js",
            "scripts/release/smoke.js",
            "scripts/release/stamp-electron-pkg.js",
          ],
          // 12+ scripts JS hors tsconfig : le service plafonne à 8 par
          // défaut — rehaussé explicitement (lint plus lent, jamais faux).
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
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
    // License Manager: couvert par `typecheck:manager` (tsconfig.manager.json,
    // CommonJS + renderer). Le projectService racine (bundler/ESNext) ne le
    // résout pas : pas de règles type-aware ici, jamais de code non typé
    // pour autant — `npm run typecheck:manager` est la garde.
    files: ["license-manager/**/*.ts", "license-manager/**/*.tsx"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Vendor/outillage JS pur (sans types) : helpers crypto/IO des scripts de
    // signature et scan — couverts par exécution (smoke/verify), pas par types.
    files: [
      "scripts/licensing/sign-integrity.mjs",
      "scripts/licensing/sign-manager-integrity.mjs",
      "scripts/licensing/secret-scan.mjs",
    ],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    // Outils opérateur CommonJS (E2E/activation locale) : require/module sont
    // l'idiome natif ici — règles TS inadaptées désactivées localement,
    // comportement inchangé, couverts par exécution.
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
    languageOptions: {
      globals: {
        require: "readonly",
        module: "writable",
        exports: "writable",
      },
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
