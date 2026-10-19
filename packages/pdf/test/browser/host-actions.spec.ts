import { expect, test } from "@playwright/test";
import { open, pageOffset, lastView, sendAction } from "./viewer-support";

test("the viewer reports its page and zoom to the extension as they change", async ({
  page,
}) => {
  await open(page);
  await expect
    .poll(() => lastView(page))
    .toMatchObject({ page: 1, pageCount: 12, fit: "width" });
  const zoom = page.getByRole("textbox", { name: "Zoom" });
  await zoom.fill("150");
  await zoom.press("Enter");
  await expect
    .poll(() => lastView(page))
    .toMatchObject({
      page: 1,
      pageCount: 12,
      zoomPercent: 150,
      fit: null,
      tool: "text",
    });
  const field = page.getByRole("textbox", { name: "Page" });
  await field.fill("6");
  await field.press("Enter");
  await expect
    .poll(() => lastView(page))
    .toMatchObject({
      page: 6,
      pageCount: 12,
      zoomPercent: 150,
      fit: null,
      tool: "text",
    });
});

test("actions from the extension page, zoom, fit and open find", async ({
  page,
}) => {
  await open(page);
  await expect.poll(() => lastView(page)).toMatchObject({ page: 1 });
  await sendAction(page, { action: "goToPage", page: 5 });
  await expect.poll(() => lastView(page)).toMatchObject({ page: 5 });
  await expect.poll(() => pageOffset(page, 5)).toBeLessThanOrEqual(16);
  await sendAction(page, { action: "nextPage" });
  await expect.poll(() => lastView(page)).toMatchObject({ page: 6 });
  await sendAction(page, { action: "previousPage" });
  await sendAction(page, { action: "previousPage" });
  await expect.poll(() => lastView(page)).toMatchObject({ page: 4 });
  // Out of range pages are clamped.
  await sendAction(page, { action: "goToPage", page: 99 });
  await expect.poll(() => lastView(page)).toMatchObject({ page: 12 });

  await sendAction(page, { action: "setZoom", percent: 100 });
  await expect
    .poll(() => lastView(page))
    .toMatchObject({ zoomPercent: 100, fit: null });
  await sendAction(page, { action: "zoomIn" });
  await expect.poll(() => lastView(page)).toMatchObject({ zoomPercent: 110 });
  await sendAction(page, { action: "zoomOut" });
  await sendAction(page, { action: "zoomOut" });
  await expect.poll(() => lastView(page)).toMatchObject({ zoomPercent: 90 });
  await sendAction(page, { action: "setZoom", percent: 5000 });
  await expect.poll(() => lastView(page)).toMatchObject({ zoomPercent: 400 });
  await sendAction(page, { action: "fitPage" });
  await expect.poll(() => lastView(page)).toMatchObject({ fit: "page" });
  await sendAction(page, { action: "fitWidth" });
  await expect.poll(() => lastView(page)).toMatchObject({ fit: "width" });

  await sendAction(page, { action: "find" });
  await expect(
    page.getByRole("searchbox", { name: "Find in PDF" }),
  ).toBeFocused();
  // Malformed actions are ignored.
  const before = await lastView(page);
  await sendAction(page, { action: "goToPage", page: "two" });
  await sendAction(page, { action: "setZoom", percent: -1 });
  await page.waitForTimeout(300);
  expect(await lastView(page)).toEqual(before);
});
