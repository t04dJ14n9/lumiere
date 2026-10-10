import {
  closeAllEditors,
  command,
  expect,
  openFile,
  pdfViewer,
  quickInputTitled,
  showPage,
  statusBarEntry,
  test,
} from "./workbench";

/** One real-editor spec covers native commands, the chrome picker and durable reopening. */
test("PDF view commands change the active panel and its choices survive closing and reopening", async ({
  workbench: page,
}) => {
  await openFile(page, "docs/outline.pdf");
  let viewer = await pdfViewer(page);
  await command(page, "PDF: Single Page");
  await command(page, "PDF: Continuous Scrolling");
  await command(page, "PDF: Vertical Scrolling");
  await command(page, "PDF: Actual Size (100%)");
  await expect(statusBarEntry(page, /^100%$/u)).toBeVisible();
  await expect
    .poll(() =>
      viewer
        .locator(".page")
        .first()
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(300);
  await showPage(page, viewer, 1);

  await command(page, "PDF: Two Pages (1–2, 3–4)");
  await command(page, "PDF: Fit Page");
  await command(page, "PDF: Page-by-page Scrolling");
  const indexes = () =>
    viewer.locator(".page").evaluateAll((pages) =>
      pages.map((element) => Number((element as HTMLElement).dataset.pageIndex)),
    );
  await expect.poll(indexes).toEqual([0, 1]);
  await command(page, "PDF: Next Page");
  await expect.poll(indexes).toEqual([2, 3]);
  await expect(viewer.locator('.page[data-page-index="2"] img')).toBeVisible();
  await showPage(page, viewer, 4);
  await expect.poll(indexes).toEqual([2, 3]);
  await command(page, "PDF: Previous Page");
  await expect.poll(indexes).toEqual([0, 1]);
  await expect(viewer.locator('.page[data-page-index="0"] img')).toBeVisible();
  await command(page, "PDF: Two Pages with Cover (1, 2–3)");
  await expect.poll(indexes).toEqual([0]);
  await command(page, "PDF: Next Page");
  await expect.poll(indexes).toEqual([1, 2]);
  await expect(viewer.locator('.page[data-page-index="1"] img')).toBeVisible();
  await expect(viewer.locator('.page[data-page-index="2"] img')).toBeVisible();
  await command(page, "PDF: Horizontal Scrolling");
  await expect(viewer.locator(".viewer")).toHaveAttribute(
    "data-scroll-direction",
    "horizontal",
  );
  await page.locator('.part.statusbar [id$="vscodeEmbedPdf.view"]').click();
  await expect(quickInputTitled(page, /^PDF View$/u)).toBeVisible();
  await page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: /^Fit page$/iu })
    .click();
  await expect(statusBarEntry(page, /^Fit Page/u)).toBeVisible();
  await command(page, "PDF: Actual Size (100%)");
  await expect(statusBarEntry(page, /^100%$/u)).toBeVisible();
  await closeAllEditors(page);
  await openFile(page, "docs/outline.pdf", true);
  viewer = await pdfViewer(page);
  await expect(viewer.locator(".viewer")).toHaveAttribute(
    "data-page-layout",
    "spreadCover",
  );
  await expect(viewer.locator(".viewer")).toHaveAttribute(
    "data-scroll-mode",
    "paged",
  );
  await expect(viewer.locator(".viewer")).toHaveAttribute(
    "data-scroll-direction",
    "horizontal",
  );
  await expect(viewer.locator('.page[data-page-index="1"] img')).toBeVisible();
  await expect.poll(indexes).toEqual([1, 2]);
  await expect(statusBarEntry(page, /^100%$/u)).toBeVisible();

  // Other real-editor specs start from the usual view of this shared fixture.
  await command(page, "PDF: Continuous Scrolling");
  await command(page, "PDF: Single Page");
  await command(page, "PDF: Vertical Scrolling");
  await command(page, "PDF: Fit Width");
  await showPage(page, viewer, 1);
});
