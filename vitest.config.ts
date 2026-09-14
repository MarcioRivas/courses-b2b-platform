import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    /**
     * Projects run SERIALLY, not in parallel.
     *
     * The integration project drives a real local Supabase (Postgres + GoTrue)
     * and creates a signed-in auth user per fixture. Running the unit project
     * alongside it saturated that stack: one arbitrary integration test would
     * stall for ~15 minutes and time out, and WHICH test it hit moved every run.
     * Each project passes cleanly on its own, so the contention was the whole
     * story. Serialising costs a couple of seconds — the unit project finishes
     * in under two.
     */
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup-env.ts"],
          // Each fixture creates a real auth user over HTTP (GoTrue) plus its
          // course/bank/question rows, so a single test legitimately makes
          // dozens of round trips. 30s was tight enough to fail on a loaded
          // machine while the assertions themselves were fine.
          testTimeout: 60000,
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup-dom.ts"],
        },
      },
      {
        test: {
          name: "security",
          environment: "node",
          include: ["tests/security/**/*.test.ts"],
          setupFiles: ["tests/setup-env.ts"],
          // The RLS matrix alone drives ~500 role × table × op round trips
          // through a real local Supabase/Postgres — same rationale as the
          // integration project's 60s budget.
          testTimeout: 60000,
          fileParallelism: false,
        },
      },
    ],
  },
})
