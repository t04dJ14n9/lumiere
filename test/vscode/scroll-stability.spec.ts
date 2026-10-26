// Scrolling a long, mixed note in a real VS Code (or Cursor, with
// VSCODE_EXECUTABLE): the text must not jump while diagrams, math, tables
// and images finish rendering, a wheel step must move the note by what it
// asked, and frames must keep coming while the reader flicks through it.
// Each measure is logged, so a run doubles as a report (SCROLL lines).
import { test, expect, chromium } from "@playwright/test";
import type { CDPSession, Frame, Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import { closeBrowser, openWorkbench, workbenchPage } from "./workbench";

const SECTIONS = 40;

/** A diagram that takes Mermaid some time: a 14-node flowchart, or a sequence. */
function diagram(n: number): string[] {
  if (n % 2) {
    return [
      "```mermaid",
      "flowchart TD",
      ...Array.from(
        { length: 13 },
        (_, i) =>
          `  N${n}x${i}[Step ${i} of ${n}] --> N${n}x${i + 1}{Check ${i}}`,
      ),
      "```",
    ];
  }
  return [
    "```mermaid",
    "sequenceDiagram",
    ...Array.from(
      { length: 8 },
      (_, i) => `  Alice${i % 3}->>Bob${i % 2}: Message ${i} in ${n}`,
    ),
    "```",
  ];
}

function section(n: number): string {
  return [
    `## Section ${n}`,
    `Paragraph ${n}: **bold**, *italic*, a [[Note]] link and \`code\`. `.repeat(
      4,
    ),
    ...diagram(n),
    `$$\\sum_{k=1}^{${n}} k^2 = \\frac{${n}(${n}+1)(2\\cdot${n}+1)}{6}$$`,
    "| Name | Value | Note |",
    "| --- | ---: | --- |",
    ...Array.from({ length: 4 }, (_, r) => `| Row ${r} | ${n * r} | cell |`),
    `> [!note] Callout ${n}`,
    "> A callout with two lines,",
    "> to give it some height.",
    "![[diagram.svg]]",
    "```js",
    `function section${n}() {`,
    `  return ${n};`,
    "}",
    "```",
    `- [ ] Task ${n}`,
    `- [x] Done ${n}`,
  ].join("\n\n");
}

const NOTE = [
  "# Scroll stability",
  ...Array.from({ length: SECTIONS }, (_, n) => section(n + 1)),
].join("\n\n");

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" rx="12" fill="#cde"/><circle cx="80" cy="80" r="40" fill="#36c"/></svg>';

async function editorFrame(page: Page): Promise<Frame> {
  for (const frame of page.frames()) {
    if (await frame.locator(".cm-line").count()) {
      return frame;
    }
  }
  throw new Error("No Lumière frame");
}

/** The editor's box in the workbench, where the wheel goes. */
async function editorCenter(page: Page): Promise<{ x: number; y: number }> {
  const frames = page.locator("iframe.webview.ready");
  for (let i = 0; i < (await frames.count()); i++) {
    const box = await frames.nth(i).boundingBox();
    if (box && box.width > 200 && box.height > 200) {
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
  }
  throw new Error("No editor webview on screen");
}

interface Anchor {
  readonly text: string;
  readonly top: number;
  readonly scrollTop: number;
}

/** The line just below the top of the view, where the reader's eye is. */
function anchor(frame: Frame): Promise<Anchor> {
  return frame.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller")!;
    const box = scroller.getBoundingClientRect();
    const lines = [...document.querySelectorAll(".cm-content > .cm-line")];
    const line =
      lines.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.top >= box.top + 40 && (candidate.textContent ?? "").trim();
      }) ?? lines[0]!;
    return {
      text: (line.textContent ?? "").slice(0, 60),
      top: line.getBoundingClientRect().top,
      scrollTop: scroller.scrollTop,
    };
  });
}

/** Frame intervals and long tasks in the editor's page, from now until `stop`. */
async function startRecording(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const record = {
      gaps: [] as number[],
      long: 0,
      longest: 0,
      running: true,
    };
    (window as unknown as { __scroll: typeof record }).__scroll = record;
    let last = performance.now();
    const tick = (now: number) => {
      record.gaps.push(now - last);
      last = now;
      if (record.running) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        record.long += entry.duration;
        record.longest = Math.max(record.longest, entry.duration);
      }
    }).observe({ type: "longtask", buffered: false });
  });
}

