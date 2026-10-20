/**
 * Trusted HTML iframes with an explicit height paint tall. Off-viewport
 * rebuilds must keep that reserve in the height map (same remount class as
 * HTML <img height> / CSS height blocks).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(): string {
  const filler = Array.from(
    { length: 40 },
    (_, i) =>
      `Filler paragraph ${i} keeps the iframe off-screen when scrolled.`,
  ).join("\n\n");
  return `# Title\n\n<iframe src="https://example.com" height="720" width="400"></iframe>\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport HTML iframe rebuild keeps painted height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(), "obsidian", { trusted: true });
  await constrain(page);
  await expect(page.locator("iframe").first()).toBeVisible({ timeout: 10000 });

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("<iframe");
    const measured = view.lineBlockAt(from).height;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 25"));
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
      afterRebuild: view.lineBlockAt(from).height,
      inDom: !!document.querySelector("iframe"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(400);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});

test("off-viewport iframe height percent attr keeps near painted height", async ({
  page,
}) => {
  const filler = Array.from(
    { length: 40 },
    (_, i) => `Filler paragraph ${i} scrolls away.`,
  ).join("\n\n");
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(
    page,
    `# Title\n\n<iframe src="https://example.com" height="100%" width="400"></iframe>\n\n${filler}\n`,
    "obsidian",
    { trusted: true },
  );
  await constrain(page);
  await expect(page.locator(".hybrid-HTMLBlock").first()).toBeVisible({
    timeout: 10000,
  });

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("<iframe");
    const measured = view.lineBlockAt(from).height;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 25"));
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
      afterRebuild: view.lineBlockAt(from).height,
    };
  });

  // Bare browser iframe may be short; the reserve must still beat line×24 and
  // treat 100% as viewport-relative (~640), not as 100 CSS pixels.
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(400);
});
