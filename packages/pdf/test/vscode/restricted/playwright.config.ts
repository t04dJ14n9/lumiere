import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

/** A separate throwaway launch with workspace trust genuinely enabled. */
export default defineConfig({
  ...base,
  testDir: ".",
  testIgnore: [],
  metadata: { restrictedMode: true },
  globalSetup: "../global-setup.ts",
  globalTeardown: "../global-teardown.ts",
});
