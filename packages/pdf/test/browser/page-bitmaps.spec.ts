import { expect, test, type Page } from "@playwright/test";
import { act, openView } from "./view-controls-support";

/**
 * Pages turn without a blank: the pages around the one being read have a
 * low-quality bitmap already, shown at once when a page turns, and the full
 * bitmap replaces it when it is ready.
 */
interface Frame {
  at: number;
  shown: string;
  /** Pages on screen without a loaded picture. */
  blank: number;
  low: number;
  full: number;
}

/** The pages on screen now. */
const shownNow = (page: Page): Promise<string> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".page[data-page-index]"))
      .map((p) => p.dataset.pageIndex)
      .join(","),
  );

/** Sample every animation frame for `ms`, while `during` runs in the page. */
function sample(page: Page, ms: number): Promise<Frame[]> {
  return page.evaluate(
    (ms) =>
      new Promise<Frame[]>((resolve) => {
        const frames: Frame[] = [];
        const start = performance.now();
        const tick = (): void => {
          const pages = Array.from(
            document.querySelectorAll<HTMLElement>(".page[data-page-index]"),
          );
          const images = pages.map((p) =>
            p.querySelector<HTMLImageElement>("img.page-image"),
          );
          frames.push({
            at: performance.now() - start,
            shown: pages.map((p) => p.dataset.pageIndex).join(","),
            blank: images.filter(
              (i) => !i || !i.complete || i.naturalWidth === 0,
            ).length,
            low: images.filter((i) => i?.classList.contains("page-image-low"))
              .length,
            full: images.filter(
              (i) => i && !i.classList.contains("page-image-low"),
            ).length,
          });
          if (performance.now() - start < ms) {
            requestAnimationFrame(tick);
          } else {
            resolve(frames);
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** Whether every picture on screen has dark pixels in it (the fixture pages have text). */
function painted(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLImageElement>(".page img.page-image"),
    ).every((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 160;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! < 128) {
          return true;
        }
      }
      return false;
    }),
  );
}

async function open(page: Page, view: object): Promise<void> {
  await page.setViewportSize({ width: 1100, height: 700 });
  await openView(page, view);
  // Fully drawn, and the prefetch has had its time.
  await expect
    .poll(() => page.locator(".page img.page-image-low").count())
    .toBe(0);
  await page.waitForTimeout(1200);
  // Keys go to the viewer, however busy the machine was when it opened.
  await page.locator(".viewport").focus();
}

for (const pageLayout of ["single", "spread"] as const) {
  test(`${pageLayout}, page-by-page: a turn shows a picture at once and the full one replaces it, with no blank frame`, async ({
    page,
  }) => {
    await open(page, {
      scrollMode: "paged",
      pageLayout,
      defaultZoom: "fitPage",
    });
    const before = await shownNow(page);
    const frames = sample(page, 1_500);
    await page.keyboard.press("PageDown");
    const seen = await frames;
    const turned = seen.filter((frame) => frame.shown !== before);
    expect(turned.length, "the turn happened").toBeGreaterThan(5);
    // Not a single frame of the new pages is blank.
    expect(turned.filter((frame) => frame.blank > 0).length).toBe(0);
    // A low picture is what shows first, and the full one comes later.
    expect(turned[0]!.low).toBeGreaterThan(0);
    expect(turned.at(-1)!.low).toBe(0);
    expect(turned.at(-1)!.full).toBeGreaterThan(0);
    expect(await painted(page)).toBe(true);
  });
}

test("rapid turns, forward and back, never show a blank page and end with full pictures", async ({
  page,
}) => {
  await open(page, {
    scrollMode: "paged",
    pageLayout: "spread",
    defaultZoom: "fitPage",
  });
  const frames = sample(page, 2_500);
  for (const key of [
    "PageDown",
    "PageDown",
    "PageDown",
    "PageDown",
    "PageUp",
    "PageUp",
    "PageDown",
    "PageDown",
  ]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(40);
  }
  const seen = await frames;
  // Turned faster than the prefetch can follow (four spreads in a fifth of a second), a page may be reached
  // before it has any picture; the cheap low one comes within a few frames (60 frames is one second).
  expect(seen.filter((frame) => frame.blank > 0).length).toBeLessThanOrEqual(
    12,
  );
  await expect
    .poll(() => page.locator(".page img.page-image-low").count())
    .toBe(0);
  expect(await painted(page)).toBe(true);
});

test("a jump to a page far away paints within a bound, low picture first", async ({
  page,
}) => {
  await open(page, {
    scrollMode: "paged",
    pageLayout: "single",
    defaultZoom: "fitPage",
  });
  const frames = sample(page, 2_000);
  await act(page, { action: "goToPage", page: 11 });
  const seen = await frames;
  const jumped = seen.filter((frame) => frame.shown === "10");
  expect(jumped.length).toBeGreaterThan(0);
  const firstPainted = jumped.find((frame) => frame.blank === 0)!;
  expect(firstPainted, "a picture appeared").toBeTruthy();
  expect(firstPainted.at - jumped[0]!.at).toBeLessThan(800);
  await expect
    .poll(() => page.locator(".page img.page-image-low").count())
    .toBe(0);
  expect(await painted(page)).toBe(true);
});

test("zoomed to 300%, a turn keeps showing a picture while the full one renders", async ({
  page,
}) => {
  await open(page, {
    scrollMode: "paged",
    pageLayout: "spread",
    defaultZoom: 300,
  });
  const before = await shownNow(page);
  const frames = sample(page, 2_500);
  await act(page, { action: "nextPageKeepingPlace" });
  const seen = await frames;
  const turned = seen.filter((frame) => frame.shown !== before);
  expect(turned.length).toBeGreaterThan(5);
  expect(turned.filter((frame) => frame.blank > 0).length).toBeLessThanOrEqual(
    1,
  );
  await expect
    .poll(() => page.locator(".page img.page-image-low").count())
    .toBe(0);
});

test("continuous scrolling: the pages that come into view have a picture and the full one follows", async ({
  page,
}) => {
  await open(page, {
    scrollMode: "continuous",
    pageLayout: "single",
    defaultZoom: "fitWidth",
  });
  const frames = sample(page, 2_000);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(60);
  }
  const seen = await frames;
  expect(seen.filter((frame) => frame.blank > 0).length).toBeLessThanOrEqual(4);
  await expect
    .poll(() => page.locator(".page img.page-image-low").count())
    .toBe(0);
  expect(await painted(page)).toBe(true);
});

test("memory stays bounded: only pages near the one being read keep a picture cached", async ({
  page,
}) => {
  await open(page, {
    scrollMode: "paged",
    pageLayout: "single",
    defaultZoom: "fitPage",
  });
  for (let i = 0; i < 11; i++) {
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(150);
  }
  await expect.poll(() => page.locator(".page img.page-image").count()).toBe(1);
});
