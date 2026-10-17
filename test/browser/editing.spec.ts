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

test("Ctrl/Cmd+F opens a find bar with a match count and replace", async ({
  page,
}) => {
  await open(page, "one two\nthree two\n");
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByRole("textbox", { name: "Find..." });
  await expect(find).toBeFocused();
  await page.keyboard.insertText("two");
  const count = page.locator(".mw-find-count");
  await expect(count).toHaveText("1 / 2");
  await page.keyboard.press("Enter");
  await expect(count).toHaveText("2 / 2");
  expect(await page.evaluate(() => window.harness.text)).toBe(
    "one two\nthree two\n",
  );
  await page.keyboard.press("ControlOrMeta+h");
  await page.keyboard.insertText("2");
  await page.getByRole("button", { name: "Replace all" }).click();
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("one 2\nthree 2\n");
  await expect(count).toHaveText("No results");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mw-find")).toHaveCount(0);
  await page.keyboard.insertText("!");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("!");
});

test("block math reveals its source on click and arrow entry without a ghost preview", async ({
  page,
}) => {
  await open(page, "before\n\n$$\nx^2\n$$\n\nafter");
  await expect(page.locator(".hybrid-math")).toHaveCount(1);
  await page.locator(".hybrid-math").click();
  // Source only — no second rendered formula under the $$ while editing.
  await expect(page.locator(".hybrid-math")).toHaveCount(0);
  await page.evaluate(() => window.harness.reveal(0));
  await expect(page.locator(".hybrid-math")).toHaveCount(1);
  await page.evaluate(() => window.harness.reveal(7));
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".hybrid-math")).toHaveCount(0);
});
