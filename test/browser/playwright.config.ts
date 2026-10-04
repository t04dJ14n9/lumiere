import { defineConfig } from '@playwright/test';

const port = 8990;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1000, height: 1200 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node test/browser/server.mjs',
    cwd: '../..',
    port,
    reuseExistingServer: !process.env.CI,
  },
});
