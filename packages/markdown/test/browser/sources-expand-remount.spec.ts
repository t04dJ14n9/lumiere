/**
 * A tall properties sheet, with `sources` as plain text, must keep its
 * estimated height when a rebuild happens off-screen. The old Sources
 * expand-all path is gone; this still guards the height map (#100).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(rowCount: number): string {
  const fields = Array.from(
    { length: rowCount },
    (_, index) => `field${index}: value ${index}`,
  ).join("\n");
  const body = Array.from(
    { length: 40 },
    (_, index) => `Body line ${index} after the sheet.`,
  ).join("\n\n");
  return `---\n${fields}\nsources: plain citation\n---\n# Heading\n\n${body}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport rebuild keeps a tall sheet height when sources is plain text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(40));
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await expect(page.locator(".source-row, [data-source-more]")).toHaveCount(0);
  await expect(page.locator('[data-property-input="sources"]')).toHaveAttribute(
    "data-property-kind",
    "text",
  );

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const painted = view.lineBlockAt(0).height;
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
      painted,
      afterRebuild: view.lineBlockAt(0).height,
      sheetInDom: !!document.querySelector(".hybrid-properties"),
    };
  });

  expect(result.painted, JSON.stringify(result)).toBeGreaterThan(900);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.painted * 0.85,
  );
  expect(result.sheetInDom).toBe(false);

  await page.evaluate(() => window.harness.reveal(0));
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await expect(page.locator('[data-property-input="sources"]')).toHaveText(
    "plain citation",
  );
});
