import { test, expect } from "@playwright/test";
import { open } from "./harness";
test("minimal preset synchronizes Unicode typing, saves and undoes with host authority", async ({
  page,
}) => {
  await open(page, "first\r\nsecond", "minimal");
  await page.evaluate(() => window.harness.reveal(12));
  await page.keyboard.insertText("你好 🧠");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("first\r\nsecond你好 🧠");
  await page.keyboard.press("ControlOrMeta+s");
  await expect
    .poll(() => page.evaluate(() => window.harness.saved))
    .toBe("first\r\nsecond你好 🧠");
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("first\r\nsecond");
  // Uppercase, as a real keyboard reports it: Playwright on Linux sends
  // key "z" for "Shift+z", which CodeMirror reads as Mod-z (undo).
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("first\r\nsecond你好 🧠");
});
test("selection export captures the acknowledged revision after delayed Unicode typing", async ({
  page,
}) => {
  await open(page, "first\r\nsecond");
  await page.evaluate(() => {
    window.harness.delay = 30;
  });
  await page.evaluate(() => window.harness.reveal(12));
  await page.keyboard.insertText("你好 🧠");
  await page.keyboard.press("Shift+Home");
  const selected = await page.evaluate(() => window.harness.capture());
  expect(selected.text).toBe("second你好 🧠");
  expect(selected.version).toBe(
    await page.evaluate(() => window.harness.session.version),
  );
});
test("two panels of the same note share text while retaining independent selections", async ({
  page,
}) => {
  await open(page, "one\ntwo", "minimal");
  await page.evaluate(async () => {
    await window.harness.open("minimal");
    await window.harness.reveal(0, 0, 0);
    await window.harness.reveal(7, 7, 1);
  });
  await page.keyboard.insertText("!");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("one\ntwo!");
  expect((await page.evaluate(() => window.harness.capture(0))).from).toBe(0);
  expect((await page.evaluate(() => window.harness.capture(1))).from).toBe(8);
});
test("Live Preview reveals syntax at the caret and toggles to source without reloading", async ({
  page,
}) => {
  await open(page, "**Bold**\n\nTail");
  await page.evaluate(() => window.harness.reveal(14));
  await expect(page.locator(".cm-content")).not.toContainText("**");
  await page.evaluate(() => window.harness.reveal(3));
  await expect(page.locator(".cm-content")).toContainText("**Bold**");
  await page.evaluate(async () => {
    await window.harness.reveal(14);
    await window.harness.mode();
  });
  await expect(page.locator(".cm-content")).toContainText("**Bold**");
  await page.evaluate(() => window.harness.mode());
  await expect(page.locator(".cm-content")).not.toContainText("**");
});
test("disposing the livePreview fiber removes its widgets and decorations", async ({
  page,
}) => {
  await open(page, "Start\n\n<div>Box</div>\n\n---\n\nTail");
  const widgets = page.locator(".cm-content .hybrid-block");
  const rule = page.locator(".cm-content .md-hr-line");
  await expect(widgets).toHaveCount(1);
  await expect(rule).toHaveCount(1);
  await expect(rule).not.toContainText("---");
  await page.evaluate(async () => {
    const root = window.harness.views[0]!;
    const fiber = [...root.plugins].find(
      (f) => f.definition.name === "livePreview",
    )!;
    await fiber.dispose();
    await root.settled();
  });
  await expect(widgets).toHaveCount(0);
  await expect(rule).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("<div>Box</div>");
  await expect(page.locator(".cm-content")).toContainText("---");
});
