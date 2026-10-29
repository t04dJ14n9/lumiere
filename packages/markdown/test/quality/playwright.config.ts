import { defineConfig } from "@playwright/test";

/**
 * Scroll smoothness and opening speed in Chromium, with the real webview and
 * the browser harness's host (`pnpm test:quality`). One worker: timings must
 * not compete with each other.
 */
export default defineConfig({
  testDir: ".",
  globalSetup: "../browser/setup.ts",
  testMatch: "*.quality.ts",
  timeout: 180_000,
  workers: 1,
  // A timing check that fails once and passes again is reported as flaky;
  // two failures in a row fail the run.
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      // Wheel deltas land at once, as a trackpad's do.
      args: ["--disable-smooth-scrolling"],
    },
  },
  reporter: "list",
});
