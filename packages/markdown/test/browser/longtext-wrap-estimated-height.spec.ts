/**
 * Longtext properties use pre-wrap. Without wrap-aware estimatedHeight, a
 * single YAML line that paints many rows collapses the height map on an
 * off-viewport rebuild — same failure mode as wrapping tags (#104).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(): string {
  const summary = Array.from({ length: 80 }, () => "wrapping").join(" ");
  const body = Array.from(
    { length: 40 },
    (_, index) => `Body paragraph ${index}.`,
  ).join("\n\n");
  return `---\nsummary: ${summary}\n---\n# H1\n\n${body}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; width: 480px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("wrapping longtext keeps estimatedHeight near the measured sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 520, height: 760 });
  await open(page, note());
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await expect(page.locator(".metadata-input-longtext").first()).toBeVisible();

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const measured = view.lineBlockAt(0).height;
    const sheet = document.querySelector(".hybrid-properties") as HTMLElement;
    const drawn = sheet.getBoundingClientRect().height;
    window.harness.reveal(window.harness.text.indexOf("Body paragraph 20"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    view.dispatch({ changes: { from: 4, to: 4, insert: " " } });
    view.dispatch({ changes: { from: 4, to: 5, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      drawn,
      afterRebuild: view.lineBlockAt(0).height,
    };
  });
  expect(result.drawn, JSON.stringify(result)).toBeGreaterThan(120);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.drawn * 0.7,
  );
});
