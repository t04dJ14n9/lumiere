import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: "list",
  timeout: 90_000,
  outputDir: "../../test-results/web-artifacts",
  use: {
    browserName: "chromium",
    viewport: { width: 1400, height: 900 },
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
});
