import { test, expect } from "@playwright/test";
import { open } from "./harness";
test("restoring a pane retains backward selection without changing source or history", async ({
  page,
}) => {
  const source = "# Body\n\nOriginal text\n\nEnd";
  await open(page, source);
  await page.evaluate(
    (pos) => window.harness.reveal(pos),
    source.indexOf("Original") + 8,
  );
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  const saved = await page.evaluate(() => window.harness.viewState());
  expect(saved.anchor).toBeGreaterThan(saved.head);
  await page.unrouteAll({ behavior: "wait" });
  await open(page, source);
  await page.evaluate((state) => window.harness.restore(state), saved);
  expect(await page.evaluate(() => window.harness.text)).toBe(source);
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.type("X");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(source.replace("Original", "OX"));
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(source);
});
test("captured Source mode follows the current view and restores without document edits", async ({
  page,
}) => {
  await open(page, "**Bold**\n\nTail");
  await page.evaluate(async () => {
    await window.harness.reveal(14);
    await window.harness.mode();
  });
  const saved = await page.evaluate(() => window.harness.viewState());
  expect(saved.mode).toBe("source");
  await page.unrouteAll({ behavior: "wait" });
  await open(page, "**Bold**\n\nTail");
  await page.evaluate((state) => window.harness.restore(state), saved);
  await expect(page.locator(".cm-content")).toContainText("**Bold**");
  expect(await page.evaluate(() => window.harness.session.version)).toBe(0);
});
