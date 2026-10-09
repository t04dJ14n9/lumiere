import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("a footnote preview near the right edge stays inside the webview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 480 });
  const footnote = `[^1]: ${"A long footnote that wraps. ".repeat(12)}`;
  // Fill the first line so the reference sits at its right end.
  await open(page, `x\n\n${footnote}`);
  const room = await page
    .locator(".cm-line")
    .first()
    .evaluate((line) => {
      const range = document.createRange();
      range.selectNodeContents(line.firstChild!);
      const glyph = range.getBoundingClientRect().width;
      const style = getComputedStyle(line);
      const width =
        line.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      return Math.floor(width / glyph);
    });
  const filler = "x".repeat(Math.max(1, room - 2));
  await open(page, `${filler}[^1]\n\nafter\n\n${footnote}`);
  const reference = page.locator(".cm-line .mw-footnote-ref").first();
  await expect(reference).toHaveText("1");
  const viewport = page.viewportSize()!;
  expect((await reference.boundingBox())!.x).toBeGreaterThan(
    viewport.width * 0.6,
  );
  await reference.hover();
  const preview = reference.locator(".footnote-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("A long footnote");
  await expect
    .poll(() =>
      preview.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const root = document.documentElement;
        return box.left >= 0 && box.right <= root.clientWidth;
      }),
    )
    .toBe(true);
});
