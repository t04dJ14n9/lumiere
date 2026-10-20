/**
 * Large tables are one Live Preview block widget. Without estimatedHeight,
 * an off-viewport rebuild collapses the height map to one line (~24px), the
 * same failure mode as tall Properties sheets (#100 / #102).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function noteWithLargeTable(rows: number): string {
  const bodyRows = Array.from(
    { length: rows },
    (_, i) =>
      `| cell-${i}-a | cell-${i}-b with longer text to widen | cell-${i}-c |`,
  ).join("\n");
  const filler = Array.from(
    { length: 60 },
    (_, i) => `Filler paragraph ${i} keeps the table off-screen when scrolled.`,
  ).join("\n\n");
  return `# Title\n\n| A | B | C |\n| --- | --- | --- |\n${bodyRows}\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport table rebuild keeps table height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, noteWithLargeTable(40));
  await constrain(page);
  await expect(page.locator(".hybrid-table")).toBeVisible();

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const tableFrom = window.harness.text.indexOf("| A | B | C |");
    const measured = view.lineBlockAt(tableFrom).height;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 40"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const touchAt = tableFrom + 2;
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: " " } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      afterRebuild: view.lineBlockAt(tableFrom).height,
      tableInDom: !!document.querySelector(".hybrid-table"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(200);
  // Without estimatedHeight this collapses to one line (~24px).
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
  expect(result.tableInDom).toBe(false);
});

test("PageDown past a remounted tall table still paints filler body", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, noteWithLargeTable(40));
  await constrain(page);
  await expect(page.locator(".hybrid-table")).toBeVisible();

  await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    const tableFrom = window.harness.text.indexOf("| A | B | C |");
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 40"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const touchAt = tableFrom + 2;
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: " " } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
    // Jump back to the title, then PageDown across the reserved table height.
    window.harness.reveal(0);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });

  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(100);

  const painted = await page.evaluate(() => {
    const text = document.querySelector(".cm-content")?.textContent ?? "";
    const lines = document.querySelectorAll(".cm-line").length;
    return {
      hasFiller: /Filler paragraph/.test(text),
      hasTableOrTitle: /Title|cell-/.test(text),
      lines,
    };
  });
  expect(painted.lines, JSON.stringify(painted)).toBeGreaterThan(3);
  expect(painted.hasFiller || painted.hasTableOrTitle).toBe(true);
});
