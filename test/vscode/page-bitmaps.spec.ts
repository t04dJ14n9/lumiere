import type { Frame } from "@playwright/test";
import { command, expect, openFile, pdfViewer, test } from "./workbench";

// Turning pages in the real editor: the pages around the one being read have a
// low bitmap already, so a turn never shows a blank page, and the full bitmap
// replaces it.

const PDF = "docs/outline.pdf";

interface Sample {
  shown: string;
  blank: number;
  low: number;
}

/** Sample every frame in the viewer for `ms`. */
function sample(viewer: Frame, ms: number): Promise<Sample[]> {
  return viewer.evaluate(
    (ms) =>
      new Promise<Sample[]>((resolve) => {
        const frames: Sample[] = [];
        const start = performance.now();
        const tick = (): void => {
          const pages = Array.from(document.querySelectorAll<HTMLElement>(".page[data-page-index]"));
          const images = pages.map((p) => p.querySelector<HTMLImageElement>("img.page-image"));
          frames.push({
            shown: pages.map((p) => p.dataset.pageIndex).join(","),
            blank: images.filter((i) => !i || !i.complete || i.naturalWidth === 0).length,
            low: images.filter((i) => i?.classList.contains("page-image-low")).length,
          });
          if (performance.now() - start < ms) requestAnimationFrame(tick);
          else resolve(frames);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test("turning pages in two-page page-by-page mode never shows a blank page, even turned quickly, and the full bitmaps follow", async ({
  workbench: page,
}) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(viewer.locator(".page img").first()).toBeVisible();
  await command(page, "PDF: Two Pages (1–2, 3–4)");
  await command(page, "PDF: Page-by-page Scrolling");
  await command(page, "PDF: Fit Page");
  try {
    await expect.poll(() => viewer.locator(".page img.page-image-low").count()).toBe(0);
    await page.waitForTimeout(1500);
    await expect.poll(() => viewer.evaluate(() => document.hasFocus())).toBe(true);
    const frames = sample(viewer, 3_000);
    for (const key of ["PageDown", "PageDown", "PageDown", "PageUp", "PageDown"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(120);
    }
    const seen = await frames;
    expect(new Set(seen.map((frame) => frame.shown)).size, "pages turned").toBeGreaterThan(2);
    // Turned faster than the prefetch follows, a page can be reached before it has any picture; the low one comes within a few frames.
    expect(seen.filter((frame) => frame.blank > 0).length).toBeLessThanOrEqual(12);
    await expect.poll(() => viewer.locator(".page img.page-image-low").count()).toBe(0);
    await expect.poll(() => viewer.locator(".page img.page-image").count()).toBe(2);
  } finally {
    await command(page, "PDF: Continuous Scrolling");
    await command(page, "PDF: Single Page");
  }
});
