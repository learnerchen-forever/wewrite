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

      // Agent workspace data (project memory, lint reports). Not part of the
      // shipped plugin and not covered by any tsconfig, so type-aware linting
      // would report a parser error instead of findings.
      ".workbuddy/",

      // The icon redesign workspace: the generator scripts, the per-icon
      // rationale and the old/new comparison page that produced the 2.0.21
      // icon set. Kept as the written spec for the icons in
      // `src/resources/icons/`, but not shipped and not covered by any
      // tsconfig — the same reasoning as `tools/` below.
      "icon-redesign/",

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
    // `WeWrite` is this plugin's own name. The sentence-case rule ships with a
    // fixed brand list that cannot know it, so without this it insists on
    // "Wewrite sync" and would have us misspell our own product. `brands` is
    // the rule's documented extension point for exactly this case; severity is
    // left at the recommended `warn` and no other rule is touched.
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { brands: ["WeWrite"] }],
    },
  },

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
