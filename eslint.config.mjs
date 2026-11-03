import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// Money rule 2: only lib/orchestrator (and the sandbox smoke script) may import the money-moving
// PayPal client or its implementations. Type-only imports of paypal/types stay allowed everywhere.
const moneyImportPatterns = [
  {
    group: ["**/paypal/client", "**/paypal/sandbox", "**/paypal/mock"],
    message: "Only src/lib/orchestrator/** may move money. Propose a payment through the policy gate instead.",
  },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: moneyImportPatterns }],
    },
  },
  {
    // The PayPal module wires its own implementations; the orchestrator and smoke script are the sanctioned callers.
    files: ["src/lib/paypal/**", "src/lib/orchestrator/**", "scripts/paypal-smoke.ts", "tests/**"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
