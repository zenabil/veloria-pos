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
            "scripts/database/probe-sqlite-version.cjs",
            "scripts/database/probe-writable.cjs",
            "scripts/database/relocate-local.cjs",
            "scripts/licensing/secret-scan.mjs",
            "scripts/licensing/sign-integrity.mjs",
            "scripts/licensing/sign-manager-integrity.mjs",
            "scripts/licensing/keygen.mjs",
            "scripts/licensing/manager-smoke.mjs",
            "scripts/licensing/import-local-license.cjs",
            "scripts/licensing/issue-local-license.cjs",
            "scripts/licensing/test-only-allow-expired.cjs",
            "scripts/quality/verify-perf.mjs",
            "scripts/release/checksums.js",
            "scripts/release/smoke.js",
            "scripts/release/stamp-electron-pkg.js",
            // Outils E2E/APK (hors tsconfig racine, toolchain Expo/Deno séparée).
            "scripts/demo-client-sync-server.mjs",
            "scripts/e2e-mirror-relay.mjs",
            "scripts/e2e-mobile-shots.mjs",
            "mobile/index.js",
            "cloud/supabase/functions/client-sync/index.ts",
          ],
          // 24+ scripts JS hors tsconfig : le service plafonne à 8 par
          // défaut — rehaussé explicitement (lint plus lent, jamais faux).
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 32,
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
    // Return types inapplicables au JS nu (annotation syntaxique impossible
    // sans types) : bloc séparé pour ne PAS écraser les règles
    // disableTypeChecked ci-dessus (spread + clé rules = remplacement, pas
    // fusion). La garde ici est l'exécution des scripts (verify/smoke).
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    files: ["electron/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Mobile APK (Expo, toolchain séparée) : même statut que license-manager —
    // pas de règles type-aware ici ; la garde est vitest (logique pure).
    files: ["mobile/**/*.ts", "mobile/**/*.tsx"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Edge Function Deno (runtime séparé, import `https://esm.sh/*` non
    // résoluble par le projectService racine) : pas de règles type-aware —
    // la garde est le miroir local `scripts/e2e-mirror-relay.mjs` (contrat
    // identique) + tests/integration/client-loop.test.ts.
    files: ["cloud/**/*.ts"],
    ...tseslint.configs.disableTypeChecked,
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
    // Outils opérateur CommonJS (E2E/activation locale) : require/module sont
    // l'idiome natif ici — règles TS inadaptées désactivées localement,
    // comportement inchangé, couverts par exécution.
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
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
    // Smoke Playwright : `document` n'apparaît que dans les callbacks EXÉCUTÉS
    // dans la page (page.waitForFunction / page.evaluate) — sémantique
    // navigateur locale au fichier, pas un global Node.
    files: ["scripts/licensing/manager-smoke.mjs"],
    languageOptions: {
      globals: { document: "readonly" },
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
