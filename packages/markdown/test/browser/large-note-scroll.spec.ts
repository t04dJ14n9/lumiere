/**
 * Scrolling a large note end to end right after it opens runs no long task.
 * Live Preview parses only a little past the viewport when the viewport
 * outruns its syntax tree, and finishes the note in short idle slices; it
 * never parses the whole note inside a scroll's viewport update (which took
 * about 140 ms for this note on an M-series Mac).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";
import { note } from "../support/perf-note";

/**
 * The longest task allowed. Publishing the complete tree still costs its
 * readers (block index, gutter classes) time in proportion to the note,
 * about 35 ms here; the margin is for slower or loaded machines.
 */
const LONGEST_TASK_MS = 100;

/**
 * A page that never idles while it scrolls: every idle callback waits for
 * its timeout. The background parse then lags the scroll, so the viewport
 * keeps outrunning the tree, the case this test is about.
 */
async function starveIdleCallbacks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.requestIdleCallback = ((callback: IdleRequestCallback) =>
      setTimeout(
        () => callback({ didTimeout: true, timeRemaining: () => 0 }),
        50,
      )) as unknown as typeof requestIdleCallback;
    window.cancelIdleCallback = (handle) => clearTimeout(handle);
  });
}

/**
 * Scroll the note's own scroller to its end, several screens a frame,
 * starting at once (a round trip per wheel event would let the background
 * parse finish first). Resolves with the long tasks from the first frame
 * until the background parse has had time to finish and publish.
 */
async function scrollToEndRightAway(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const style = document.createElement("style");
    style.textContent =
      "#app, #app .cm-editor, #app .cm-scroller { height: 700px !important; max-height: 700px !important; } #app .cm-scroller { overflow: auto !important; } .panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }";
    document.head.append(style);
    window.dispatchEvent(new Event("resize"));
    const tasks: number[] = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        tasks.push(Math.round(entry.duration));
      }
    }).observe({ type: "longtask" });
    const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
    while (
      scroller.scrollTop + scroller.clientHeight <
      scroller.scrollHeight - 2
    ) {
      scroller.scrollTop += 6 * scroller.clientHeight;
      await new Promise(requestAnimationFrame);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return tasks;
  });
}

test("scrolling a large note end to end after it opens runs no long task", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  const source = note(24000);
  expect(source.length).toBeGreaterThan(1000000);
  await starveIdleCallbacks(page);
  await open(page, source, "obsidian", {
    features: { vim: { enabled: false, config: {} } },
  });
  const tasks = await scrollToEndRightAway(page);
  await expect(page.getByText("Plain paragraph 23999.")).toBeVisible();
  expect(Math.max(0, ...tasks)).toBeLessThan(LONGEST_TASK_MS);
});
