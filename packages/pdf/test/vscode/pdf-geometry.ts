import { expect, type Frame, type Page } from "@playwright/test";

export const PAGE_WIDTH = 300;
const FIT_MARGIN = 48;

/** Whether 1-based page `number` starts at the top of the viewer. */
export function pageAtTop(viewer: Frame, number: number): Promise<boolean> {
  return viewer.evaluate((index) => {
    const viewport = document
      .querySelector(".viewport")!
      .getBoundingClientRect();
    const page = document
      .querySelector(`.page[data-page-index="${index}"]`)
      ?.getBoundingClientRect();
    return Boolean(page) && Math.abs(page!.top - viewport.top) <= 16;
  }, number - 1);
}

/** Whether the point `top` PDF points down 1-based page `number` is at the top of the viewer. */
export function pointAtTop(
  viewer: Frame,
  number: number,
  top: number,
): Promise<boolean> {
  return viewer.evaluate(
    ([index, top, pageWidth]) => {
      const viewport = document
        .querySelector(".viewport")!
        .getBoundingClientRect();
      const page = document
        .querySelector(`.page[data-page-index="${index}"]`)
        ?.getBoundingClientRect();
      return (
        Boolean(page) &&
        Math.abs(page!.top + top * (page!.width / pageWidth) - viewport.top) <=
          2
      );
    },
    [number - 1, top, PAGE_WIDTH] as const,
  );
}

/**
 * Whether the first page fits inside the viewer at its current zoom, and fills
 * it in one direction (less the page margins), as fit page leaves it.
 */
export function pageFit(
  viewer: Frame,
): Promise<{ fitsWidth: boolean; fitsHeight: boolean; fills: boolean }> {
  return viewer.evaluate((margin) => {
    const viewport = document.querySelector(".viewport")!;
    const page = document
      .querySelector('.page[data-page-index="0"]')!
      .getBoundingClientRect();
    const { clientWidth: width, clientHeight: height } = viewport;
    return {
      fitsWidth: page.width <= width,
      fitsHeight: page.height <= height,
      fills: page.width >= width - margin || page.height >= height - margin,
    };
  }, FIT_MARGIN);
}

/**
 * A point given in PDF points on page `number`, both for the mouse (window
 * pixels) and inside the viewer frame (for `elementFromPoint`).
 */
export async function pagePoint(viewer: Frame, number: number) {
  const page = viewer.locator(`.page[data-page-index="${number - 1}"]`);
  const onScreen = (await page.boundingBox())!;
  const inFrame = await page.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y };
  });
  const scale = onScreen.width / PAGE_WIDTH;
  return (x: number, y: number) => ({
    screen: [onScreen.x + x * scale, onScreen.y + y * scale] as [
      number,
      number,
    ],
    frame: [inFrame.x + x * scale, inFrame.y + y * scale] as [number, number],
  });
}

export type Point = { screen: [number, number]; frame: [number, number] };

export async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(...from.screen);
  await page.mouse.down();
  await page.mouse.move(...to.screen, { steps: 8 });
  await page.mouse.up();
}

/** Drag across text once the viewer shows a text cursor there, as a reader would. */
export async function selectText(
  page: Page,
  viewer: Frame,
  from: Point,
  to: Point,
): Promise<void> {
  // The cursor changes on pointer movement, so keep nudging while waiting.
  let nudge = 0;
  await expect
    .poll(async () => {
      nudge = 1 - nudge;
      await page.mouse.move(from.screen[0] + nudge, from.screen[1]);
      return viewer.evaluate(
        ([x, y]) =>
          getComputedStyle(document.elementFromPoint(x, y) as Element).cursor,
        from.frame,
      );
    })
    .toBe("text");
  await drag(page, from, to);
}
