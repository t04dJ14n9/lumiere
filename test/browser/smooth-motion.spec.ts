import { expect, test, type Page } from "@playwright/test";
import { act, lastView, openView, send } from "./view-controls-support";

/** Synthetic deltas expose interception directly; native trackpad scrolling is checked separately. */
function wheel(
  page: Page,
  deltaY: number,
): Promise<{ prevented: boolean; position: number }> {
  return page.locator(".viewport").evaluate((viewport, deltaY) => {
    const event = new WheelEvent("wheel", {
      deltaY,
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(event);
    return { prevented: event.defaultPrevented, position: viewport.scrollTop };
  }, deltaY);
}

test("large wheel notches animate, reverse promptly, and native pixel deltas interrupt them", async ({
  page,
}) => {
  await openView(page, { defaultZoom: "actual", smoothScrolling: true });
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-smooth-scrolling",
    "true",
  );
  const start = await page
    .locator(".viewport")
    .evaluate((viewport) => viewport.scrollTop);
  const first = await wheel(page, 100);
  expect(first).toEqual({ prevented: true, position: start });
  await expect
    .poll(
      () =>
        page.locator(".viewport").evaluate((viewport) => viewport.scrollTop),
      { intervals: [10] },
    )
    .toBeGreaterThan(start);
  await expect
    .poll(() =>
      page.locator(".viewport").evaluate((viewport) => viewport.scrollTop),
    )
    .toBe(start + 100);
  await wheel(page, 120);
  const pixel = await wheel(page, 2.5);
  expect(pixel.prevented).toBe(false);
  await page.waitForTimeout(180);
  expect(
    await page.locator(".viewport").evaluate((viewport) => viewport.scrollTop),
  ).toBe(pixel.position);
  // Real trackpad-style native pixels still scroll normally.
  await page.locator(".viewport").hover();
  await page.mouse.wheel(0, 24);
  await expect
    .poll(() =>
      page.locator(".viewport").evaluate((viewport) => viewport.scrollTop),
    )
    .toBeGreaterThan(pixel.position);
});

test("smooth page/outline jumps and displayed zoom animate; explicit false and reduced motion disable them", async ({
  page,
}) => {
  await openView(page, { defaultZoom: "actual", smoothScrolling: true });
  await send(page, { type: "goTo", location: { page: 8 } });
  const positions = await page
    .locator(".viewport")
    .evaluate(async (viewport) => {
      const samples: number[] = [];
      for (let i = 0; i < 12; i++) {
        await new Promise(requestAnimationFrame);
        samples.push(viewport.scrollTop);
      }
      return samples;
    });
  expect(new Set(positions).size).toBeGreaterThan(2);
  await expect.poll(() => lastView(page)).toMatchObject({ page: 8 });
  const center = () =>
    page
      .locator(".page")
      .first()
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left + box.width / 2;
      });
  const beforeZoom = await center();
  await act(page, { action: "setZoom", percent: 150 });
  await expect
    .poll(
      () =>
        page
          .locator("[data-pdf-scroller]")
          .evaluate((element) => element.getAnimations().length),
      { intervals: [10] },
    )
    .toBeGreaterThan(0);
  expect(Math.abs((await center()) - beforeZoom)).toBeLessThan(2);
  await expect.poll(() => lastView(page)).toMatchObject({ zoomPercent: 150 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-smooth-scrolling",
    "false",
  );
  expect((await wheel(page, 100)).prevented).toBe(false);
  await act(page, { action: "actualSize" });
  await expect.poll(() => lastView(page)).toMatchObject({ zoomPercent: 100 });
  expect(
    await page
      .locator("[data-pdf-scroller]")
      .evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await send(page, {
    type: "viewSettings",
    settings: {
      defaultZoom: "actual",
      pageLayout: "single",
      scrollMode: "continuous",
      scrollDirection: "vertical",
      smoothScrolling: false,
    },
  });
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-smooth-scrolling",
    "false",
  );
  expect((await wheel(page, 100)).prevented).toBe(false);
});
