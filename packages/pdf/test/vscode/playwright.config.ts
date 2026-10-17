import { defineConfig } from '@playwright/test';

/** Tests drive one shared VS Code window, so they run one at a time. */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  testIgnore: '**/restricted/**',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
