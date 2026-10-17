import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("plain typing remains one undo group across acknowledged transport batches", async ({
  page,
}) => {
  await open(page, "Start\n");
  await page
    .getByRole("textbox", { name: "Markdown content", exact: true })
    .focus();
  await page.keyboard.press("ControlOrMeta+End");
  let expected = "Start\n";
  for (const character of "Hello") {
    await page.keyboard.type(character);
    expected += character;
    await expect
      .poll(() => page.evaluate(() => window.harness.text))
      .toBe(expected);
  }
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("Start\n");
  // Uppercase, as a real keyboard reports it: Playwright on Linux sends
  // key "z" for "Shift+z", which CodeMirror reads as Mod-z (undo).
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(expected);
});

test("moving the plain caret creates a new undo group without losing the earlier typing", async ({
  page,
}) => {
  await open(page, "Start\n");
  await page
    .getByRole("textbox", { name: "Markdown content", exact: true })
    .focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("abc");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("Start\nabc");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("X");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("Start\nabXc");
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("Start\nabc");
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("Start\n");
});
