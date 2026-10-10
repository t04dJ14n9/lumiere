import { expect, test, type Page } from "@playwright/test";
import { pinchFactor } from "../../src/shared/pinch-zoom";
import { lastView, openView } from "./view-controls-support";

/** Dispatch wheel events at the viewport's centre; resolves to each event's `defaultPrevented`. */
function wheel(
  page: Page,
  events: { deltaX?: number; deltaY?: number; ctrlKey?: boolean; metaKey?: boolean; deltaMode?: number }[],
): Promise<boolean[]> {
  return page.evaluate((events) => {
    const viewport = document.querySelector(".viewport")!;
    const box = viewport.getBoundingClientRect();
    return events.map((init) => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        ...init,
      });
      (document.elementFromPoint(event.clientX, event.clientY) ?? viewport).dispatchEvent(event);
      return event.defaultPrevented;
    });
  }, events);
}

const transform = (page: Page) =>
  page.evaluate(() => (document.querySelector("[data-pdf-scroller]") as HTMLElement).style.transform);
const zoom = async (page: Page) => (await lastView(page))!.zoomPercent;

test("only Ctrl/Cmd+wheel (and pinch) is taken from the browser: plain trackpad scrolling and horizontal pans keep their native default", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openView(page, { defaultZoom: 300 });
  await page.waitForTimeout(400);
  // Two-finger scrolling: small continuous pixel deltas, vertical and horizontal.
  expect(await wheel(page, [{ deltaY: 3 }, { deltaY: 7 }, { deltaX: 5 }, { deltaX: 4, deltaY: 1 }])).toEqual([false, false, false, false]);
  // Pinch and Ctrl/Cmd+wheel: the page must not zoom the whole window.
  expect(await wheel(page, [{ deltaY: -2, ctrlKey: true }, { deltaY: 1, metaKey: true }, { deltaX: 3, ctrlKey: true }])).toEqual([true, true, true]);
});

test("a pinch always ends: the preview transform is cleared and the layout has the scale the preview showed", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openView(page, { defaultZoom: 200 });
  await page.waitForTimeout(500);
  const before = await zoom(page);
  const deltas = [-4, -5, -6, -5];
  for (const deltaY of deltas) await wheel(page, [{ deltaY, ctrlKey: true }]);
  const expected = before * deltas.reduce((scale, deltaY) => scale * pinchFactor(deltaY, 0), 1);
  await expect.poll(() => transform(page), { timeout: 5_000 }).toBe("");
  await expect.poll(async () => Math.abs((await zoom(page)) / expected - 1)).toBeLessThan(0.02);
  // Nothing of the preview is left on screen: the page's box is its layout box.
  const { shown, laid } = await page.evaluate(() => {
    const page0 = document.querySelector<HTMLElement>(".page")!;
    return { shown: page0.getBoundingClientRect().width, laid: page0.offsetWidth };
  });
  expect(Math.abs(shown - laid)).toBeLessThan(1.5);
});

test("a pinch that starts while the last one is still being laid out carries on from what is on screen", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openView(page, { defaultZoom: 150 });
  await page.waitForTimeout(500);
  const before = await zoom(page);
  const first = [-6, -6, -6];
  const second = [-5, -5];
  for (const deltaY of first) await wheel(page, [{ deltaY, ctrlKey: true }]);
  // The first gesture settles after its pause; the second starts right after.
  await page.waitForTimeout(190);
  for (const deltaY of second) await wheel(page, [{ deltaY, ctrlKey: true }]);
  const scale = [...first, ...second].reduce((product, deltaY) => product * pinchFactor(deltaY, 0), 1);
  await expect.poll(() => transform(page), { timeout: 5_000 }).toBe("");
  await expect.poll(async () => Math.abs((await zoom(page)) / (before * scale) - 1), { timeout: 5_000 }).toBeLessThan(0.03);
});

test("losing the window's focus or hiding the page commits a pinch at once", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openView(page, { defaultZoom: 200 });
  await page.waitForTimeout(500);
  const before = await zoom(page);
  // In one task, so the timing is the page's: pinch, lose focus, and see how long the layout takes.
  const grewAfterMs = await page.evaluate(async () => {
    const viewport = document.querySelector(".viewport")!;
    const box = viewport.getBoundingClientRect();
    const page0 = document.querySelector<HTMLElement>(".page")!;
    const wide = page0.offsetWidth;
    for (const deltaY of [-8, -8]) {
      document.elementFromPoint(box.left + 100, box.top + 100)!.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY, clientX: box.left + 100, clientY: box.top + 100 }),
      );
    }
    window.dispatchEvent(new Event("blur"));
    const start = performance.now();
    while (performance.now() - start < 1_000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (document.querySelector<HTMLElement>(".page")!.offsetWidth > wide * 1.1) return performance.now() - start;
    }
    return Infinity;
  });
  // Well before the 140 ms pause that would settle the pinch anyway.
  expect(grewAfterMs).toBeLessThan(110);
  await expect.poll(async () => (await zoom(page)) > before * 1.1).toBe(true);
  await expect.poll(() => transform(page), { timeout: 5_000 }).toBe("");
});
