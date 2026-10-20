/**
 * Inline `|WxH` images are MarkdownInline widgets on a source line. Without
 * estimatedHeight, an off-viewport decoration rebuild collapses that line to
 * ~24px even though EmbedBlock (#110) already covers sole-paragraph images.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(): string {
  const filler = Array.from(
    { length: 50 },
    (_, i) => `Filler paragraph ${i} scrolls the inline image away.`,
  ).join("\n\n");
  return `# Title\n\nBefore ![[missing.png|120x640]] after the image.\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport inline WxH image rebuild keeps line height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note());
  await constrain(page);
  await expect(page.locator(".md-inline-render, img, .file-embed").first()).toBeVisible({
    timeout: 5000,
  });

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("![[missing.png");
    const measured = view.lineBlockAt(from).height;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 30"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const touchAt = from + 4;
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: "x" } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      afterRebuild: view.lineBlockAt(from).height,
    };
  });

  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(200);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    Math.min(result.measured, 400) * 0.5,
  );
});
