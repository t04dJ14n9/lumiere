/**
 * Short ```query fences render a results list (CSS max-height 400px). Without
 * an estimatedHeight above line×24, an off-viewport rebuild collapses the
 * height map to one line (~24px), the same failure mode as Mermaid (#114).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const SHORT_QUERY = ["```query", "tag:#fixture", "```"].join("\n");

function note(): string {
  const filler = Array.from(
    { length: 50 },
    (_, i) => `Filler paragraph ${i} scrolls the query away.`,
  ).join("\n\n");
  return `# Title\n\n${SHORT_QUERY}\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport query rebuild keeps results-sized height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note());
  await constrain(page);
  await expect(page.locator(".embedded-search, .hybrid-query").first()).toBeVisible();

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("```query");
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
      inDom: !!document.querySelector(".embedded-search, .hybrid-query"),
    };
  });

  // Without estimatedHeight this collapses to one line (~24px).
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(200);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    Math.min(result.measured, 200) * 0.7,
  );
});
