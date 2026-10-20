/**
 * Fixed chars/40 under-reserves wrapping callouts on very narrow panes
 * (viewport ≤320 → content ~250px; reserved/painted < 0.7). Track live
 * `.cm-content` width so first-paint estimate scales with the editor.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

function wrappingBody(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) =>
      `> Callout body line ${i} with a very long run of words that should wrap on a narrow pane and inflate the painted height beyond line times twenty four.`,
  ).join("\n");
}

async function measure(page: Page, width: number) {
  const above = Array.from(
    { length: 40 },
    (_, i) => `Above paragraph ${i} keeps the callout below the fold.`,
  ).join("\n\n");
  const callout = `> [!note] Tall wrapping callout\n${wrappingBody(30)}`;
  await page.setViewportSize({ width, height: 760 });
  await open(page, `# Title\n\n${above}\n\n${callout}\n`);
  await constrain(page);
  return page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("> [!note]");
    const reserved = view.lineBlockAt(from).height;
    const contentW = view.contentDOM.clientWidth;
    const coords = view.coordsAtPos(from);
    if (coords) {
      view.scrollDOM.scrollTop = Math.max(
        0,
        coords.top -
          view.scrollDOM.getBoundingClientRect().top +
          view.scrollDOM.scrollTop -
          40,
      );
    } else {
      view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
    }
    view.requestMeasure();
    for (let i = 0; i < 25; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (document.querySelector(".callout")) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    const painted =
      document.querySelector(".callout")?.getBoundingClientRect().height ?? 0;
    return {
      reserved,
      painted,
      contentW,
      ratio: painted ? reserved / painted : 0,
    };
  });
}

test("narrow pane first-paint wrap estimate clears 0.7× painted height", async ({
  page,
}) => {
  const result = await measure(page, 280);
  expect(result.painted, JSON.stringify(result)).toBeGreaterThan(2000);
  expect(result.reserved, JSON.stringify(result)).toBeGreaterThan(
    result.painted * 0.7,
  );
});

test("mid pane first-paint wrap estimate still clears 0.7× (regression vs #133)", async ({
  page,
}) => {
  const result = await measure(page, 480);
  expect(result.painted, JSON.stringify(result)).toBeGreaterThan(800);
  expect(result.reserved, JSON.stringify(result)).toBeGreaterThan(
    result.painted * 0.7,
  );
});
