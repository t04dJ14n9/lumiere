import { expect, test, type Page } from "@playwright/test";
import { act, lastView, openView } from "./view-controls-support";

// Like Preview, zoom from the buttons, keys and menu keeps what is at the centre
// of the viewer where it is.

/** The page point at the viewer's centre, then where that point is on screen later. */
async function centrePoint(page: Page) {
  return page.evaluate(() => {
    const view = document.querySelector(".viewport")!.getBoundingClientRect();
    const cx = view.left + view.width / 2;
    const cy = view.top + view.height / 2;
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(".page"),
    )) {
      const box = element.getBoundingClientRect();
      if (
        cy >= box.top &&
        cy <= box.bottom &&
        cx >= box.left &&
        cx <= box.right
      ) {
        return {
          index: element.dataset.pageIndex!,
          x: (cx - box.left) / box.width,
          y: (cy - box.top) / box.height,
        };
      }
    }
    return undefined;
  });
}

async function whereIs(
  page: Page,
  point: { index: string; x: number; y: number },
) {
  return page.evaluate((point) => {
    const view = document.querySelector(".viewport")!.getBoundingClientRect();
    const box = document
      .querySelector(`.page[data-page-index="${point.index}"]`)!
      .getBoundingClientRect();
    return {
      x: box.left + point.x * box.width - (view.left + view.width / 2),
      y: box.top + point.y * box.height - (view.top + view.height / 2),
    };
  }, point);
}

for (const [name, settings] of [
  ["continuous single", { pageLayout: "single" }],
  ["continuous two pages", { pageLayout: "spread" }],
  ["page by page", { scrollMode: "paged" }],
] as const) {
  test(`${name}: zoom in and out from the controls keeps the viewer's centre in place`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await openView(page, { defaultZoom: 200, ...settings });
    await page.waitForTimeout(500);
    await page
      .locator(".viewport")
      .evaluate((v) =>
        v.scrollBy({ left: 150, top: 330, behavior: "instant" }),
      );
    await page.waitForTimeout(300);
    const point = await centrePoint(page);
    expect(point).toBeDefined();
    for (const action of ["zoomIn", "zoomIn", "zoomOut"] as const) {
      const before = (await lastView(page))!.zoomPercent;
      await act(page, { action });
      await expect
        .poll(async () => (await lastView(page))!.zoomPercent)
        .not.toBe(before);
      await page.waitForTimeout(600); // the zoom animation and the re-render
      // The scroll that keeps the centre lands with the re-render.
      await expect
        .poll(
          async () => {
            const moved = await whereIs(page, point!);
            return Math.max(Math.abs(moved.x), Math.abs(moved.y));
          },
          { timeout: 5000 },
        )
        .toBeLessThan(6);
    }
  });
}
