import { expect, test } from "@playwright/test";
import {
  act,
  lastView,
  openView,
  pageIndexes,
  send,
  spreadGeometry,
  viewMenu,
} from "./view-controls-support";
import { parseViewSettings } from "../../src/shared/view-settings";

test("slim: View chooses fit modes, actual size and custom percentages", async ({
  page,
}) => {
  await openView(page, { defaultZoom: "fitPage" }, "slim");
  await viewMenu(page);
  const mode = page.getByRole("combobox", { name: "Zoom mode", exact: true });
  await mode.selectOption("actualSize");
  await expect
    .poll(() => lastView(page))
    .toMatchObject({ zoomPercent: 100, fit: null });
  await expect
    .poll(() =>
      page
        .locator(".page")
        .first()
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(300);
  await page
    .getByRole("textbox", { name: "Custom zoom", exact: true })
    .fill("140");
  await page
    .getByRole("textbox", { name: "Custom zoom", exact: true })
    .press("Enter");
  await expect
    .poll(() => lastView(page))
    .toMatchObject({ zoomPercent: 140, fit: null });
  await mode.selectOption("fitWidth");
  await expect.poll(() => lastView(page)).toMatchObject({ fit: "width" });
  await mode.selectOption("fitPage");
  await expect.poll(() => lastView(page)).toMatchObject({ fit: "page" });
});

test("chrome receives the same view actions without a webview toolbar", async ({
  page,
}) => {
  await openView(page, {}, "chrome");
  await expect(page.getByRole("toolbar", { name: "PDF toolbar" })).toHaveCount(
    0,
  );
  await act(page, { action: "actualSize" });
  await act(page, { action: "setScrollMode", scrollMode: "paged" });
  await act(page, {
    action: "setScrollDirection",
    scrollDirection: "horizontal",
  });
  await expect
    .poll(() => lastView(page))
    .toMatchObject({
      zoomPercent: 100,
      scrollMode: "paged",
      scrollDirection: "horizontal",
    });
  await expect.poll(() => pageIndexes(page)).toEqual([0]);
});

for (const scrollDirection of ["vertical", "horizontal"] as const) {
  test(`${scrollDirection}: native odd/even layouts pair pages and navigate and fit whole spreads`, async ({
    page,
  }) => {
    await openView(page, { defaultZoom: "fitPage", scrollDirection });
    await viewMenu(page);
    await page
      .getByRole("combobox", { name: "Page layout", exact: true })
      .selectOption("spread");
    const second = page.locator('.page[data-page-index="1"]');
    await expect(second).toBeVisible();
    await expect
      .poll(() => spreadGeometry(page, [0, 1]))
      .toMatchObject({ paired: true, fitsWidth: true, fitsHeight: true });
    await page
      .getByRole("combobox", { name: "Scroll mode", exact: true })
      .selectOption("paged");
    await expect.poll(() => pageIndexes(page)).toEqual([0, 1]);
    await act(page, { action: "nextPage" });
    await expect.poll(() => pageIndexes(page)).toEqual([2, 3]);
    // Go to the right page without clipping the left half of the spread.
    await act(page, { action: "goToPage", page: 4 });
    await expect.poll(() => lastView(page)).toMatchObject({ page: 4 });
    await expect.poll(() => pageIndexes(page)).toEqual([2, 3]);
    await expect
      .poll(() => spreadGeometry(page, [2, 3]))
      .toMatchObject({ paired: true, fitsWidth: true, fitsHeight: true });
    await act(page, { action: "fitWidth" });
    await expect.poll(() => lastView(page)).toMatchObject({ fit: "width" });
    await expect
      .poll(() => spreadGeometry(page, [2, 3]))
      .toMatchObject({ paired: true, fitsWidth: true, fillsWidth: true });
    await act(page, { action: "fitPage" });
    await expect
      .poll(() => spreadGeometry(page, [2, 3]))
      .toMatchObject({ paired: true, fitsWidth: true, fitsHeight: true });
    await act(page, { action: "previousPage" });
    await expect.poll(() => pageIndexes(page)).toEqual([0, 1]);
    await page
      .getByRole("combobox", { name: "Page layout", exact: true })
      .selectOption("spreadCover");
    await expect.poll(() => pageIndexes(page)).toEqual([0]);
    await act(page, { action: "nextPage" });
    await expect.poll(() => pageIndexes(page)).toEqual([1, 2]);
    await act(page, { action: "goToPage", page: 3 });
    await expect.poll(() => lastView(page)).toMatchObject({ page: 3 });
    await expect.poll(() => pageIndexes(page)).toEqual([1, 2]);
    await act(page, { action: "previousPage" });
    await expect.poll(() => pageIndexes(page)).toEqual([0]);
    // The final pair has no next spread, even when its first page is below pageCount.
    await act(page, { action: "setPageLayout", pageLayout: "spread" });
    await act(page, { action: "goToPage", page: 11 });
    await expect.poll(() => pageIndexes(page)).toEqual([10, 11]);
    await expect(
      page.getByRole("button", { name: "Next page", exact: true }),
    ).toBeDisabled();
    await act(page, { action: "setPageLayout", pageLayout: "spreadCover" });
    await expect.poll(() => pageIndexes(page)).toEqual([9, 10]);
    await act(page, { action: "nextPage" });
    await expect.poll(() => pageIndexes(page)).toEqual([11]);
    await expect
      .poll(() => lastView(page))
      .toMatchObject({ canGoForward: false });
    await act(page, { action: "previousPage" });
    await expect.poll(() => pageIndexes(page)).toEqual([9, 10]);
  });
}

test("layout settings update native pairing while unrelated updates preserve the chosen layout", async ({
  page,
}) => {
  await openView(page, { defaultZoom: "fitPage", scrollMode: "paged" });
  await act(page, { action: "goToPage", page: 4 });
  const settings = parseViewSettings({
    defaultZoom: "fitPage",
    scrollMode: "paged",
    pageLayout: "spread",
  });
  await send(page, { type: "viewSettings", settings });
  await expect
    .poll(() => lastView(page))
    .toMatchObject({ page: 4, pageLayout: "spread" });
  await expect.poll(() => pageIndexes(page)).toEqual([2, 3]);
  await act(page, { action: "setPageLayout", pageLayout: "spreadCover" });
  await expect.poll(() => pageIndexes(page)).toEqual([3, 4]);
  await send(page, {
    type: "viewSettings",
    settings: { ...settings, smoothScrolling: false },
  });
  await expect
    .poll(() => lastView(page))
    .toMatchObject({ page: 4, pageLayout: "spreadCover" });
  await expect.poll(() => pageIndexes(page)).toEqual([3, 4]);
});

test("horizontal strategy arranges native layout items across the viewport", async ({
  page,
}) => {
  await openView(page, { defaultZoom: "actual" });
  await viewMenu(page);
  await page
    .getByRole("combobox", { name: "Scroll direction", exact: true })
    .selectOption("horizontal");
  await expect
    .poll(async () => {
      const a = await page.locator('.page[data-page-index="0"]').boundingBox();
      const b = await page.locator('.page[data-page-index="1"]').boundingBox();
      return Boolean(a && b && Math.abs(a.y - b.y) < 1 && b.x > a.x);
    })
    .toBe(true);
  await act(page, { action: "goToPage", page: 7 });
  await expect(page.locator('.page[data-page-index="6"] img')).toBeVisible();
  await expect
    .poll(() => lastView(page))
    .toMatchObject({ readingPage: 7, scrollDirection: "horizontal" });
});

test("saved view choices override defaults on reopen and survive a file rebuild", async ({
  page,
}) => {
  await openView(
    page,
    {
      defaultZoom: "actual",
      pageLayout: "spreadCover",
      scrollMode: "paged",
      scrollDirection: "horizontal",
    },
    "slim",
    "&persist=1",
  );
  await expect.poll(() => pageIndexes(page)).toEqual([0]);
  await act(page, { action: "goToPage", page: 6 });
  await expect.poll(() => pageIndexes(page)).toEqual([5, 6]);
  await act(page, { action: "setZoom", percent: 125 });
  await expect
    .poll(() => lastView(page))
    .toMatchObject({ page: 6, zoomPercent: 125 });
  // The harness stands in for extension storage across disposal/reopen.
  await page.goto(
    "/?toolbar=slim&persist=1&view=" +
      encodeURIComponent(JSON.stringify({ defaultZoom: "fitWidth" })),
  );
  await expect
    .poll(() => lastView(page))
    .toMatchObject({
      page: 6,
      zoomPercent: 125,
      pageLayout: "spreadCover",
      scrollMode: "paged",
      scrollDirection: "horizontal",
    });
  await expect.poll(() => pageIndexes(page)).toEqual([5, 6]);
  await page.evaluate(async () => {
    document.querySelector(".viewer")!.classList.add("before-reload");
    const data = await (await fetch("/fixtures/outline.pdf")).arrayBuffer();
    (window as unknown as { hostSend(message: unknown): void }).hostSend({
      type: "load",
      sha256: "test-sha",
      data,
      settings: {},
    });
  });
  await expect
    .poll(() => lastView(page))
    .toMatchObject({
      page: 6,
      zoomPercent: 125,
      pageLayout: "spreadCover",
      scrollMode: "paged",
      scrollDirection: "horizontal",
    });
  await expect(
    page.locator('.viewer:not(.before-reload) .page[data-page-index="5"] img'),
  ).toBeVisible();
  await expect.poll(() => pageIndexes(page)).toEqual([5, 6]);
});

/** What each page layout shows, spread by spread, for page counts and shapes the main fixture lacks. */
const SPREADS = [
  { pdf: "one.pdf", spread: [[0]], spreadCover: [[0]] },
  { pdf: "short.pdf", spread: [[0, 1], [2]], spreadCover: [[0], [1, 2]] },
  {
    pdf: "five.pdf",
    spread: [[0, 1], [2, 3], [4]],
    spreadCover: [[0], [1, 2], [3, 4]],
  },
  {
    pdf: "landscape.pdf",
    spread: [
      [0, 1],
      [2, 3],
    ],
    spreadCover: [[0], [1, 2], [3]],
  },
] as const;

for (const fixture of SPREADS) {
  for (const pageLayout of ["spread", "spreadCover"] as const) {
    test(`${fixture.pdf}: ${pageLayout} steps through ${JSON.stringify(fixture[pageLayout])} and back`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const expected = fixture[pageLayout];
      await openView(
        page,
        { defaultZoom: "fitPage", pageLayout, scrollMode: "paged" },
        "slim",
        `&pdf=${fixture.pdf}`,
      );
      const last = expected.at(-1)!.at(-1)! + 1;
      await expect.poll(() => pageIndexes(page)).toEqual(expected[0]);
      await expect
        .poll(() => lastView(page))
        .toMatchObject({ canGoBack: false, canGoForward: expected.length > 1 });
      for (const spread of expected.slice(1)) {
        await act(page, { action: "nextPage" });
        await expect.poll(() => pageIndexes(page)).toEqual(spread);
      }
      await expect
        .poll(() => lastView(page))
        .toMatchObject({ canGoForward: false });
      // Next at the end and previous at the start stay put.
      await act(page, { action: "nextPage" });
      await expect.poll(() => pageIndexes(page)).toEqual(expected.at(-1));
      for (const spread of expected.slice(0, -1).reverse()) {
        await act(page, { action: "previousPage" });
        await expect.poll(() => pageIndexes(page)).toEqual(spread);
      }
      await act(page, { action: "previousPage" });
      await expect.poll(() => pageIndexes(page)).toEqual(expected[0]);
      await expect
        .poll(() => lastView(page))
        .toMatchObject({ canGoBack: false });
      // Jumping to the last page shows the spread it belongs to; out of range clamps to it.
      await act(page, { action: "goToPage", page: last });
      await expect.poll(() => pageIndexes(page)).toEqual(expected.at(-1));
      await act(page, { action: "goToPage", page: 1 });
      await expect.poll(() => pageIndexes(page)).toEqual(expected[0]);
      await act(page, { action: "goToPage", page: 99 });
      await expect.poll(() => pageIndexes(page)).toEqual(expected.at(-1));
      expect(errors).toEqual([]);
    });
  }
}
