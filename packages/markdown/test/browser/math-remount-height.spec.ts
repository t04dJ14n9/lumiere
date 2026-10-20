/**
 * Short display-math sources typeset tall MathJax SVGs. Plain MarkdownBlock
 * line×24 estimatedHeight under-reserves; math-aware floor/factor keeps the
 * height map across off-viewport remounts (same class of bug as Mermaid #114).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const TALL_MATH =
  "$$\\begin{pmatrix}a\\\\b\\\\c\\\\d\\\\e\\\\f\\\\g\\\\h\\end{pmatrix}$$";

function note(): string {
  const filler = Array.from(
    { length: 50 },
    (_, i) => `Filler paragraph ${i} scrolls the formula away.`,
  ).join("\n\n");
  return `# Title\n\n${TALL_MATH}\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport display math rebuild keeps MathJax height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note());
  await constrain(page);
  await expect(
    page.locator(".math-display, [data-math], mjx-container, .cm-line").first(),
  ).toBeVisible();
  await page.waitForTimeout(800);

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("$$");
    const measured = view.lineBlockAt(from).height;
    const mathH =
      document
        .querySelector(".math-display, mjx-container, [data-math]")
        ?.getBoundingClientRect().height ?? 0;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 30"));
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
      mathH,
      afterRebuild: view.lineBlockAt(from).height,
      inDom: !!document.querySelector(".math-display, mjx-container, [data-math]"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(60);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});
