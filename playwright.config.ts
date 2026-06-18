import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Load .env.local into the test runner process (Next loads it for the dev
// server itself, but the Playwright runner needs the Supabase keys too, for
// the audit-log DB assertions). Minimal KEY=VALUE parser — no extra dep.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env.local absent (e.g. CI without local stack) — e2e will be skipped/fail loudly.
}

/**
 * E2E config. The dev server is started with the dev-auth shim; individual specs
 * override DEV_AUTH_ROLE per worker by hitting routes with different identities is
 * not yet supported, so role-specific suites set env before launching (see tests).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // The suite runs serially (workers: 1) against one shared production-build DB,
  // so a handful of specs are inherently timing-sensitive — same-route nav
  // completion, the Realtime postgres_changes echo, and toast/save latency under
  // load. Those are environmental, not logic bugs (each passes in isolation), so
  // a retry is the correct tool. Local gets 1 retry (was 0 → any blip hard-failed
  // a full run); CI gets 2.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Run against a production build: hydration is clean (no dev HMR), and it
  // matches how the app actually runs. Identity comes from the Cloudflare
  // header each test sets; the dev-auth shim is correctly inert under
  // NODE_ENV=production (header path is used instead).
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
