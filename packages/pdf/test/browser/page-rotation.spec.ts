import { expect, test, type Page } from "@playwright/test";
import { act, openView } from "./view-controls-support";

// rotated.pdf: portrait pages stored with /Rotate 0, 90, 180 and 270. A page
// is shown the way its /Rotate says: the 90 and 270 pages are landscape.

/** The /Rotate of each page of rotated.pdf (see test/fixtures/make-fixtures.mjs). */
const ROTATIONS = [0, 90, 180, 270];
const PDF = "&pdf=rotated.pdf";

async function boxes(
  page: Page,
): Promise<Map<number, { width: number; height: number }>> {
  const list = await page.locator(".page").evaluateAll((pages) =>
    pages.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return [
        Number((element as HTMLElement).dataset.pageIndex),
        { width, height },
      ] as const;
    }),
  );
  return new Map(list);
}

async function expectOrientation(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const shown = await boxes(page);
      return [...shown].every(([index, { width, height }]) =>
        ROTATIONS[index] === 90 || ROTATIONS[index] === 270
          ? width > height
          : height > width,
      );
    })
    .toBe(true);
}

const open = (page: Page, settings: object) =>
  openView(page, settings, "slim", PDF);

for (const [name, settings] of [
  ["continuous single", {}],
  ["continuous two pages", { pageLayout: "spread" }],
  ["page by page single", { scrollMode: "paged" }],
  ["page by page two pages", { scrollMode: "paged", pageLayout: "spread" }],
  ["horizontal", { scrollDirection: "horizontal" }],
] as const) {
  test(`pages are shown as their /Rotate says: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await open(page, { defaultZoom: "fitPage", ...settings });
    await expectOrientation(page);
    // The image fills its page box (turned, for a page stored sideways).
    const fits = await page.locator(".page").evaluateAll((pages) =>
      pages.every((element) => {
        const image = element.querySelector("img");
        if (!image) {
          return true;
        }
        const box = element.getBoundingClientRect();
        const shown = image.getBoundingClientRect();
        return (
          Math.abs(shown.width - box.width) < 2 &&
          Math.abs(shown.height - box.height) < 2 &&
          Math.abs(shown.left - box.left) < 2 &&
          Math.abs(shown.top - box.top) < 2
        );
      }),
    );
    expect(fits).toBe(true);
  });
}

test("the orientation holds through layout, scroll and zoom changes and a reopen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await open(page, { defaultZoom: "fitWidth" });
  await expectOrientation(page);
  for (const action of [
    { action: "setPageLayout", pageLayout: "spread" },
    { action: "setScrollMode", scrollMode: "paged" },
    { action: "nextPage" },
    { action: "zoomIn" },
    { action: "previousPage" },
    { action: "setScrollMode", scrollMode: "continuous" },
    { action: "setPageLayout", pageLayout: "single" },
  ] as const) {
    await act(page, action);
    await page.waitForTimeout(300);
    await expectOrientation(page);
  }
  await page.reload();
  await expect(page.locator(".page img").first()).toBeVisible();
  await expectOrientation(page);
});

test("search finds text on a rotated page and its hit lies on the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await open(page, { defaultZoom: "fitPage" });
  await page.getByRole("button", { name: "Find in PDF" }).click();
  await page
    .getByRole("searchbox", { name: "Find in PDF" })
    .fill("Rotated page 2");
  await page.keyboard.press("Enter");
  await expect(page.locator(".search-count")).toHaveText("1 of 1");
  await page.waitForTimeout(800);
  const inside = await page.evaluate(() => {
    const target = document
      .querySelector('.page[data-page-index="1"]')!
      .getBoundingClientRect();
    const hits = Array.from(
      document.querySelectorAll(
        '.page[data-page-index="1"] [style*="background"]',
      ),
    )
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 4 && rect.width < target.width);
    return (
      hits.length > 0 &&
      hits.every(
        (rect) =>
          rect.left >= target.left - 1 &&
          rect.right <= target.right + 1 &&
          rect.top >= target.top - 1 &&
          rect.bottom <= target.bottom + 1,
      )
    );
  });
  expect(inside).toBe(true);
});
