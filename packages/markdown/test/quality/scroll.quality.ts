/**
 * Scroll smoothness: nothing on the scroll path makes Chromium wait for the
 * page, text stays put while blocks render, frames stay short in a flick
 * straight after opening, and a very long note scrolls without long tasks.
 */
import { expect, test, type Page } from "@playwright/test";
import { installRecorder } from "../perf/recorder";
import { mermaidNote } from "../support/mermaid-note";
import { note as blocksNote } from "../support/perf-note";
import { budgets, record } from "./budgets";
import { browserFactor, frames, installAnchor, openNote } from "./page";

const SCROLL_EVENTS = ["wheel", "mousewheel", "touchstart", "touchmove"];

/**
 * Wheel and touch listeners that are not passive, from the page's own
 * scripts, on the window and anywhere in the document: one on any element
 * under the pointer makes Chromium wait for the page before scrolling.
 */

async function isStickyScrollWheel(
  client: Awaited<ReturnType<Page["context"]>["newCDPSession"]>,
  backendNodeId: number | undefined,
): Promise<boolean> {
  if (backendNodeId === undefined) {
    return false;
  }
  try {
    const { node } = await client.send("DOM.describeNode", { backendNodeId });
    const attrs = node.attributes ?? [];
    for (let index = 0; index < attrs.length; index += 2) {
      if (
        attrs[index] === "class" &&
        (attrs[index + 1] ?? "").split(/\s+/).includes("mw-sticky-scroll")
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function blockingListeners(page: Page): Promise<string[]> {
  const client = await page.context().newCDPSession(page);
  // Only the page's own scripts count, not Playwright's injected ones.
  const urls = new Map<string, string>();
  client.on("Debugger.scriptParsed", (script) =>
    urls.set(script.scriptId, script.url),
  );
  await client.send("Debugger.enable");
  const found: string[] = [];
  for (const [name, depth] of [
    ["window", 0],
    ["document", -1],
  ] as const) {
    const { result } = await client.send("Runtime.evaluate", {
      expression: name,
    });
    const { listeners } = await client.send("DOMDebugger.getEventListeners", {
      objectId: result.objectId!,
      depth,
      pierce: true,
    });
    for (const listener of listeners) {
      const ours = urls
        .get(listener.scriptId)
        ?.startsWith("http://editor.test/");
      if (ours && SCROLL_EVENTS.includes(listener.type) && !listener.passive) {
        // Sticky pin chrome forwards wheel into the note (needs preventDefault).
        // That listener sits on `.mw-sticky-scroll`, not on the content scroll
        // path under the reader's pointer — exclude it from this budget.
        if (
          listener.type === "wheel" &&
          (await isStickyScrollWheel(client, listener.backendNodeId))
        ) {
          continue;
        }
        found.push(
          `${listener.type} (${urls.get(listener.scriptId)!.split("/").pop()}:${listener.lineNumber + 1})`,
        );
      }
    }
  }
  await client.detach();
  return found;
}

async function pointAtText(page: Page): Promise<void> {
  const box = (await page.locator(".cm-content").boundingBox())!;
  await page.mouse.move(box.x + Math.min(200, box.width / 2), 450);
}

test("no wheel or touch listener makes scrolling wait for the page", async ({
  page,
}) => {
  await openNote(page, mermaidNote(6));
  await pointAtText(page);
  await page.mouse.wheel(0, 400);
  await frames(page);
  const blocking = await blockingListeners(page);
  record("blocking-listeners", { blocking });
  expect(blocking).toHaveLength(budgets.blockingScrollListeners);
});

test("text holds still while diagrams, formulas and tables render", async ({
  page,
}) => {
  await openNote(page, mermaidNote(30));
  await installAnchor(page);
  await pointAtText(page);
  const shifts: { step: string; px: number }[] = [];
  const step = async (name: string, move: () => Promise<unknown>) => {
    await move();
    await frames(page);
    // Let CodeMirror finish decoration/measure work from the scroll before we
    // pin an anchor — marking mid-settle reads a transient coords.top (~80px).
    await page.waitForTimeout(150);
    await frames(page);
    if (!(await page.evaluate(() => window.quality.mark()))) {
      return;
    }
    // Long enough for the blocks the move brought on screen to render.
    await page.waitForTimeout(700);
    shifts.push({
      step: name,
      px: Math.round(await page.evaluate(() => window.quality.shift())),
    });
  };
  for (let index = 0; index < 12; index++) {
    await step(`down ${index + 1}`, () => page.mouse.wheel(0, 400));
  }
  await step("jump to 75%", () =>
    page.evaluate(() => window.quality.scrollToFraction(0.75)),
  );
  // A block across the top edge that grows as it finishes rendering (an
  // image loading, a diagram drawn taller than its guess): the text below
  // it must stay where the reader is looking.
  expect(await page.evaluate(() => window.quality.straddle())).toBe(true);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.quality.mark())).toBe(true);
  await page.evaluate(() => window.quality.growStraddling(200));
  await page.waitForTimeout(400);
  shifts.push({
    step: "a block across the top edge grows",
    px: Math.round(await page.evaluate(() => window.quality.shift())),
  });
  for (let index = 0; index < 8; index++) {
    await step(`up ${index + 1}`, () => page.mouse.wheel(0, -400));
  }
  const worst = shifts.reduce((max, item) => (item.px > max.px ? item : max), {
    step: "none",
    px: 0,
  });
  record("text-shift", { worst, steps: shifts.length });
  expect(shifts.length).toBeGreaterThan(15);
  expect(worst.px, `text moved at ${worst.step}`).toBeLessThanOrEqual(
    budgets.textShiftPx,
  );
});

test("a flick straight after opening keeps frames short", async ({ page }) => {
  await openNote(page, mermaidNote(40));
  await page.evaluate(installRecorder);
  await pointAtText(page);
  await page.evaluate(() => window.scrollRecorder.start());
  // Trackpad momentum: from 160 px a frame, decaying, twice.
  for (let flick = 0; flick < 2; flick++) {
    const started = Date.now();
    let index = 0;
    for (let delta = 160; delta > 2; delta *= 0.96, index++) {
      const wait = started + index * 16 - Date.now();
      if (wait > 0) {
        await page.waitForTimeout(wait);
      }
      await page.mouse.wheel(0, Math.round(delta));
    }
  }
  const run = await page.evaluate(() => window.scrollRecorder.stop());
  const intervals = run.frames
    .slice(1)
    .map((time, index) => time - run.frames[index]!);
  const worst = Math.max(0, ...intervals);
  const over50 = intervals.filter((ms) => ms > 50).length;
  const factor = await browserFactor(page);
  record("flick", { worst, over50, frames: intervals.length, factor });
  expect(worst).toBeLessThanOrEqual(budgets.flickWorstFrameMs * factor);
  expect(over50).toBeLessThanOrEqual(budgets.flickFramesOver50);
});

test("scrolling through a 1 MB note runs no long task", async ({ page }) => {
  const source = blocksNote(24_000);
  expect(source.length).toBeGreaterThan(1_000_000);
  await openNote(page, source);
  await page.evaluate(() => {
    const tasks: number[] = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        tasks.push(entry.duration);
      }
    }).observe({ type: "longtask" });
    (window as unknown as { tasks: number[] }).tasks = tasks;
  });
  await pointAtText(page);
  for (let index = 0; index < 40; index++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(30);
  }
  for (const fraction of [0.5, 0.9, 0.25]) {
    await page.evaluate((value) => {
      const scroller = document.querySelector(".cm-scroller")!;
      scroller.scrollTop =
        (scroller.scrollHeight - scroller.clientHeight) * value;
    }, fraction);
    await page.waitForTimeout(300);
  }
  const tasks = await page.evaluate(
    () => (window as unknown as { tasks: number[] }).tasks,
  );
  const longest = Math.max(0, ...tasks);
  const parse = await page.evaluate(() => window.calibrationParseMs());
  record("large-note-scroll", { longest, tasks: tasks.length, parse });
  expect(longest).toBeLessThanOrEqual(budgets.largeNoteTaskParses * parse);
});
