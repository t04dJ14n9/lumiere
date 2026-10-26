/**
 * Reopening a note restores its reading position and keeps the restored line
 * pinned while images above it load, exactly once: CodeMirror's anchoring
 * and the pin must not both undo the same growth. A wheel over the
 * readable-width margin (outside `.cm-content`) right after the restore must
 * take over: the note follows the wheel and is not pulled back to the
 * restored line as the images above it keep growing.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const IMAGES = 3;

function note(): string {
  const before = Array.from(
    { length: 120 },
    (_, index) => `Opening paragraph ${index} keeps the images off screen.`,
  ).join("\n\n");
  const images = Array.from(
    { length: IMAGES },
    (_, index) =>
      `![slow ${index}](http://editor.test/slow/${index}.svg)\n\nCaption ${index}`,
  ).join("\n\n");
  const after = Array.from(
    { length: 120 },
    (_, index) => `Later paragraph ${index} leaves room to scroll.`,
  ).join("\n\n");
  return `# Restore\n\n${before}\n\n${images}\n\nRestored line\n\n${after}\n`;
}

/**
 * Tall images that arrive one by one within the 1.5 s the restored line
 * stays pinned, the one nearest the restored line first.
 */
async function serveSlowImages(page: Page): Promise<void> {
  await page.route("http://editor.test/slow/**", async (route) => {
    const index = Number(/(\d+)\.svg$/.exec(route.request().url())?.[1] ?? 0);
    const delay = 300 + 400 * (IMAGES - 1 - index);
    await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="900"><rect width="400" height="900" fill="#888"/></svg>',
    });
  });
}

async function constrain(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

/** Where the restored line starts, in pixels below the top of the scroller. */
function restoredLineOffset(page: Page, from: number): Promise<number> {
  return page.evaluate((position) => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    const scroller = view.scrollDOM.getBoundingClientRect();
    return (
      view.lineBlockAt(position).top +
      (view.documentTop - scroller.top) / view.scaleY
    );
  }, from);
}

/**
 * Over `duration`, every frame: the highest the restored line came back
 * to, and how much the content above it grew.
 */
function watchRestoredLine(page: Page, from: number, duration: number) {
  return page.evaluate(
    async ({ position, duration }) => {
      const fiber = [...window.harness.views[0]!.plugins].find(
        (plugin) => plugin.definition.name === "livePreview",
      );
      const view = fiber!.context!.editor.view;
      const startTop = view.lineBlockAt(position).top;
      let highestOffset = -Infinity;
      const end = performance.now() + duration;
      while (performance.now() < end) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const scroller = view.scrollDOM.getBoundingClientRect();
        highestOffset = Math.max(
          highestOffset,
          view.lineBlockAt(position).top +
            (view.documentTop - scroller.top) / view.scaleY,
        );
      }
      return {
        highestOffset,
        grewAbove: view.lineBlockAt(position).top - startTop,
      };
    },
    { position: from, duration },
  );
}

test("a wheel over the margin right after a restore is not pulled back to the restored line", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const source = note();
  await open(page, source, "obsidian", { trusted: true });
  await page.evaluate(() =>
    window.harness.configureEditor({ readableLineLength: true }),
  );
  await expect(page.locator(".cm-editor.is-readable-line-width")).toHaveCount(
    1,
  );
  await constrain(page);
  await serveSlowImages(page);
  const content = (await page.locator(".cm-content").first().boundingBox())!;
  const scroller = (await page.locator(".cm-scroller").first().boundingBox())!;
  const margin = scroller.x + scroller.width - (content.x + content.width);
  expect(margin, "the readable width leaves a side margin").toBeGreaterThan(60);
  await page.mouse.move(content.x + content.width + 20, scroller.y + 200);

  const from = source.indexOf("Restored line");
  const saved = {
    anchor: from,
    head: from,
    scrollTop: 0,
    scrollAnchor: { from, offset: 0 },
    mode: "livePreview" as const,
  };
  await page.evaluate((state) => window.harness.restore(state), saved);
  await expect
    .poll(() => restoredLineOffset(page, from), { intervals: [16] })
    .toBeCloseTo(0, 0);

  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => restoredLineOffset(page, from), { intervals: [16] })
    .toBeLessThan(-300);
  const watched = await watchRestoredLine(page, from, 1600);
  expect(watched.grewAbove, "the images above loaded").toBeGreaterThan(300);
  expect(
    watched.highestOffset,
    "the restored line stays where the wheel left it",
  ).toBeLessThan(-300);
});

test("the restored line stays where it was saved while the images above it load", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const source = note();
  await open(page, source, "obsidian", { trusted: true });
  await constrain(page);
  await serveSlowImages(page);
  const from = source.indexOf("Restored line");
  const saved = {
    anchor: from,
    head: from,
    scrollTop: 0,
    scrollAnchor: { from, offset: 0 },
    mode: "livePreview" as const,
  };
  await page.evaluate((state) => window.harness.restore(state), saved);
  const watched = await watchRestoredLine(page, from, 1800);
  const offset = await restoredLineOffset(page, from);
  expect(watched.grewAbove, "the images above loaded").toBeGreaterThan(300);
  expect(Math.abs(offset)).toBeLessThanOrEqual(2);
});