async function stopRecording(frame: Frame) {
  return frame.evaluate(() => {
    const record = (
      window as unknown as {
        __scroll: {
          gaps: number[];
          long: number;
          longest: number;
          running: boolean;
        };
      }
    ).__scroll;
    record.running = false;
    const gaps = record.gaps.slice(1).sort((a, b) => a - b);
    const at = (q: number) =>
      gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))] ?? 0;
    return {
      frames: gaps.length,
      p50: at(0.5),
      p95: at(0.95),
      max: gaps.at(-1) ?? 0,
      over50: gaps.filter((gap) => gap > 50).length,
      longTasks: record.long,
      longest: record.longest,
    };
  });
}

const settle = (page: Page, ms = 700) => page.waitForTimeout(ms);

/**
 * Wheel and touch listeners that are not passive, on the way from the
 * editor's scroller up to the window: the browser must wait for the page's
 * main thread before it scrolls past one, so a busy page stutters.
 */
async function blockingListeners(page: Page, frame: Frame): Promise<string[]> {
  // The webview shares the workbench's session, so find its context there.
  const chain = await frame.evaluate(() => {
    const selectors: string[] = [];
    let node: Element | null = document.querySelector(".cm-scroller");
    for (let i = 0; node; i++, node = node.parentElement) {
      node.setAttribute("data-scroll-path", String(i));
      selectors.push(`[data-scroll-path="${i}"]`);
    }
    // CodeMirror listens on the content and the gutters, under the scroller.
    for (const [i, inner] of [".cm-content", ".cm-gutters"].entries()) {
      const node = document.querySelector(inner);
      node?.setAttribute("data-scroll-path", `inner-${i}`);
      if (node) {
        selectors.push(`[data-scroll-path="inner-${i}"]`);
      }
    }
    return selectors;
  });
  // The webview runs in its own process; its inner frame shares the session
  // of the outer webview frame, so walk up to the first frame that has one.
  let cdp: CDPSession | undefined;
  for (
    let owner: Frame | null = frame;
    owner && !cdp;
    owner = owner.parentFrame()
  ) {
    cdp = await page
      .context()
      .newCDPSession(owner)
      .catch(() => undefined);
  }
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
  }
  try {
    const contexts: number[] = [];
    // Only the page's own world reports the page's listeners.
    cdp.on("Runtime.executionContextCreated", (event) => {
      if ((event.context.auxData as { isDefault?: boolean })?.isDefault) {
        contexts.push(event.context.id);
      }
    });
    await cdp.send("Runtime.enable");
    let contextId: number | undefined;
    for (const id of contexts) {
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: `!!document.querySelector('[data-scroll-path="0"]')`,
        contextId: id,
        returnByValue: true,
      });
      if (result.value === true) {
        contextId = id;
        break;
      }
    }
    if (contextId === undefined) {
      throw new Error("The editor's page has no script context.");
    }
    const targets: [string, string][] = [
      ["window", "window"],
      ["document", "document"],
      ...chain.map((selector): [string, string] => [
        selector,
        `document.querySelector('${selector}')`,
      ]),
    ];
    const found: string[] = [];
    for (const [label, expression] of targets) {
      const { result } = await cdp.send("Runtime.evaluate", {
        expression,
        contextId,
        objectGroup: "audit",
      });
      if (!result.objectId) {
        continue;
      }
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
        objectId: result.objectId,
      });
      await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "audit" });
      for (const listener of listeners) {
        if (
          /^(wheel|mousewheel|touchstart|touchmove)$/.test(listener.type) &&
          !listener.passive &&
          // Playwright's own, for its clicks.
          !listener.handler?.description?.includes("_hitTargetInterceptor")
        ) {
          found.push(
            `${listener.type} on ${label}: ${(listener.handler?.description ?? "").replace(/\s+/g, " ").slice(0, 160)}`,
          );
        }
      }
    }
    return found;
  } finally {
    await cdp.detach();
  }
}

