/**
 * Wrapping callouts that start below the fold never get a ResizeObserver
 * sample. First-paint estimatedHeight must count soft-wrap visual rows, not
 * bare source lines — otherwise PageDown / off-screen remounts under-reserve
 * (~756 vs ~2237 painted on a narrow pane).
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

test("first-paint wrapping callout below the fold reserves near painted height", async ({
  page,
}) => {
  const above = Array.from(
    { length: 40 },
    (_, i) => `Above paragraph ${i} keeps the callout below the fold.`,
  ).join("\n\n");
  const callout = `> [!note] Tall wrapping callout\n${wrappingBody(30)}`;
  await page.setViewportSize({ width: 480, height: 760 });
  await open(page, `# Title\n\n${above}\n\n${callout}\n`);
  await constrain(page);

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("> [!note]");
    const reserved = view.lineBlockAt(from).height;
    const inDomBefore = !!document.querySelector(".callout");

    // Scroll the scroller so the callout mounts and we can compare paint.
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
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (document.querySelector(".callout")) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const painted =
      document.querySelector(".callout")?.getBoundingClientRect().height ?? 0;
    return { reserved, painted, inDomBefore };
  });

  expect(result.inDomBefore, JSON.stringify(result)).toBe(false);
  expect(result.painted, JSON.stringify(result)).toBeGreaterThan(800);
  expect(result.reserved, JSON.stringify(result)).toBeGreaterThan(
    result.painted * 0.7,
  );
});

test("off-screen wrapping callout remount keeps wrap-aware reserve", async ({
  page,
}) => {
  const above = Array.from(
    { length: 40 },
    (_, i) => `Above paragraph ${i} keeps the callout below the fold.`,
  ).join("\n\n");
  const callout = `> [!note] Tall wrapping callout\n${wrappingBody(30)}`;
  await page.setViewportSize({ width: 480, height: 760 });
  await open(page, `# Title\n\n${above}\n\n${callout}\n`);
  await constrain(page);

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    const from = window.harness.text.indexOf("> [!note]");
    const before = view.lineBlockAt(from).height;
    const touchAt = from + 4;
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: "x" } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      before,
      after: view.lineBlockAt(from).height,
      inDom: !!document.querySelector(".callout"),
    };
  });

  expect(result.inDom, JSON.stringify(result)).toBe(false);
  expect(result.after, JSON.stringify(result)).toBeGreaterThan(1500);
  expect(result.after, JSON.stringify(result)).toBeGreaterThan(
    result.before * 0.85,
  );
});
