import { expect, test, type Page } from "@playwright/test";
import { act, lastView, openView } from "./view-controls-support";

// Option+Arrow (Ctrl+Alt+Arrow elsewhere) turns the page keeping the zoom and
// the place in the page, as macOS Preview does. The keybindings call these
// actions; plain arrows still go to the top of the next page.

const viewport = (page: Page) => page.locator(".viewport");

/** How far the viewer's top-left corner is into the page with this index, in pixels. */
const into = (page: Page, index: number) =>
  page.evaluate((index) => {
    const view = document.querySelector(".viewport")!.getBoundingClientRect();
    const box = document
      .querySelector(`.page[data-page-index="${index}"]`)!
      .getBoundingClientRect();
    return {
      top: Math.round(view.top - box.top),
      left: Math.round(view.left - box.left),
    };
  }, index);

for (const [name, settings] of [
  ["continuous single", { pageLayout: "single" }],
  ["continuous two pages", { pageLayout: "spread" }],
  ["page by page single", { scrollMode: "paged", pageLayout: "single" }],
  ["page by page two pages", { scrollMode: "paged", pageLayout: "spread" }],
] as const) {
  test(`${name}: next and previous keep the zoom and the place in the page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 600 });
    await openView(page, { defaultZoom: 300, ...settings });
    await page.waitForTimeout(400);
    const zoom = (await lastView(page))!.zoomPercent;
    // Somewhere inside the first page or spread.
    await viewport(page).evaluate((v) =>
      v.scrollBy({ left: 120, top: 260, behavior: "instant" }),
    );
    await page.waitForTimeout(300);
    const reading = async () => ((await lastView(page))?.readingPage ?? 1) - 1;
    const first = await reading();
    const before = await into(page, first);
    expect(before.top).toBeGreaterThan(100);
    await act(page, { action: "nextPageKeepingPlace" });
    await expect.poll(reading).toBeGreaterThan(first);
    await page.waitForTimeout(500);
    const next = await reading();
    const after = await into(page, next);
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(3);
    expect((await lastView(page))!.zoomPercent).toBe(zoom);
    await act(page, { action: "previousPageKeepingPlace" });
    await expect.poll(reading).toBe(first);
    await page.waitForTimeout(500);
    const back = await into(page, first);
    expect(Math.abs(back.top - before.top)).toBeLessThanOrEqual(3);
    expect((await lastView(page))!.zoomPercent).toBe(zoom);
  });
}

test("the plain next page still goes to the top of the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openView(page, { defaultZoom: 300 });
  await viewport(page).evaluate((v) =>
    v.scrollBy({ top: 260, behavior: "instant" }),
  );
  await page.waitForTimeout(300);
  await act(page, { action: "nextPage" });
  await expect.poll(async () => (await lastView(page))?.readingPage).toBe(2);
  await page.waitForTimeout(500);
  const place = await into(page, 1);
  expect(place.top).toBeLessThanOrEqual(3);
});
