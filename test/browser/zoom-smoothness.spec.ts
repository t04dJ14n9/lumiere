import { expect, test, type Page } from "@playwright/test";
import { act, lastView, openView } from "./view-controls-support";

/**
 * Zoom smoothness, measured per animation frame while a gesture runs: the
 * displayed width of page 1 (its scale), where a point of the page that was
 * under the pointer ends up, and how many frames showed no loaded page.
 */
interface Frames {
  scales: number[];
  drift: number;
  blankFrames: number;
  settledBlankMs: number;
}

/** Run `events` (one per frame) at (x, y) over the viewport and sample every frame. */
async function measure(
  page: Page,
  events: { deltaY: number; ctrlKey?: boolean; metaKey?: boolean }[],
  settleMs = 900,
): Promise<Frames> {
  const box = (await page.locator(".viewport").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  return page.evaluate(
    async ({ events, x, y, settleMs }) => {
      // Sample two frames after the input, once painted: a rAF callback runs
      // before the frame's layout and resize observers, and reading the layout
      // between a commit and the frame that applies the animation would show
      // the new layout bare, a state that is never on screen.
      const painted = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setTimeout(resolve, 0)),
          ),
        );
      const viewport = document.querySelector(".viewport")!;
      // The page under the pointer, so its point can be followed.
      const index = (
        document
          .elementsFromPoint(x, y)
          .find((element) => element.classList.contains("page")) ??
        document.querySelector(".page")!
      ).getAttribute("data-page-index");
      const first = () =>
        document
          .querySelector(`.page[data-page-index="${index}"]`)!
          .getBoundingClientRect();
      const loaded = () =>
        Array.from(document.querySelectorAll<HTMLImageElement>(".page img")).some(
          (image) => {
            const rect = image.getBoundingClientRect();
            const frame = viewport.getBoundingClientRect();
            return (
              image.complete &&
              image.naturalWidth > 0 &&
              rect.bottom > frame.top &&
              rect.top < frame.bottom
            );
          },
        );
      const start = first();
      const anchor = { u: (x - start.left) / start.width, v: (y - start.top) / start.height };
      const scales: number[] = [start.width];
      let drift = 0;
      let blankFrames = 0;
      const sample = (): void => {
        const rect = first();
        scales.push(rect.width);
        drift = Math.max(
          drift,
          Math.abs(rect.left + anchor.u * rect.width - x),
          Math.abs(rect.top + anchor.v * rect.height - y),
        );
        if (!loaded()) blankFrames++;
      };
      for (const event of events) {
        viewport.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: event.deltaY,
            deltaMode: 0,
            ctrlKey: event.ctrlKey ?? true,
            metaKey: event.metaKey ?? false,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
        await painted();
        sample();
      }
      // After the gesture: wait for the re-render and count time with no loaded page.
      let blankMs = 0;
      let last = performance.now();
      const end = last + settleMs;
      while (performance.now() < end) {
        await painted();
        const now = performance.now();
        sample();
        if (!loaded()) blankMs += now - last;
        last = now;
      }
      return { scales, drift, blankFrames, settledBlankMs: Math.round(blankMs) };
    },
    { events, x, y, settleMs },
  );
}

/** The largest ratio between the displayed widths of two consecutive frames. */
function biggestStep(scales: number[]): number {
  let worst = 1;
  for (let i = 1; i < scales.length; i++) {
    const ratio = scales[i]! / scales[i - 1]!;
    worst = Math.max(worst, ratio, 1 / ratio);
  }
  return worst;
}

const pinchOut = (frames: number, deltaY = -2.5) =>
  Array.from({ length: frames }, () => ({ deltaY }));

test("pinch zoom follows the fingers: no large per-frame jump, the scale tracks the deltas, the point under the pointer stays put, bounded blank time", async ({ page }) => {
  await openView(page, { defaultZoom: "actual", smoothScrolling: true });
  await expect.poll(async () => (await lastView(page))?.zoomPercent, { timeout: 15_000 }).toBe(100);
  await page.waitForTimeout(300);
  const before = (await lastView(page))!.zoomPercent;
  const frames = await measure(page, pinchOut(40));
  console.log("PINCH", JSON.stringify({
    biggestStep: biggestStep(frames.scales),
    drift: Math.round(frames.drift * 10) / 10,
    blankFrames: frames.blankFrames,
    settledBlankMs: frames.settledBlankMs,
    from: frames.scales[0],
    to: frames.scales.at(-1),
  }));
  // Forty deltas of -2.5 are a total of -100: the scale follows exp(100 / 100).
  const expected = Math.min(4, Math.exp(1));
  await expect.poll(async () => (await lastView(page))!.zoomPercent / before).toBeGreaterThan(expected * 0.9);
  expect((await lastView(page))!.zoomPercent / before).toBeLessThan(expected * 1.1);
  expect(biggestStep(frames.scales)).toBeLessThan(1.06);
  expect(frames.drift).toBeLessThan(6);
  expect(frames.blankFrames).toBeLessThanOrEqual(2);
  expect(frames.settledBlankMs).toBeLessThan(250);
});

