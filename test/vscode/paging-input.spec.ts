import type { Frame, Page } from "@playwright/test";
import {
  closeAllEditors,
  command,
  expect,
  openFile,
  pdfViewer,
  quickInputTitled,
  statusBarEntry,
  test,
} from "./workbench";

// Arrow keys and trackpad/wheel scrolling in the real editor, with the focus
// wherever it happens to be. The browser tests cover every mode combination.
test.describe.configure({ retries: 2 });

const PDF = "docs/outline.pdf";

const shown = (viewer: Frame): Promise<number[]> =>
  viewer.locator(".page").evaluateAll((pages) =>
    pages.map((element) => Number((element as HTMLElement).dataset.pageIndex)),
  );

const pageEntry = (page: Page, number: number) =>
  statusBarEntry(page, new RegExp(`^Page ${number} / 12$`, "u"));

/** A fresh viewer on the sample PDF in the defaults (continuous, single, vertical, fit width). */
async function openFresh(page: Page): Promise<Frame> {
  await closeAllEditors(page);
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(viewer.locator(".page img").first()).toBeVisible();
  for (const label of [
    "PDF: Continuous Scrolling",
    "PDF: Single Page",
    "PDF: Vertical Scrolling",
    "PDF: Fit Width",
  ])
    await command(page, label);
  await expect(pageEntry(page, 1)).toBeVisible();
  return viewer;
}

/**
 * Press a key once the webview has the keyboard: a command from the palette
 * gives the focus back to the editor a moment after it ran, and a key pressed
 * in that gap goes nowhere.
 */
async function press(page: Page, viewer: Frame, key: string): Promise<void> {
  await expect.poll(() => viewer.evaluate(() => document.hasFocus())).toBe(true);
  await waitForScrollToStop(viewer);
  await page.keyboard.press(key);
}

// A key pressed during a page-turn animation starts from an intermediate place.
async function waitForScrollToStop(viewer: Frame): Promise<void> {
  const position = () =>
    viewer.locator(".viewport").evaluate((v) => `${v.scrollLeft},${v.scrollTop}`);
  // The first sample cannot establish rest; compare across a polling interval.
  let last: string | undefined;
  await expect
    .poll(async () => {
      const now = await position();
      const still = now === last;
      last = now;
      return still;
    }, { intervals: [250] })
    .toBe(true);
}

/** The webview has the keyboard: a click on empty space beside the pages. */
async function focusViewer(page: Page, viewer: Frame): Promise<void> {
  const box = (await viewer.locator(".viewport").boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + box.height / 2);
  await expect.poll(() => viewer.evaluate(() => document.hasFocus())).toBe(true);
}

test("ArrowRight and ArrowLeft move between pages in the default view, right after opening and after a click", async ({
  workbench: page,
}) => {
  const viewer = await openFresh(page);
  // Right after the commands, with no click on the page: they return the focus
  // to the viewer, which takes a moment.
  await expect.poll(() => viewer.evaluate(() => document.hasFocus())).toBe(true);
  await press(page, viewer, "ArrowRight");
  await expect(pageEntry(page, 2)).toBeVisible();
  await press(page, viewer, "ArrowLeft");
  await expect(pageEntry(page, 1)).toBeVisible();
  await focusViewer(page, viewer);
  await press(page, viewer, "ArrowRight");
  await expect(pageEntry(page, 2)).toBeVisible();
  await waitForScrollToStop(viewer);
  const top = () => viewer.locator(".viewport").evaluate((v) => v.scrollTop);
  const beforePageDown = await top();
  await press(page, viewer, "PageDown");
  // PageDown pans a screen: which page is current depends on the window height.
  await expect.poll(top).toBeGreaterThan(beforePageDown);
  await press(page, viewer, "ArrowDown");
  // Left goes to the page before the one being read, which depends on the
  // window's height: press on until the first page.
  for (let i = 0; i < 4; i++) {
    await press(page, viewer, "ArrowLeft");
    await page.waitForTimeout(300);
  }
  await expect(pageEntry(page, 1)).toBeVisible();
});

