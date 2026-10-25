import { expect, test } from "@playwright/test";
import { open } from "./harness";

test("renders inline PDF embeds with @embedpdf/pdfium, supports #page=N and #height=H, and passes #page=N on Open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const doc = [
    "# Inline PDF Embeds",
    "",
    "![[sample.pdf#page=1&height=360]]",
    "",
  ].join("\n");
  await open(page, doc);

  const pdfEmbed = page.locator(".pdf-embed").first();
  await expect(pdfEmbed).toBeVisible();
  await expect(pdfEmbed).toHaveAttribute("data-pdf-height", "360");
  await expect(pdfEmbed).toHaveCSS("height", "360px");
  await expect(pdfEmbed.locator(".pdf-page-numbers")).toHaveText("Page 1 / 1");

  const canvas = pdfEmbed.locator("canvas.pdf-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-page-number", "1");
  await expect
    .poll(() =>
      canvas.evaluate(
        (el: HTMLCanvasElement) => el.width >= 600 && el.height > 200,
      ),
    )
    .toBe(true);

  const openBtn = pdfEmbed.locator(".pdf-open-button");
  await openBtn.click();
  await expect
    .poll(() => page.evaluate(() => window.harness.opened.at(-1)))
    .toBe("sample.pdf#page=1");
});
