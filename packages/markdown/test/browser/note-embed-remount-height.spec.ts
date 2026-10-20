/**
 * Note embeds are one Live Preview EmbedBlock whose source is a single line
 * (`![[Other]]`) while resolved content can be many paragraphs. NOTE_DEFAULT
 * alone under-reserves; after measure, an off-viewport rebuild must keep the
 * painted height (measured cache) — same remount class as tall images (#110).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function tallOther(): string {
  const body = Array.from(
    { length: 30 },
    (_, i) => `Embedded paragraph ${i} with enough text to grow the widget.`,
  ).join("\n\n");
  return `# Other\n\n${body}\n`;
}

function hostNote(): string {
  const filler = Array.from(
    { length: 40 },
    (_, i) => `Filler paragraph ${i} keeps the embed off-screen when scrolled.`,
  ).join("\n\n");
  return `# Title\n\n![[Other]]\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport tall note-embed rebuild keeps measured height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, hostNote(), "obsidian", { notes: { Other: tallOther() } });
  await constrain(page);
  await expect(page.locator(".note-embed").first()).toBeVisible({
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
    const from = window.harness.text.indexOf("![[Other]]");
    const measured = view.lineBlockAt(from).height;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 25"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const touchAt = from + 3;
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: "x" } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      afterRebuild: view.lineBlockAt(from).height,
      inDom: !!document.querySelector(".note-embed"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(400);
  // Falling back to the pre-cache 120px floor would drop far below 0.7×.
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});
