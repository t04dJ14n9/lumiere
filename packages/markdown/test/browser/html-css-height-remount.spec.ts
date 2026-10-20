/**
 * HTMLBlock widgets with CSS `height: Nvh` (or em/%) paint tall, but
 * attribute/`px`-only estimatedHeight (#121) under-reserves. Off-viewport
 * rebuilds then collapse to line×24 (~36) — same remount class as tall
 * Mermaid / note embeds.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(): string {
  const filler = Array.from(
    { length: 40 },
    (_, i) =>
      `Filler paragraph ${i} keeps the HTML block off-screen when scrolled.`,
  ).join("\n\n");
  return `# Title\n\n<div style="height: 80vh; background: #444">tall vh</div>\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport HTML vh-height rebuild keeps painted height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(), "obsidian", { trusted: true });
  await constrain(page);
  await expect(
    page.locator(".hybrid-HTMLBlock, .markdown-rendered div").first(),
  ).toBeVisible({ timeout: 10000 });

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("<div");
    const measured = view.lineBlockAt(from).height;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 25"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const touchAt = from + 2;
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: "x" } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      afterRebuild: view.lineBlockAt(from).height,
      inDom: !!document.querySelector(".hybrid-HTMLBlock"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(200);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});
