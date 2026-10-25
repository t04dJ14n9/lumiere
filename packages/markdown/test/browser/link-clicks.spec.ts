/**
 * BH-020: plain click on a rendered LP link reveals source / places caret;
 * Mod-click follows. Footnotes are a separate path and are not covered here.
 */
import { expect, test } from "@playwright/test";
import { open } from "./harness";

test("plain click on a rendered wikilink reveals source; Mod-click follows", async ({
  page,
}) => {
  const source = "See [[Target|the target note]] and more.";
  await open(page, source);
  await page.evaluate((p) => window.harness.reveal(p), source.length);
  const link = page.locator(".md-link-rendered").first();
  await expect(link).toBeVisible();
  await expect(link).toHaveText("the target note");

  const before = await page.evaluate(() => window.harness.opened.length);
  const box = await link.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect
    .poll(async () => {
      const html = await page.evaluate(
        () => document.querySelector(".cm-line")?.innerHTML ?? "",
      );
      return html.includes("[[Target|") && !html.includes("md-link-rendered");
    })
    .toBe(true);
  expect(await page.evaluate(() => window.harness.opened.length)).toBe(before);

  // Re-reveal so the link renders again, then Mod-click to follow.
  await page.evaluate((p) => window.harness.reveal(p), source.length);
  const again = page.locator(".md-link-rendered").first();
  await expect(again).toBeVisible();
  await again.click({ modifiers: ["ControlOrMeta"] });
  await expect
    .poll(() => page.evaluate(() => window.harness.opened.at(-1)))
    .toBe("Target");
});

test("plain click on a rendered markdown link does not open; Mod-click opens", async ({
  page,
}) => {
  const source = "See [Example](https://example.com) here.";
  await open(page, source);
  await page.evaluate((p) => window.harness.reveal(p), source.length);
  const link = page.locator(".md-link-rendered").first();
  await expect(link).toBeVisible();
  const before = await page.evaluate(() => window.harness.opened.length);
  await link.click();
  await expect
    .poll(async () => {
      const html = await page.evaluate(
        () => document.querySelector(".cm-line")?.innerHTML ?? "",
      );
      return (
        html.includes("](https://example.com)") || html.includes("[Example]")
      );
    })
    .toBe(true);
  expect(await page.evaluate(() => window.harness.opened.length)).toBe(before);

  await page.evaluate((p) => window.harness.reveal(p), source.length);
  await page
    .locator(".md-link-rendered")
    .first()
    .click({
      modifiers: ["ControlOrMeta"],
    });
  await expect
    .poll(() => page.evaluate(() => window.harness.opened.at(-1)))
    .toBe("https://example.com");
});
