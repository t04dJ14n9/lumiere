/**
 * HTMLBlock widgets with tall <img height> (or iframe) under-reserve with
 * plain MarkdownBlock line×24. Off-viewport rebuilds then collapse the height
 * map the same way short Mermaid / display math did.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAALUlEQVR4nO3NMQkAAAwDsPo3vSkolED+5JKKzioWi8VisVgsFovFYrFYLB6NH6r1OhvW1o1iAAAAAElFTkSuQmCC";

function note(): string {
  const filler = Array.from(
    { length: 40 },
    (_, i) =>
      `Filler paragraph ${i} keeps the HTML image off-screen when scrolled.`,
  ).join("\n\n");
  return `# Title\n\n<img src="${PNG}" height="800" width="200" alt="tall">\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport HTML img rebuild keeps painted height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(), "obsidian", { trusted: true });
  await constrain(page);
  await expect(
    page.locator(".hybrid-HTMLBlock img, .cm-content img").first(),
  ).toBeVisible({
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
    const from = window.harness.text.indexOf("<img");
    const measured = view.lineBlockAt(from).height;
    const imgH = document
      .querySelector(".cm-content img")
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
      inDom: !!document.querySelector(".cm-content img"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(200);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});