test("the arrows turn pages in page-by-page single, two-page and cover layouts, and keep working after the View picker", async ({
  workbench: page,
}) => {
  const viewer = await openFresh(page);
  await command(page, "PDF: Fit Page");
  await command(page, "PDF: Page-by-page Scrolling");
  await expect.poll(() => shown(viewer)).toEqual([0]);
  await press(page, viewer, "ArrowRight");
  await expect.poll(() => shown(viewer)).toEqual([1]);
  await press(page, viewer, "ArrowLeft");
  await expect.poll(() => shown(viewer)).toEqual([0]);

  await command(page, "PDF: Two Pages (1–2, 3–4)");
  await expect.poll(() => shown(viewer)).toEqual([0, 1]);
  await press(page, viewer, "ArrowRight");
  await expect.poll(() => shown(viewer)).toEqual([2, 3]);
  await press(page, viewer, "PageUp");
  await expect.poll(() => shown(viewer)).toEqual([0, 1]);

  await command(page, "PDF: Two Pages with Cover (1, 2–3)");
  await expect.poll(() => shown(viewer)).toEqual([0]);
  await press(page, viewer, "ArrowRight");
  await expect.poll(() => shown(viewer)).toEqual([1, 2]);

  // The status bar's View picker takes the focus; the keys work once it closes.
  await page.locator('.part.statusbar [id$="pdfWorkshop.view"]').click();
  await expect(quickInputTitled(page, /^PDF View$/u)).toBeVisible();
  await page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: /^Fit page/iu })
    .click();
  await expect(statusBarEntry(page, /^Fit Page/u)).toBeVisible();
  // The extension gives the keyboard back to the viewer, not the status bar.
  await expect.poll(() => viewer.evaluate(() => document.hasFocus())).toBe(true);
  await press(page, viewer, "ArrowRight");
  await expect.poll(() => shown(viewer)).toEqual([3, 4]);
  await press(page, viewer, "ArrowLeft");
  await expect.poll(() => shown(viewer)).toEqual([1, 2]);

  await command(page, "PDF: Single Page");
  await command(page, "PDF: Horizontal Scrolling");
  await focusViewer(page, viewer);
  const start = (await shown(viewer))[0]!;
  await press(page, viewer, "ArrowRight");
  await expect.poll(async () => (await shown(viewer))[0]).toBeGreaterThan(start);
  await command(page, "PDF: Vertical Scrolling");
  await command(page, "PDF: Continuous Scrolling");
});

test("zoomed in, the arrows pan; wheel and two-finger flicks travel across pages and turn one page in page-by-page mode", async ({
  workbench: page,
}) => {
  const viewer = await openFresh(page);
  await command(page, "PDF: Actual Size (100%)");
  await focusViewer(page, viewer);
  const left = () => viewer.locator(".viewport").evaluate((v) => v.scrollLeft);
  const top = () => viewer.locator(".viewport").evaluate((v) => v.scrollTop);
  // Two pages side by side are wider than the editor even at the top zoom.
  await command(page, "PDF: Two Pages (1–2, 3–4)");
  await focusViewer(page, viewer);
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("ControlOrMeta+Equal");
    await page.waitForTimeout(150);
  }
  await expect
    .poll(() =>
      viewer.locator(".viewport").evaluate((v) => v.scrollWidth - v.clientWidth),
    )
    .toBeGreaterThan(100);
  // The last zoom step has settled: the scrollable width no longer changes.
  const width = () => viewer.locator(".viewport").evaluate((v) => v.scrollWidth);
  let settled = await width();
  await expect
    .poll(async () => {
      const now = await width();
      const same = now === settled;
      settled = now;
      return same;
    }, { intervals: [400] })
    .toBe(true);
  await viewer.locator(".viewport").evaluate((v) => v.scrollTo({ left: 0 }));
  await press(page, viewer, "ArrowRight");
  await expect.poll(left).toBe(40);
  await press(page, viewer, "ArrowLeft");
  await expect.poll(left).toBe(0);

  await command(page, "PDF: Single Page");

  // Continuous: a thousand-pixel notch and a multi-page flick carry on across pages.
  await command(page, "PDF: Actual Size (100%)");
  const box = (await viewer.locator(".viewport").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const start = await top();
  await page.mouse.wheel(0, 1000);
  await expect.poll(top).toBeGreaterThan(start + 900);
  const flick = [2, 9, 30, 100, 200, 300, 300, 200, 100, 60, 30, 12];
  const flickStart = await top();
  // Keep one gesture contiguous even when CDP round trips are slow under load.
  await Promise.all(flick.map((delta) => page.mouse.wheel(0, delta)));
  await expect
    .poll(top)
    .toBeGreaterThan(flickStart + flick.reduce((a, b) => a + b) - 5);

  // Page-by-page: a long flick turns exactly one page.
  await command(page, "PDF: Fit Page");
  await command(page, "PDF: Page-by-page Scrolling");
  await expect(viewer.locator(".viewer")).toHaveAttribute("data-scroll-mode", "paged");
  await expect.poll(() => shown(viewer)).toHaveLength(1);
  const first = (await shown(viewer))[0]!;
  // Send the momentum burst inside the real webview so CDP latency and wheel
  // coalescing cannot turn it into separate notches. The notch above still
  // exercises trusted native wheel input.
  await viewer.locator(".viewport").evaluate((viewport) => {
    for (const deltaY of [20, 60, 120, 200, 260, 260, 220, 170, 120, 80, 50, 30, 20, 10, 5, 2]) {
      viewport.dispatchEvent(new WheelEvent("wheel", {
        deltaY, bubbles: true, cancelable: true,
      }));
    }
  });
  await expect.poll(() => shown(viewer)).toEqual([first + 1]);
  await page.waitForTimeout(500);
  expect(await shown(viewer)).toEqual([first + 1]);
  await command(page, "PDF: Continuous Scrolling");
});
