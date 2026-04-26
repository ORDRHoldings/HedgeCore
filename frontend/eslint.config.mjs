import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  // Test files and E2E are excluded from tsconfig — skip them in ESLint too
  {
    ignores: [
      "src/__tests__/**",
      "src/tests/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "e2e/**",
      "render_deploy_temp.mjs",
    ],
  },

  // Next.js recommended + core-web-vitals (native flat config — no FlatCompat needed)
  nextPlugin.flatConfig.recommended,
  nextPlugin.flatConfig.coreWebVitals,

  // React hooks rules (traditional only — omit React Compiler rules from v7)
  {
    plugins: { "react-hooks": reactHooksPlugin },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // TypeScript rules
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // No-console rule — use @/lib/logger for server routes
  {
    rules: {
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },

  // Design system guardrails (frontend rule: 12px floor; tokens > hex literals).
  // Warn-level — existing code has prior violations; goal is to prevent new ones.
  // ADR-0017 names @/lib/design/tokens (T) as the canonical token surface.
  {
    files: ["src/**/*.tsx", "src/**/*.ts"],
    ignores: [
      "src/lib/design/**",          // tokens module itself
      "src/lib/theme/**",           // theme presets need raw hex
      "src/app/globals.css.ts",     // n/a, but defensive
      "src/components/chart/**",    // chart engine packs micro-typography
      "src/components/reports/EChartsWrapper.tsx",
      // Public marketing site — distinct design system from institutional
      // terminal. ADR-0017 governs the in-app surface only. Marketing pages
      // use @/components/marketing/theme (10–11px overlines, 52px+ heroes,
      // bespoke palette) and render outside terminal chrome.
      "src/app/page.tsx",
      "src/app/about/**",
      "src/app/contact/**",
      "src/app/security/**",
      "src/app/privacy/**",
      "src/app/terms/**",
      "src/app/solutions/**",
      "src/app/products/**",
      "src/components/marketing/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          // fontSize below 0.625rem (10px). 10–11px is acceptable for mono
          // micro-typography (column headers, overlines, status pills); below
          // 10px is unreadable on institutional displays. See ADR-0019.
          selector: "Property[key.name='fontSize'] > Literal[value=/^0\\.([0-5]\\d*|6[01]\\d*)rem$/]",
          message:
            "fontSize below 10px (0.625rem) is unreadable on institutional displays. Use 0.625rem or larger; for body text prefer 0.875rem+ via T from @/lib/design/tokens.",
        },
        {
          // fontSize: 9 or below as plain numeric literal (px). 10px is the
          // institutional micro-mono floor (matches Bloomberg/Refinitiv).
          selector: "Property[key.name='fontSize'] > Literal[value<10][raw=/^\\d+$/]",
          message:
            "fontSize below 10px is unreadable on institutional displays. Use 10 or larger; for body text prefer 14+. See ADR-0019.",
        },
        {
          // Hex literals on color-typed props inside inline styles.
          // Catches: color, background, backgroundColor, borderColor, fill, stroke.
          selector:
            "Property[key.name=/^(color|background|backgroundColor|borderColor|fill|stroke)$/] > Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message:
            "Hex literal in inline style. Use a token from @/lib/design/tokens (T.*) or a CSS variable from globals.css instead.",
        },
      ],
    },
  },

  // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/lib/logger.ts",
    ],
  },
];
