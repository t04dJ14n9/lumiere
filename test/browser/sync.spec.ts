import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";
async function expectText(page: Page, text: string) {
  await expect.poll(() => page.evaluate(() => window.harness.text)).toBe(text);
}
test("rapid typing survives delayed acknowledgement and an external edit", async ({
  page,
}) => {
  const source = "# Note\n\nstart";
  await open(page, source);
  await page.evaluate(() => {
    window.harness.delay = 120;
  });
  await page.evaluate(() =>
    window.harness.reveal(window.harness.session.text.length),
  );
  await page.keyboard.type("-local", { delay: 1 });
  // Insert into the current authoritative snapshot: under a slow scheduler,
  // an initial part of the typing may already have been acknowledged.
  await page.evaluate(() =>
    window.harness.external("external\n" + window.harness.text),
  );
  await expectText(page, "external\n" + source + "-local");
  await expect(page.locator(".cm-content")).toContainText("start-local");
  await expect(page.locator(".sync-status")).toBeEmpty();
});

test("save waits for a queued burst of Unicode input", async ({ page }) => {
  await open(page, "");
  await page.evaluate(() => {
    window.harness.delay = 100;
  });
  await page.keyboard.insertText("你好 🧠 مرحبا\nsecond line");
  await page.keyboard.press("ControlOrMeta+s");
  await expect
    .poll(() => page.evaluate(() => window.harness.saved))
    .toBe("你好 🧠 مرحبا\nsecond line");
});
