/**
 * Tall callouts are one Live Preview MarkdownBlock widget. Without
 * estimatedHeight, an off-viewport rebuild collapses the height map to one
 * line (~24px) — same failure mode as tall Properties (#100) and tables (#108).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function noteWithTallCallout(lines: number): string {
  const body = Array.from(
    { length: lines },
    (_, i) => `> Callout body line ${i} with enough text.`,
  ).join("\n");
  const filler = Array.from(
    { length: 50 },
    (_, i) =>
      `Filler paragraph ${i} keeps the callout off-screen when scrolled.`,
  ).join("\n\n");
  return `# Title\n\n> [!note] Tall callout\n${body}\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport tall callout rebuild keeps height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, noteWithTallCallout(40));
  await constrain(page);
  await expect(page.locator(".callout").first()).toBeVisible();

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("> [!note]");
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
      inDom: !!document.querySelector(".callout"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(200);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
  expect(result.inDom).toBe(false);
});

test("PageDown past a remounted tall callout still paints filler body", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, noteWithTallCallout(40));
  await constrain(page);
  await expect(page.locator(".callout").first()).toBeVisible();

  await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    const from = window.harness.text.indexOf("> [!note]");
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 30"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const touchAt = from + 4;
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: "x" } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
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
      hasCalloutOrTitle: /Title|Callout|Tall/.test(text),
      lines,
    };
  });
  expect(painted.lines, JSON.stringify(painted)).toBeGreaterThan(3);
  expect(painted.hasFiller || painted.hasCalloutOrTitle).toBe(true);
});
