/**
 * Wrapping callout bodies on a narrow pane paint far taller than line×24.
 * Without a measured cache, an off-viewport rebuild collapses the height map
 * (same remount class as note embeds / HTML CSS heights).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(): string {
  const body = Array.from(
    { length: 30 },
    (_, i) =>
      `> Callout body line ${i} with a very long run of words that should wrap on a narrow pane and inflate the painted height beyond line times twenty four.`,
  ).join("\n");
  const filler = Array.from(
    { length: 50 },
    (_, i) => `Filler paragraph ${i} scrolls the callout away.`,
  ).join("\n\n");
  return `# Title\n\n> [!note] Tall wrapping callout\n${body}\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport wrapping callout rebuild keeps painted height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 760 });
  await open(page, note());
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

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(800);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});

test("off-viewport nested wrapping callout rebuild stays near painted height", async ({
  page,
}) => {
  const outer = Array.from(
    { length: 12 },
    (_, i) =>
      `> Outer line ${i} with a long run of words that wraps on a narrow pane and grows the box.`,
  ).join("\n");
  const inner = Array.from(
    { length: 8 },
    (_, i) =>
      `> > Inner line ${i} also wraps with enough words to inflate nested chrome.`,
  ).join("\n");
  const filler = Array.from(
    { length: 45 },
    (_, i) => `Filler paragraph ${i} scrolls away.`,
  ).join("\n\n");
  await page.setViewportSize({ width: 480, height: 760 });
  await open(
    page,
    `# Title\n\n> [!note] Outer\n${outer}\n> > [!warning] Inner\n${inner}\n\n${filler}\n`,
  );
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
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 28"));
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

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(400);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});
