import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` throws outside a React Server Component bundle; tests are server-side by definition.
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "evals/**/*.test.ts"],
    // Tests never make live calls: no API key, in-memory DB unless a test opens its own.
    env: { PAYPAL_MODE: "mock", AI_MODE: "fixture", ANTHROPIC_API_KEY: "", DATABASE_PATH: ":memory:" },
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      reporter: ["text-summary", "text", "html"],
      thresholds: {
        "src/lib/policy/**": { lines: 100, branches: 100 },
        "src/lib/events/**": { lines: 95 },
        "src/lib/orchestrator/**": { lines: 90 },
      },
    },
  },
});
