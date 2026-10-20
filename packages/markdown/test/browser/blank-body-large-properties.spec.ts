/**
 * WorkVault-scale notes (huge Sources YAML + long body) blank the Live Preview
 * body when CodeMirror's height map treats the properties sheet as one line
 * (default WidgetType.estimatedHeight = -1). GUI evidence 2026-10-20:
 *   - Source mode has the full doc
 *   - Live Preview shows only H1; wheel reveals body
 *   - PageDown from the rendered top lands in a black pane
 * Off-viewport frontmatter rebuilds reproduce the one-line reserve.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const HEADING = "# H1 Title";
const BODY = "Body paragraph";

function largeNote(sourceCount: number, bodyParagraphs: number): string {
  const entries = Array.from(
    { length: sourceCount },
    (_, index) =>
      `  - title: Source ${index} title for the tall sheet\n    resource: https://example.com/src/${index}\n    id: id-${index}`,
  ).join("\n");
  const body = Array.from(
    { length: bodyParagraphs },
    (_, index) => `${BODY} ${index} keeps painting.`,
  ).join("\n\n");
  return `---\nsources:\n${entries}\n---\n${HEADING}\n\n${body}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport frontmatter rebuild keeps the sheet's height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, largeNote(108, 80));
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const measured = view.lineBlockAt(0).height;
    window.harness.reveal(window.harness.text.indexOf("Body paragraph 50"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    // Rebuild the off-screen properties decoration (frontmatter touch).
    view.dispatch({ changes: { from: 4, to: 4, insert: " " } });
    view.dispatch({ changes: { from: 4, to: 5, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      afterRebuild: view.lineBlockAt(0).height,
      sheetInDom: !!document.querySelector(".hybrid-properties"),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(400);
  // Without estimatedHeight this collapses to one line (~24px) and PageDown /
  // caret geometry land in empty mapped space (black pane).
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
  expect(result.sheetInDom).toBe(false);
});

test("H1 at top shows body lines without needing a wheel gesture", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, largeNote(108, 40));
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();

  // Owner view: preview top is the H1 after the properties sheet (gg / caret
  // guard), not the YAML. Put H1 at the top of the viewport like that.
  await page.evaluate(() => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    const scroller = document.querySelector(".cm-scroller") as HTMLElement;
    scroller.scrollTop = Math.max(0, view.lineBlockAt(0).height - 8);
  });
  await page.waitForTimeout(120);

  const layout = await page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller") as HTMLElement;
    const heading = [...document.querySelectorAll(".cm-line")].find((line) =>
      line.textContent?.includes("H1 Title"),
    );
    const body = [...document.querySelectorAll(".cm-line")].find((line) =>
      line.textContent?.includes("Body paragraph 0"),
    );
    const vp = scroller.getBoundingClientRect();
    const lineRects = [...document.querySelectorAll(".cm-line")].map((line) => {
      const rect = (line as HTMLElement).getBoundingClientRect();
      return {
        text: (line.textContent || "").slice(0, 40),
        top: rect.top,
        bottom: rect.bottom,
        height: (line as HTMLElement).offsetHeight,
        inView: rect.bottom > vp.top + 8 && rect.top < vp.bottom - 8,
      };
    });
    return {
      headingText: heading?.textContent ?? null,
      bodyText: body?.textContent ?? null,
      headingInView: lineRects.find((line) => line.text.includes("H1 Title"))
        ?.inView,
      visibleBodyLines: lineRects.filter(
        (line) => line.inView && line.text.includes("Body paragraph"),
      ).length,
      blankBelowHeading: (() => {
        if (!heading) {
          return true;
        }
        const headingBottom = heading.getBoundingClientRect().bottom;
        const bodyBelow = lineRects.filter(
          (line) =>
            line.top >= headingBottom - 2 &&
            line.inView &&
            line.height > 8 &&
            line.text.length > 0,
        );
        return bodyBelow.length === 0;
      })(),
      reserved: viewReserved(),
      scrollTop: scroller.scrollTop,
    };
    function viewReserved() {
      const fiber = [...window.harness.views[0]!.plugins].find(
        (plugin) => plugin.definition.name === "livePreview",
      );
      return fiber!.context!.editor.view.lineBlockAt(0).height;
    }
  });

  expect(layout.headingText, JSON.stringify(layout)).toContain("H1 Title");
  expect(layout.bodyText, JSON.stringify(layout)).toContain("Body paragraph 0");
  expect(layout.headingInView, JSON.stringify(layout)).toBe(true);
  expect(layout.visibleBodyLines, JSON.stringify(layout)).toBeGreaterThan(0);
  expect(layout.blankBelowHeading, JSON.stringify(layout)).toBe(false);
  expect(layout.reserved).toBeGreaterThan(400);
});

test("PageDown from H1 paints the next body lines, not a black pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, largeNote(108, 60));
  await constrain(page);

  // Collapse height via off-screen rebuild, then return to H1 and PageDown —
  // the path that went black on the owner's Host GUI without estimatedHeight.
  await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    window.harness.reveal(window.harness.text.indexOf("Body paragraph 40"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    view.dispatch({ changes: { from: 4, to: 4, insert: " " } });
    view.dispatch({ changes: { from: 4, to: 5, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    window.harness.reveal(window.harness.text.indexOf("# H1 Title"));
  });
  await page.waitForTimeout(120);
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(150);

  const after = await page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller") as HTMLElement;
    const vp = scroller.getBoundingClientRect();
    let covered = 0;
    for (const el of [
      ...document.querySelectorAll(".cm-line"),
      document.querySelector(".hybrid-properties"),
    ]) {
      if (!(el instanceof HTMLElement)) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      const top = Math.max(rect.top, vp.top);
      const bottom = Math.min(rect.bottom, vp.bottom);
      if (bottom > top) {
        covered += bottom - top;
      }
    }
    const bodyLines = [...document.querySelectorAll(".cm-line")].filter(
      (line) => {
        const rect = (line as HTMLElement).getBoundingClientRect();
        return (
          (line.textContent || "").includes("Body paragraph") &&
          rect.bottom > vp.top + 8 &&
          rect.top < vp.bottom - 8 &&
          (line as HTMLElement).offsetHeight > 8
        );
      },
    );
    return {
      blankRatio: 1 - Math.min(1, covered / vp.height),
      visibleBody: bodyLines.length,
      sample: bodyLines.slice(0, 3).map((line) => line.textContent),
      scrollTop: scroller.scrollTop,
      reserved: (() => {
        const fiber = [...window.harness.views[0]!.plugins].find(
          (plugin) => plugin.definition.name === "livePreview",
        );
        return fiber!.context!.editor.view.lineBlockAt(0).height;
      })(),
    };
  });

  expect(after.reserved, JSON.stringify(after)).toBeGreaterThan(400);
  expect(after.visibleBody, JSON.stringify(after)).toBeGreaterThan(2);
  expect(after.blankRatio, JSON.stringify(after)).toBeLessThan(0.35);
});
