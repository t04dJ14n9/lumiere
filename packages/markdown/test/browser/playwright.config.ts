import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  globalSetup: "./setup.ts",
  testMatch: "*.spec.ts",
  use: { headless: true },
  // Half the cores: 6 on a 12-core Mac (1.6 min instead of 3.6 with 2),
  // 2 on a CI runner. `--workers=1` runs one at a time.
  workers: "50%",
  reporter: "list",
});
