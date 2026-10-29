import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 8990);

/**
 * Specs that time animation, scrolling or zoom. They run one at a time,
 * after the rest, so nothing else on the machine makes them lose a race
 * (zoom-smoothness did once with six workers beside it).
 */
const TIMING = [
  "page-bitmaps",
  "page-turn-keeping-place",
  "smooth-motion",
  "trackpad-scrolling",
  "wheel-lifecycle",
  "zoom-anchor",
  "zoom-smoothness",
].map((name) => `**/${name}.spec.ts`);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Half the cores: 6 on a 12-core Mac, 2 on a CI runner. While native apps
  // share the Mac for desktop acceptance, run everything one at a time with
  // `--workers=1`.
  workers: "50%",
  projects: [
    { name: "parallel", testIgnore: TIMING },
    {
      name: "timing",
      testMatch: TIMING,
      workers: 1,
      // A busy machine can still cost one of them a race: one retry
      // locally (reported as flaky), two on CI as for every spec.
      retries: process.env.CI ? 2 : 1,
      dependencies: ["parallel"],
    },
  ],
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