test("pinching in is as smooth as pinching out", async ({ page }) => {
  // Narrower than the zoomed page, so the pointer's point can stay put (a page
  // narrower than the editor is centred again as it shrinks).
  await page.setViewportSize({ width: 500, height: 1200 });
  await openView(page, { defaultZoom: 400, smoothScrolling: true });
  // From the middle of the document, so no edge clamps the point.
  await page.locator(".viewport").evaluate((v) => v.scrollTo({ left: (v.scrollWidth - v.clientWidth) / 2, top: 3000, behavior: "instant" }));
  await page.waitForTimeout(200);
  const frames = await measure(page, pinchOut(20, 2.5));
  console.log("PINCH-IN", JSON.stringify({ biggestStep: biggestStep(frames.scales), drift: frames.drift, blankFrames: frames.blankFrames, settledBlankMs: frames.settledBlankMs }));
  expect(biggestStep(frames.scales)).toBeLessThan(1.06);
  expect(frames.drift).toBeLessThan(6);
  expect(frames.settledBlankMs).toBeLessThan(250);
});

test("Ctrl+wheel notches, zoom buttons and keys step through the zoom levels without a scale jump larger than a step", async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 1200 });
  await openView(page, { defaultZoom: 200, smoothScrolling: true });
  await page.locator(".viewport").evaluate((v) => v.scrollTo({ left: (v.scrollWidth - v.clientWidth) / 2, top: 3000, behavior: "instant" }));
  await page.waitForTimeout(200);
  const notch = await measure(page, [{ deltaY: -100 }, { deltaY: -100 }], 600);
  console.log("NOTCH", JSON.stringify({ biggestStep: biggestStep(notch.scales), drift: notch.drift, blankFrames: notch.blankFrames, settledBlankMs: notch.settledBlankMs }));
  // Samples are two frames apart, and a slow runner can miss most of an animation:
  // a notch is a step of 1.25 to 1.33, so this only rules out a jump of more than one.
  expect(biggestStep(notch.scales)).toBeLessThan(1.4);
  // Looser than a pinch: a loaded machine can sample the animation a frame late.
  expect(notch.drift).toBeLessThan(24);
  expect(notch.settledBlankMs).toBeLessThan(250);
  const button = await page.evaluate(async () => {
    const widths: number[] = [];
    const page0 = () => document.querySelector(".page")!.getBoundingClientRect().width;
    widths.push(page0());
    (document.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement | null)?.click();
    // Sample once a frame is painted: reading the layout earlier would force
    // it before the animation has been applied to it.
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 0)),
        ),
      );
      widths.push(page0());
    }
    return widths;
  });
  console.log("BUTTON", JSON.stringify({ biggestStep: biggestStep(button), from: button[0], to: button.at(-1) }));
  expect(button.at(-1)).toBeGreaterThan(button[0]!);
  expect(biggestStep(button)).toBeLessThan(1.22);
  await act(page, { action: "zoomOut" });
});

test("reduced motion removes the animation, not the zoom", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openView(page, { defaultZoom: "actual", smoothScrolling: true });
  const frames = await measure(page, pinchOut(20), 500);
  expect(frames.scales.at(-1)).toBeGreaterThan(frames.scales[0]!);
  expect(frames.drift).toBeLessThan(6);
});

test("a jump to a page right after a zoom step is not undone by the zoom's scroll settling", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openView(page, { defaultZoom: 100 });
  await page.waitForTimeout(400);
  await act(page, { action: "zoomIn" });
  await act(page, { action: "goToPage", page: 5 });
  await page.waitForTimeout(900);
  const offset = await page.evaluate(() => {
    const top = document.querySelector(".viewport")!.getBoundingClientRect().top;
    return document.querySelector('.page[data-page-index="4"]')!.getBoundingClientRect().top - top;
  });
  expect(Math.abs(offset)).toBeLessThan(16);
});
