import { expect, test } from "@playwright/test";
import {
  open,
  messages,
  pagePoint,
  pageOffset,
  PAGE_WIDTH,
} from "./viewer-support";

test("a location sent while the PDF loads opens its page and flashes its box", async ({
  page,
}) => {
  const location = {
    page: 5,
    viewRect: { left: 72, top: 83, width: 134, height: 21 },
  };
  await page.goto(`/?goto=${encodeURIComponent(JSON.stringify(location))}`);
  const highlight = page.locator(
    '.page[data-page-index="4"] .location-highlight',
  );
  await expect(highlight).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Page" })).toHaveValue("5");
  const box = (await highlight.boundingBox())!;
  const viewport = (await page.locator(".viewport").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(viewport.y);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.y + viewport.height);
});

test("a page typed in the field opens at its top, and leaving the field does not move it", async ({
  page,
}) => {
  await open(page);
  const field = page.getByRole("textbox", { name: "Page" });
  await field.fill("7");
  await field.press("Enter");
  await expect.poll(() => pageOffset(page, 7)).toBeLessThanOrEqual(16);
  const before = await pageOffset(page, 7);
  const at = await pagePoint(page, 7);
  await page.mouse.click(...at(20, 300));
  await page.waitForTimeout(300);
  expect(await pageOffset(page, 7)).toBe(before);
});

test("typing the current page again goes back to its top", async ({ page }) => {
  await open(page);
  const field = page.getByRole("textbox", { name: "Page" });
  await field.fill("7");
  await field.press("Enter");
  await expect.poll(() => pageOffset(page, 7)).toBeLessThanOrEqual(16);
  const top = (await pageOffset(page, 7))!;
  await page
    .locator(".viewport")
    .evaluate((viewport) => viewport.scrollBy(0, 150));
  await expect.poll(() => pageOffset(page, 7)).toBeLessThan(top - 100);
  await expect(field).toHaveValue("7");

  await field.fill("7");
  await field.press("Enter");
  await expect.poll(() => pageOffset(page, 7)).toBe(top);
});

test("the page and zoom fields show the clamped value, even when it is the current one", async ({
  page,
}) => {
  await open(page);
  const field = page.getByRole("textbox", { name: "Page" });
  await field.fill("0");
  await field.press("Enter");
  await expect(field).toHaveValue("1");
  await field.fill("12");
  await field.press("Enter");
  await expect(field).toHaveValue("12");
  await field.fill("99");
  await field.press("Enter");
  await expect(field).toHaveValue("12");

  const zoom = page.getByRole("textbox", { name: "Zoom" });
  await zoom.fill("400");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("400");
  await zoom.fill("900");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("400");
});

test("links in the PDF open their page, or ask the extension to open a web address", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("link", { name: "Go to page 5" }).click();
  await expect(page.getByRole("textbox", { name: "Page" })).toHaveValue("5");
  // The link points 130 points down page 5, which is where the viewer opens.
  const scale =
    (await page.locator('.page[data-page-index="4"]').boundingBox())!.width /
    PAGE_WIDTH;
  await expect
    .poll(async () => Math.abs((await pageOffset(page, 5))! + 130 * scale))
    .toBeLessThan(2);

  await page.getByRole("textbox", { name: "Page" }).fill("2");
  await page.getByRole("textbox", { name: "Page" }).press("Enter");
  await page
    .getByRole("link", { name: "Open https://example.com/paper" })
    .click();
  await expect
    .poll(async () =>
      (await messages(page)).find((message) => message.type === "openExternal"),
    )
    .toEqual({ type: "openExternal", url: "https://example.com/paper" });
});

test("search counts matches across pages and steps through them", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("ControlOrMeta+f");
  const input = page.getByRole("searchbox", { name: "Find in PDF" });
  await expect(input).toBeFocused();
  await input.fill("Second line");
  await expect(page.locator(".search-count")).toHaveText("1 of 12");
  await input.press("Enter");
  await expect(page.locator(".search-count")).toHaveText("2 of 12");
  // The viewer follows the match.
  await expect(page.getByRole("textbox", { name: "Page" })).toHaveValue("2");
  await input.press("Shift+Enter");
  await input.press("Shift+Enter");
  await expect(page.locator(".search-count")).toHaveText("12 of 12");
  await expect(page.getByRole("textbox", { name: "Page" })).toHaveValue("12");

  // Find again while the bar is open focuses it and selects the text.
  await page
    .locator('.page[data-page-index="11"]')
    .click({ position: { x: 10, y: 10 } });
  await expect(input).not.toBeFocused();
  await page.keyboard.press("ControlOrMeta+f");
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([0, 11]);
  await input.press("Escape");
  await expect(input).toHaveCount(0);
});

test("a new search starts at the current page", async ({ page }) => {
  await open(page);
  await page.getByRole("textbox", { name: "Page" }).fill("7");
  await page.getByRole("textbox", { name: "Page" }).press("Enter");
  await page.getByRole("button", { name: "Find in PDF" }).click();
  await page
    .getByRole("searchbox", { name: "Find in PDF" })
    .fill("Second line");
  await expect(page.locator(".search-count")).toHaveText("7 of 12");
  await expect(page.getByRole("textbox", { name: "Page" })).toHaveValue("7");
});
