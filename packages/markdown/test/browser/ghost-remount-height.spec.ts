/**
 * Tall git-inline GhostBlock widgets need estimatedHeight so an off-viewport
 * rebuild does not collapse the height map to one line (~24px).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

// One deleted paragraph (word-diff aligns poorly across many blank lines and
// falls back to inline dels). A long single paragraph still paints tall.
const REMOVED = Array.from(
  { length: 80 },
  (_, i) => `UniqueDeletedSentence${i} with enough words.`,
).join(" ");

const BASE = `# Title\n\n${REMOVED}\n\nEnd marker line.\n`;
const NOW = `# Title\n\nEnd marker line.\n\n${Array.from(
  { length: 40 },
  (_, i) => `Filler paragraph ${i} scrolls the ghost away.`,
).join("\n\n")}\n`;
const on = { enabled: true, config: {} };

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport tall ghost rebuild keeps height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, NOW, "obsidian", {
    gitBaseline: BASE,
    features: { gitInline: on },
  });
  await constrain(page);
  await expect(page.locator(".mw-gi-ghost").first()).toBeVisible();

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const ghost = document.querySelector(".mw-gi-ghost");
    const from = view.posAtDOM(ghost!);
    const measured = view.lineBlockAt(from).height;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 25"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const touchAt = window.harness.text.indexOf("End marker");
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: "x" } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      afterRebuild: view.lineBlockAt(from).height,
      inDom: !!document.querySelector(".mw-gi-ghost"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(200);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});
