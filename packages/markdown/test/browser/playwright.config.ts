import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  globalSetup: "./setup.ts",
  testMatch: "*.spec.ts",
  use: { headless: true },
  workers: 2,
  reporter: "list",
});
