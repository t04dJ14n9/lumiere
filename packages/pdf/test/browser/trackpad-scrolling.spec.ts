import { expect, test, type Page } from "@playwright/test";
import { lastView, openView, pageIndexes } from "./view-controls-support";

const scrollTop = (page: Page) =>
  page.locator(".viewport").evaluate((viewport) => viewport.scrollTop);
const scrollLeft = (page: Page) =>
  page.locator(".viewport").evaluate((viewport) => viewport.scrollLeft);

/** Real (trusted) wheel input, as a mouse or a trackpad produces it. */
async function over(page: Page): Promise<void> {
  const box = (await page.locator(".viewport").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * A trackpad flick: deltas ramp up, then decay with momentum. The events are
 * sent back to back: a loaded runner could stretch a per-frame pause past the
 * gap that ends a gesture, which a real trackpad's steady stream never does.
 */
function flick(peak: number, frames = 60): number[] {
  const deltas: number[] = [];
  for (let i = 1; i <= 8; i++) {
    deltas.push(Math.round((peak * i) / 8));
  }
  for (let delta = peak; delta >= 1 && deltas.length < frames; delta *= 0.93) {
    deltas.push(Math.round(delta));
  }
  return deltas;
}

async function swipe(page: Page, deltas: number[], axis: "y" | "x" = "y") {
  for (const delta of deltas) {
    await page.mouse.wheel(axis === "y" ? 0 : delta, axis === "y" ? delta : 0);
  }
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const PAGE_PX = 400; // actual size: a 400 pt page, plus gaps

const maxTop = (page: Page) =>
  page.locator(".viewport").evaluate((v) => v.scrollHeight - v.clientHeight);
// Let a smooth wheel animation that has just arrived stop before the test moves the viewport under it.
const toTop = async (page: Page, top: number) => {
  await page.waitForTimeout(400);
  await page
    .locator(".viewport")
    .evaluate((v, top) => v.scrollTo({ top, behavior: "instant" }), top);
};

for (const pageLayout of ["single", "spread"] as const) {
  for (const smoothScrolling of [true, false]) {
    test(`continuous ${pageLayout}, smooth ${smoothScrolling}: a big notch, a trackpad flick and a many-page flick travel across pages`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1000, height: 600 });
      await openView(page, {
        defaultZoom: "actual",
        pageLayout,
        smoothScrolling,
      });
      await over(page);
      const base = await scrollTop(page);
      const max = (await maxTop(page)) - base;
      // One mouse notch of a thousand pixels, as a fast flick reports it.
      await page.mouse.wheel(0, 1000);
      await expect.poll(() => scrollTop(page)).toBe(base + Math.min(1000, max));
      // A trackpad flick whose deltas include 100, 200 and 300 exactly keeps every pixel.
      await toTop(page, base);
      const deltas = [2, 9, 30, 100, 200, 300, 200, 100, 60, 30, 12, 4];
      await swipe(page, deltas);
      await expect
        .poll(() => scrollTop(page))
        .toBe(base + Math.min(sum(deltas), max));
      // A long flick crosses pages continuously: no stop at page boundaries.
      await toTop(page, base);
      const long = flick(120, 40);
      await swipe(page, long);
      const travel = Math.min(sum(long), max);
      await expect.poll(() => scrollTop(page)).toBe(base + travel);
      expect(travel / PAGE_PX).toBeGreaterThan(3);
      await expect
        .poll(async () => (await lastView(page))?.readingPage)
        .toBeGreaterThan(pageLayout === "single" ? 4 : 5);
    });
  }
}

test("a two-finger swipe pans sideways when zoomed, and Ctrl+wheel and pinch still zoom", async ({
  page,
}) => {
  await openView(page, { defaultZoom: 200, smoothScrolling: true });
  await over(page);
  const start = await scrollLeft(page);
  const sideways = flick(60, 20);
  await swipe(page, sideways, "x");
  const travelled = sum(sideways);
  await expect
    .poll(() => scrollLeft(page))
    .toBe(
      Math.min(
        start + travelled,
        await page
          .locator(".viewport")
          .evaluate((v) => v.scrollWidth - v.clientWidth),
      ),
    );
  const zoom = async () => (await lastView(page))!.zoomPercent;
  const before = await zoom();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect.poll(zoom).toBeGreaterThan(before);
});

test("paged: a long swipe turns one page and momentum does not turn another; the next swipe turns again", async ({
  page,
}) => {
  for (const pageLayout of ["single", "spread"] as const) {
    await openView(page, {
      defaultZoom: "fitPage",
      scrollMode: "paged",
      pageLayout,
    });
    await over(page);
    const first = await pageIndexes(page);
    await swipe(page, flick(300, 80));
    const second = await pageIndexes(page);
    expect(second[0]).toBe(first.at(-1)! + 1);
    await page.waitForTimeout(400);
    await swipe(page, flick(300, 80));
    const third = await pageIndexes(page);
    expect(third[0]).toBe(second.at(-1)! + 1);
    // And back with the opposite swipe.
    await page.waitForTimeout(400);
    await swipe(
      page,
      flick(300, 80).map((delta) => -delta),
    );
    expect(await pageIndexes(page)).toEqual(second);
  }
});

test("paged and zoomed: a swipe pans down the page, and a long one turns exactly one page", async ({
  page,
}) => {
  await openView(page, { defaultZoom: 400, scrollMode: "paged" });
  await over(page);
  expect(await pageIndexes(page)).toEqual([0]);
  const start = await scrollTop(page);
  await swipe(page, [100, 100, 100]);
  await expect.poll(() => scrollTop(page)).toBe(start + 300);
  expect(await pageIndexes(page)).toEqual([0]);
  // Enough to reach the page's end and keep going: one turn, however long the momentum.
  await swipe(page, flick(250, 70));
  await page.waitForTimeout(300);
  expect(await pageIndexes(page)).toEqual([1]);
});

test("mouse-wheel notches at the end of a paged page turn the page", async ({
  page,
}) => {
  await openView(page, {
    defaultZoom: "fitPage",
    scrollMode: "paged",
    smoothScrolling: true,
  });
  await over(page);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => pageIndexes(page)).toEqual([1]);
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => pageIndexes(page)).toEqual([2]);
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => pageIndexes(page)).toEqual([1]);
});
