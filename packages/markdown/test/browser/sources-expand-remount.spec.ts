/**
 * Expand-all grows the Sources sheet. If remount/estimatedHeight still assume
 * the first-8 disclosure, scrolling the sheet off-screen then rebuilding the
 * decoration collapses the height map and jumps every coordinate below it.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(sourceCount: number): string {
  const entries = Array.from(
    { length: sourceCount },
    (_, index) =>
      `  - title: Source ${index}\n    resource: https://example.com/${index}`,
  ).join("\n");
  const body = Array.from(
    { length: 40 },
    (_, index) => `Body line ${index} after the sheet.`,
  ).join("\n\n");
  return `---\nsources:\n${entries}\n---\n# Heading\n\n${body}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("expand-all then off-viewport rebuild keeps the expanded sheet height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(20));
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await expect(page.locator("[data-source-more]")).toBeVisible();

  await page.locator("[data-source-more]").click();
  await expect(page.locator("[data-source-more]")).toHaveCount(0);
  await expect(page.locator("article.source-row")).toHaveCount(20);

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const afterExpand = view.lineBlockAt(0).height;
    window.harness.reveal(window.harness.text.indexOf("Body line 30"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    view.dispatch({ changes: { from: 4, to: 4, insert: " " } });
    view.dispatch({ changes: { from: 4, to: 5, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      afterExpand,
      afterRebuild: view.lineBlockAt(0).height,
      sheetInDom: !!document.querySelector(".hybrid-properties"),
    };
  });

  expect(result.afterExpand, JSON.stringify(result)).toBeGreaterThan(900);
  // Falling back to the first-8 estimate after expand drops hundreds of px.
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.afterExpand * 0.85,
  );
  expect(result.sheetInDom).toBe(false);

  // Scroll the sheet back: remount must still show every source row.
  await page.evaluate(() => window.harness.reveal(0));
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await expect(page.locator("article.source-row")).toHaveCount(20);
  await expect(page.locator("[data-source-more]")).toHaveCount(0);
});
