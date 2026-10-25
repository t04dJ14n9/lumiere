import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { servePage } from "./page-server";
import type {} from "./fake-host";
export async function open(
  page: Page,
  source: string,
  preset: "minimal" | "obsidian" = "obsidian",
  {
    trusted = false,
    features = {},
    videoDetails = {},
    notes = {},
    gitBaseline,
  }: {
    gitBaseline?: string;
    trusted?: boolean;
    features?: Record<
      string,
      { enabled: boolean; config: Record<string, unknown> }
    >;
    videoDetails?: Record<string, Record<string, unknown>>;
    notes?: Record<string, string>;
  } = {},
) {
  await servePage(
    page,
    '<!doctype html><html><head><link rel="stylesheet" href="/dist/webview/editor.css"></head><body><main id="app" data-pdfium-wasm="/dist/webview/pdfium.wasm"></main><script src="/artifacts/fake-host.js"></script></body></html>',
  );
  await page.evaluate(
    async ({
      source,
      preset,
      trusted,
      features,
      videoDetails,
      notes,
      gitBaseline,
    }) => {
      window.harness = new window.BrowserHost(source);
      window.harness.trusted = trusted;
      window.harness.features = features;
      window.harness.videoDetails = videoDetails;
      window.harness.notes = notes;
      window.harness.gitBaseline = gitBaseline;
      await window.harness.open(preset);
    },
    { source, preset, trusted, features, videoDetails, notes, gitBaseline },
  );
  await expect(
    page.getByRole("textbox", { name: "Markdown content" }),
  ).toBeVisible();
}