test("scrolling a long mixed note keeps the text still and the frames coming", async () => {
  test.setTimeout(240_000);
  const note = path.join(paths.workspace, "Note.md");
  const original = readFileSync(note, "utf8");
  writeFileSync(note, NOTE);
  writeFileSync(path.join(paths.workspace, "diagram.svg"), SVG);
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    const frame = await editorFrame(page);
    await expect(frame.locator(".cm-line").first()).toBeVisible();
    await settle(page, 300);
    const center = await editorCenter(page);
    await page.mouse.move(center.x, center.y);

    // 0. A trackpad flick straight after opening, through diagrams not drawn
    // yet: momentum, as the trackpad sends it, decaying to a stop.
    await startRecording(frame);
    for (let event = 0, delta = 90; delta >= 2; event++) {
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(8);
      delta = event < 20 ? 90 : Math.floor(delta * 0.94);
    }
    await settle(page, 1500);
    const coldFlick = await stopRecording(frame);
    await frame.evaluate(() => {
      document.querySelector(".cm-scroller")!.scrollTop = 0;
    });
    await settle(page, 1500);

    // 1. Step down: each step moves the note by what the wheel asked, and the
    // line in view stays put while what is around it finishes rendering.
    const shifts: number[] = [];
    const misses: number[] = [];
    for (let step = 0; step < 24; step++) {
      const before = await anchor(frame);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(120);
      const early = await anchor(frame);
      await settle(page);
      const late = await anchor(frame);
      if (late.text === early.text) {
        shifts.push(Math.abs(late.top - early.top));
      }
      misses.push(Math.abs(late.scrollTop - before.scrollTop - 400));
    }

    // 2. Flick: quick wheel events, as a trackpad sends them.
    await startRecording(frame);
    for (let event = 0; event < 60; event++) {
      await page.mouse.wheel(0, event < 40 ? 120 : -120);
      await page.waitForTimeout(16);
    }
    await settle(page, 1000);
    const flick = await stopRecording(frame);

    // 3. A far jump, as when dragging the scrollbar, then reading upward.
    await frame.evaluate(() => {
      const scroller = document.querySelector(".cm-scroller")!;
      scroller.scrollTop = scroller.scrollHeight * 0.75;
    });
    await page.waitForTimeout(120);
    const landed = await anchor(frame);
    await settle(page, 1500);
    const rested = await anchor(frame);
    const landingShift =
      rested.text === landed.text
        ? Math.abs(rested.top - landed.top)
        : Infinity;
    const upShifts: number[] = [];
    for (let step = 0; step < 10; step++) {
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(120);
      const early = await anchor(frame);
      await settle(page);
      const late = await anchor(frame);
      if (late.text === early.text) {
        upShifts.push(Math.abs(late.top - early.top));
      }
    }

    // 4. Nothing on the way to the scroller makes the wheel or a touch wait
    // for the page: Chromium waits on the page for the first event of each
    // gesture when a listener might cancel it.
    const blocking = await blockingListeners(page, frame);

    const report = {
      blocking,
      host: process.env.VSCODE_EXECUTABLE ?? "VS Code (downloaded)",
      stepShiftMax: Math.max(...shifts),
      stepShifts: shifts.filter((shift) => shift > 2).length,
      stepsCompared: shifts.length,
      wheelMissMax: Math.max(...misses),
      coldFlick,
      flick,
      landingShift,
      upShiftMax: Math.max(...upShifts),
      upShifts: upShifts.filter((shift) => shift > 2).length,
    };
    console.log(`SCROLL ${JSON.stringify(report)}`);
    test.info().annotations.push({
      type: "scroll",
      description: JSON.stringify(report),
    });

    expect.soft(blocking, "listeners that hold up scrolling").toEqual([]);
    expect
      .soft(report.stepShiftMax, "text moving after a step")
      .toBeLessThanOrEqual(2);
    expect
      .soft(report.wheelMissMax, "a step off what the wheel asked")
      .toBeLessThanOrEqual(24);
    expect
      .soft(landingShift, "text moving after a far jump")
      .toBeLessThanOrEqual(2);
    expect
      .soft(report.upShiftMax, "text moving while reading up")
      .toBeLessThanOrEqual(2);
    // Frame timing varies with the machine's load, so these are loose: they
    // catch a hitch of the kind a render inside the scroll frame makes.
    for (const [name, frames] of Object.entries({ coldFlick, flick })) {
      expect
        .soft(frames.over50, `${name}: frames over 50 ms`)
        .toBeLessThanOrEqual(2);
      expect
        .soft(frames.p95, `${name}: 95th percentile frame`)
        .toBeLessThanOrEqual(25);
    }
  } finally {
    writeFileSync(note, original);
    await closeBrowser(browser);
  }
});
