/**
 * Tall image embeds are one Live Preview EmbedBlock. Without estimatedHeight
 * matching `|WxH` (or a stable default), an off-viewport rebuild collapses the
 * height map to one line (~24px) — same failure mode as tall Properties (#100)
 * and tables (#108). Distinct from MarkdownBlock line-count (#109): a single
 * source line image is still hundreds of pixels tall.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

// Short PNG so markdown-it accepts the data URL; `|200x800` forces painted height.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAALUlEQVR4nO3NMQkAAAwDsPo3vSkolED+5JKKzioWi8VisVgsFovFYrFYLB6NH6r1OhvW1o1iAAAAAElFTkSuQmCC";

function note(): string {
  const filler = Array.from(
    { length: 40 },
    (_, i) => `Filler paragraph ${i} keeps the image off-screen when scrolled.`,
  ).join("\n\n");
  return `# Title\n\n![tall|200x800](${PNG})\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport tall image rebuild keeps image height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note());
  await constrain(page);
  await expect(page.locator("img.note-image").first()).toBeVisible({
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
    const from = window.harness.text.indexOf("![tall");
    const measured = view.lineBlockAt(from).height;
    const imgH = document
      .querySelector("img.note-image")
      ?.getBoundingClientRect().height;
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
      imgH,
      inDom: !!document.querySelector("img.note-image"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(200);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});
