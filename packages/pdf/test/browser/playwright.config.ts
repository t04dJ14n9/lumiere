import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 8990);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Desktop acceptance shares the Mac with native apps; serialize timing-sensitive input.
  ...(process.env.CI ? {} : { workers: 1 }),
  // Timing-sensitive specs (animation, scrolling) can lose a race on a busy runner.
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1000, height: 1200 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node test/browser/server.mjs",
    cwd: "../..",
    port,
    reuseExistingServer: !process.env.CI,
  },
});
