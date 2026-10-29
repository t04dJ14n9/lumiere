import { defineConfig } from "@playwright/test";

/**
 * Scroll measurements, not tests: `pnpm measure:scroll` runs them one at a
 * time and prints the numbers. They are not part of `pnpm test:browser`.
 */
export default defineConfig({
  testDir: ".",
  globalSetup: "../browser/setup.ts",
  testMatch: "*.perf.ts",
  timeout: 600_000,
  workers: 1,
  use: {
    headless: true,
    launchOptions: {
      // Wheel deltas land at once, as a trackpad's do, so each frame's
      // movement is the input's.
      args: ["--disable-smooth-scrolling"],
    },
  },
  reporter: "list",
});
