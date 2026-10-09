import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("Tab and Shift+Tab indent list items and keep focus in the note", async ({
  page,
}) => {
  await open(page, "- one\n- two");
  await page.evaluate(() => window.harness.reveal(11));
  await page.keyboard.press("Tab");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("- one\n\t- two");
  await page.keyboard.insertText("x");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("- one\n\t- twox");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.insertText("y");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("- one\n- twoxy");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest(".cm-content")),
    ),
  ).toBe(true);
});

test("Enter continues a list and an empty item leaves it", async ({ page }) => {
  await open(page, "- one");
  await page.evaluate(() => window.harness.reveal(5));
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("after");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("- one\n- two\nafter");
});
