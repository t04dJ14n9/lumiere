/**
 * With a constrained scroller (real webview shape) and #100's estimatedHeight,
 * PageDown/PageUp must move the caret within painted body — not into a black
 * mapped region below the tall Sources sheet.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function largeNote(sourceCount: number, bodyParagraphs: number): string {
  const entries = Array.from(
    { length: sourceCount },
    (_, index) =>
      `  - title: Source ${index} title for the tall sheet\n    resource: https://example.com/src/${index}\n    id: id-${index}`,
  ).join("\n");
  const body = Array.from(
    { length: bodyParagraphs },
    (_, index) => `Body paragraph ${index} keeps painting.`,
  ).join("\n\n");
  return `---\nsources:\n${entries}\n---\n# H1 Title\n\n${body}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

async function head(page: Page) {
  return await page.evaluate(
    async () => (await window.harness.viewState()).head,
  );
}

test("PageDown from H1 lands on a painted body paragraph, not empty map space", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const source = largeNote(40, 60);
  await open(page, source);
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("# H1 Title")),
  );
  await page.waitForTimeout(150);
  const before = await head(page);
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(200);
  const after = await head(page);
  expect(after).toBeGreaterThan(before);

  const probe = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    const headPos = view.state.selection.main.head;
    const coords = view.coordsAtPos(headPos);
    const scroller = view.scrollDOM.getBoundingClientRect();
    const line = view.lineBlockAt(headPos);
    // Sample the DOM at the caret's visual point — black pane means no text node.
    const hit =
      coords &&
      document.elementFromPoint(
        Math.min(
          Math.max(coords.left + 4, scroller.left + 4),
          scroller.right - 4,
        ),
        Math.min(
          Math.max((coords.top + coords.bottom) / 2, scroller.top + 4),
          scroller.bottom - 4,
        ),
      );
    return {
      head: headPos,
      hasCoords: !!coords,
      lineHeight: line.height,
      hitTag: hit?.nodeName ?? null,
      hitClass:
        (hit as HTMLElement | null)?.className?.toString().slice(0, 80) ?? null,
      hitText: (hit?.textContent || "").slice(0, 60),
      inScroller:
        !!hit && (hit === view.scrollDOM || view.scrollDOM.contains(hit)),
    };
  });
  console.log("PAGEDOWN_PROBE", JSON.stringify(probe));
  expect(probe.hasCoords).toBeTruthy();
  expect(probe.inScroller).toBeTruthy();
  // Caret should land on real body text or a cm line, not null / empty chrome only.
  expect(
    /Body paragraph|cm-line|H1/.test(`${probe.hitText} ${probe.hitClass}`),
  ).toBeTruthy();
});

test("PageDown then PageUp returns near the H1 without blanking", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, largeNote(36, 50));
  await constrain(page);
  const h1 = await page.evaluate(() =>
    window.harness.text.indexOf("# H1 Title"),
  );
  await page.evaluate((pos) => window.harness.reveal(pos), h1);
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(150);
  const mid = await head(page);
  await page.keyboard.press("PageUp");
  await page.waitForTimeout(150);
  const back = await head(page);
  console.log("ROUNDTRIP", { h1, mid, back });
  expect(mid).toBeGreaterThan(h1);
  expect(back).toBeLessThan(mid);
  // Should not overshoot into the frontmatter YAML.
  expect(back).toBeGreaterThanOrEqual(h1 - 5);
});
