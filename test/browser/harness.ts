import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { servePage } from "./page-server";
import type {} from "./fake-host";
export async function open(
  page: Page,
  source: string,
  preset: "minimal" | "obsidian" = "obsidian",
) {
  await servePage(
    page,
    '<!doctype html><html><head><link rel="stylesheet" href="/dist/webview/editor.css"></head><body><main id="app"></main><script src="/artifacts/fake-host.js"></script></body></html>',
  );
  await page.evaluate(
    async ({ source, preset }) => {
      window.harness = new window.BrowserHost(source);
      await window.harness.open(preset);
    },
    { source, preset },
  );
  await expect(
    page.getByRole("textbox", { name: "Markdown content" }),
  ).toBeVisible();
}
