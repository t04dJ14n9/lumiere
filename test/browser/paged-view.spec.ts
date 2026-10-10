import { expect, test } from "@playwright/test";
import {
  act,
  lastView,
  openView,
  pageIndexes,
  send,
  viewMenu,
} from "./view-controls-support";
import {
  lastSelection,
  pagePoint,
  selectText,
  TEXT_MIDLINE,
} from "./viewer-support";

test("page-by-page bounds wheel/keyboard panning and follows page, outline and internal-link destinations", async ({
  page,
}) => {
  await openView(page, { defaultZoom: 400, scrollMode: "paged" });
  await expect.poll(() => pageIndexes(page)).toEqual([0]);
  await page.locator(".viewport").evaluate((viewport) => {
    viewport.scrollTop = 1_000_000;
  });
  await expect.poll(() => lastView(page)).toMatchObject({ page: 1 });
  await expect.poll(() => pageIndexes(page)).toEqual([0]);
  await expect
    .poll(() =>
      page.locator(".viewport").evaluate((viewport) => viewport.scrollTop),
    )
    .toBeLessThan(500);
  await act(page, { action: "nextPage" });
  await expect.poll(() => pageIndexes(page)).toEqual([1]);
  await act(page, { action: "goToPage", page: 7 });
  await expect.poll(() => pageIndexes(page)).toEqual([6]);
  await send(page, { type: "goTo", location: { page: 9 }, top: 130 });
  await expect.poll(() => pageIndexes(page)).toEqual([8]);
  await act(page, { action: "actualSize" });
  await act(page, { action: "goToPage", page: 1 });
  await page.getByRole("link", { name: "Go to page 5" }).click();
  await expect.poll(() => pageIndexes(page)).toEqual([4]);
  await act(page, { action: "setScrollMode", scrollMode: "continuous" });
  await expect.poll(() => pageIndexes(page)).not.toEqual([4]);
});

test("the last page reaches the same page-by-page position, and Escape dismisses View without clearing a selection", async ({
  page,
}) => {
  await openView(page, { defaultZoom: "actual", scrollMode: "paged" });
  await act(page, { action: "goToPage", page: 12 });
  await expect.poll(() => pageIndexes(page)).toEqual([11]);
  await expect
    .poll(() =>
      page.locator('.page[data-page-index="11"]').evaluate((element) => {
        const viewport = element.closest(".viewport")!.getBoundingClientRect();
        return element.getBoundingClientRect().top - viewport.top;
      }),
    )
    .toBe(12);
  await act(page, { action: "goToPage", page: 1 });
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect.poll(() => lastSelection(page)).toMatchObject({ kind: "text" });
  await viewMenu(page);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("group", { name: "PDF view controls" }),
  ).toBeHidden();
  await expect.poll(() => lastSelection(page)).toMatchObject({ kind: "text" });
});

for (const scrollDirection of ["vertical", "horizontal"] as const) {
  test(`${scrollDirection}: zoomed page-by-page spreads bound panning and retain coordinate destinations`, async ({
    page,
  }) => {
    await openView(page, {
      defaultZoom: 400,
      pageLayout: "spread",
      scrollMode: "paged",
      scrollDirection,
    });
    await expect.poll(() => pageIndexes(page)).toEqual([0, 1]);
    await page.locator(".viewport").evaluate((viewport) => {
      viewport.scrollTo({ left: 1_000_000, top: 1_000_000 });
    });
    await expect.poll(() => pageIndexes(page)).toEqual([0, 1]);
    await expect.poll(() => lastView(page)).toMatchObject({ page: 1 });
    await expect
      .poll(() =>
        page.locator(".viewport").evaluate((viewport) => viewport.scrollTop),
      )
      .toBeLessThan(500);
    await expect
      .poll(() =>
        page.locator(".viewport").evaluate((viewport) => viewport.scrollLeft),
      )
      .toBeLessThan(1500);
    await send(page, {
      type: "goTo",
      location: {
        page: 4,
        viewRect: { left: 72, top: 100, width: 134, height: 21 },
      },
    });
    await expect.poll(() => pageIndexes(page)).toEqual([2, 3]);
    await expect.poll(() => lastView(page)).toMatchObject({ page: 4 });
    await expect(
      page.locator('.page[data-page-index="3"] .location-highlight'),
    ).toBeVisible();
    await act(page, { action: "nextPage" });
    await expect.poll(() => pageIndexes(page)).toEqual([4, 5]);
    await act(page, { action: "previousPage" });
    await expect.poll(() => pageIndexes(page)).toEqual([2, 3]);
  });
}
