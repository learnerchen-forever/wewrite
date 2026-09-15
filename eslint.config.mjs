// ESLint configuration for the Obsidian community plugin review process.
//
// This enables the recommended ruleset from `eslint-plugin-obsidianmd`, the
// official linter the Obsidian team uses to check community plugin
// submissions. The ruleset is intentionally left UNMODIFIED so that the
// reported violations reflect the real review criteria.
//
//   npm run lint          # report violations
//   npm run lint:fix      # apply autofixes
//
// Note: the recommended set is type-aware (it layers typescript-eslint's
// `recommended-type-checked` rules on top), so every linted TypeScript file
// must belong to a TypeScript project.

import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      // Build output (mirrors .gitignore).
      "main.js",
      "main-*.js",
      "mathjax-chunk.js",
      "chunks/",
      "dist/",
      "**/*.map",
      "coverage/",
      "test-results/",
      "playwright-report/",

      // Not part of the shipped plugin, and not covered by `tsconfig.json`
      // (which only includes `src/**/*.ts`). Type-aware linting requires
      // files to belong to a TypeScript project, so linting these would
      // produce parser errors rather than useful findings.
      //
      // To lint the test suite later, give `tests/` its own `tsconfig.json`
      // (extending the existing `tsconfig.test.json`) and drop it from this
      // list. Expect some false positives there: `tests/__mocks__/obsidian.ts`
      // deliberately re-implements the Obsidian API.
      "tests/",
      "tools/",
      "jest.config.js",
      "esbuild.config.mjs",
    ],
  },

  ...obsidianmd.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // This config file is not in `tsconfig.json`, so it needs the
          // default project to be type-aware lintable.
          allowDefaultProject: ["eslint.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
