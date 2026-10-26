/**
 * Scroll smoothness through a long note with many Mermaid diagrams.
 *
 * Each scenario opens the note fresh (so every diagram renders cold), scrolls
 * it one way, and reports frame times, long animation frames, input latency,
 * layout shifts, CodeMirror's scroll corrections, and how long diagrams stay
 * blank on screen. Run with `pnpm measure:scroll`; set SCROLL_SECTIONS,
 * SCROLL_THROTTLE (CPU slowdown), SCROLL_ONLY (scenario names), SCROLL_NOTE
 * (`mermaid` or `plain`), SCROLL_PROFILE=1 (CPU profile by module) and
 * SCROLL_OUT (a JSON file for the results).
 */
import { test, type CDPSession, type Page } from "@playwright/test";
import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { open } from "../browser/harness";
import { mermaidNote, plainNote } from "../support/mermaid-note";
import { installRecorder, type FrameRecord } from "./recorder";
import { summarise, type CpuProfile } from "./profile";

const SECTIONS = Number(process.env.SCROLL_SECTIONS ?? 40);
const THROTTLE = Number(process.env.SCROLL_THROTTLE ?? 1);
const ONLY = process.env.SCROLL_ONLY?.split(",");
const NOTE = process.env.SCROLL_NOTE === "plain" ? "plain" : "mermaid";
const PROFILE = process.env.SCROLL_PROFILE === "1";
const OUT = process.env.SCROLL_OUT;
const BUNDLE = path.resolve("artifacts/fake-host.js");

interface Driver {
  page: Page;
  /** Wall-clock input latency per event (how long the browser took to accept it). */
  latency: number[];
}

type Scenario = (driver: Driver) => Promise<void>;

/** Send `deltas` as wheel events, one per frame (16 ms) of wall time. */
async function wheelAt60(driver: Driver, deltas: number[]): Promise<void> {
  const start = Date.now();
  for (let index = 0; index < deltas.length; index++) {
    const due = start + index * 16;
    const wait = due - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    const sent = Date.now();
    await driver.page.mouse.wheel(0, deltas[index]!);
    driver.latency.push(Date.now() - sent);
  }
}

async function pressAt(
  driver: Driver,
  key: string,
  count: number,
  intervalMs: number,
): Promise<void> {
  const start = Date.now();
  for (let index = 0; index < count; index++) {
    const due = start + index * intervalMs;
    const wait = due - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    const sent = Date.now();
    await driver.page.keyboard.press(key);
    driver.latency.push(Date.now() - sent);
  }
}

const scenarios: Record<string, Scenario> = {
  /** A mouse wheel spun fast: 100 px per frame for 6 s. */
  async wheel(driver) {
    await wheelAt60(driver, Array<number>(375).fill(100));
  },
  /** Trackpad flicks: momentum from 160 px a frame, decaying, eight times. */
  async flick(driver) {
    const flick: number[] = [];
    for (let delta = 160; delta > 2; delta *= 0.96) {
      flick.push(Math.round(delta));
    }
    for (let count = 0; count < 8; count++) {
      await wheelAt60(driver, flick);
    }
  },
  /**
   * Reading: a short wheel burst (about a screen), then a pause long enough
   * for diagrams to render, through the note. The next burst meets whatever
   * the pause started.
   */
  async read(driver) {
    for (let burst = 0; burst < 40; burst++) {
      await wheelAt60(driver, Array<number>(8).fill(100));
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  },
  /** Vim Ctrl+D held: key repeat at 30 a second. */
  async halfPage(driver) {
    await pressAt(driver, "Control+d", 150, 33);
  },
  /** Vim `j` held: key repeat at 30 a second, through every block. */
  async lineDown(driver) {
    await pressAt(driver, "j", 300, 33);
  },
  /** PageDown held, without Vim. */
  async pageDown(driver) {
    await pressAt(driver, "PageDown", 120, 33);
  },
  /** The scrollbar thumb dragged: 900 px a frame to the end. */
  async drag(driver) {
    await driver.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
          const step = () => {
            const before = scroller.scrollTop;
            window.scrollRecorder.ownWrite(() => {
              scroller.scrollTop = before + 900;
            });
            if (
              scroller.scrollTop + scroller.clientHeight >=
              scroller.scrollHeight - 2
            ) {
              resolve();
            } else {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }),
    );
  },
};

function quantile(values: number[], q: number): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function summary(record: FrameRecord, latency: number[], settleMs: number) {
  const intervals = record.frames
    .slice(1)
    .map((time, index) => time - record.frames[index]!);
  const elapsed = (record.frames.at(-1) ?? 0) - (record.frames[0] ?? 0);
  const blankFrames = record.blank.filter((count) => count > 0).length;
  const heightDrift = record.heights
    .slice(1)
    .reduce(
      (sum, height, index) => sum + Math.abs(height - record.heights[index]!),
      0,
    );
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    seconds: round(elapsed / 1000),
    frames: record.frames.length,
    fps: round((record.frames.length / elapsed) * 1000),
    frameP50: round(quantile(intervals, 0.5)),
    frameP95: round(quantile(intervals, 0.95)),
    frameP99: round(quantile(intervals, 0.99)),
    frameMax: round(Math.max(0, ...intervals)),
    framesOver50ms: intervals.filter((ms) => ms > 50).length,
    framesOver100ms: intervals.filter((ms) => ms > 100).length,
    longFrames: record.loafs.length,
    longFrameBlockingMs: Math.round(
      record.loafs.reduce((sum, loaf) => sum + loaf.blocking, 0),
    ),
    inputP50: quantile(latency, 0.5),
    inputP95: quantile(latency, 0.95),
    inputMax: Math.max(0, ...latency),
    layoutShift: round(record.shifts.reduce((sum, value) => sum + value, 0)),
    shiftSources: Object.fromEntries(
      Object.entries(record.shiftSources)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => [name, round(value)]),
    ),
    corrections: record.corrections.length,
    correctionPx: Math.round(
      record.corrections.reduce((sum, value) => sum + Math.abs(value), 0),
    ),
    heightDriftPx: Math.round(heightDrift),
    diagramsPainted: record.diagramLatency.length,
    diagramLatencyP50: Math.round(quantile(record.diagramLatency, 0.5)),
    diagramLatencyP95: Math.round(quantile(record.diagramLatency, 0.95)),
    blankDiagramFramesPct: round((blankFrames / record.blank.length) * 100),
    pendingAtStop: record.pendingAtStop,
    settleMs: Number.isFinite(settleMs) ? Math.round(settleMs) : "timeout",
    worstFrames: [...record.loafs]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 4)
      .map((loaf) => ({
        ms: Math.round(loaf.duration),
        layoutMs: Math.round(loaf.layout),
        scripts: loaf.scripts,
      })),
  };
}

/**
 * The webview mounts the editor straight into `#app`; the harness wraps it in
 * a panel, so make that panel fill the window the same way.
 */
async function fillWindow(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "#app > section.panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  const fits = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
    return scroller.clientHeight <= window.innerHeight;
  });
  if (!fits) {
    throw new Error("The editor does not fill the window");
  }
}

async function startProfile(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  if (THROTTLE > 1) {
    await client.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  }
  if (PROFILE) {
    await client.send("Profiler.enable");
    await client.send("Profiler.setSamplingInterval", { interval: 250 });
    await client.send("Profiler.start");
  }
  return client;
}

async function stopProfile(client: CDPSession) {
  if (!PROFILE) {
    return undefined;
  }
  const { profile } = await client.send("Profiler.stop");
  if (process.env.SCROLL_PROFILE_RAW) {
    writeFileSync(process.env.SCROLL_PROFILE_RAW, JSON.stringify(profile));
  }
  return summarise(profile as unknown as CpuProfile, BUNDLE);
}

for (const [name, scenario] of Object.entries(scenarios)) {
  test(`${NOTE} note, ${SECTIONS} sections: ${name}`, async ({ page }) => {
    test.skip(Boolean(ONLY && !ONLY.includes(name)), "not selected");
    await page.setViewportSize({ width: 1280, height: 900 });
    const source =
      NOTE === "plain" ? plainNote(SECTIONS) : mermaidNote(SECTIONS);
    const vim = name === "halfPage" || name === "lineDown";
    await open(page, source, "obsidian", {
      features: vim ? { vim: { enabled: true, config: {} } } : {},
    });
    await fillWindow(page);
    await page.evaluate(installRecorder);
    const box = (await page.locator(".cm-content").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, 450);
    if (!["wheel", "flick", "read", "drag"].includes(name)) {
      await page.locator(".cm-content").click({ position: { x: 40, y: 10 } });
    }
    // Let the first screen render and go idle, as after opening a note.
    await page.evaluate(() => window.scrollRecorder.settled(10_000));
    await page.waitForTimeout(500);
    const client = await startProfile(page);
    const driver: Driver = { page, latency: [] };
    await page.evaluate(() => window.scrollRecorder.start());
    await scenario(driver);
    const record = await page.evaluate(() => window.scrollRecorder.stop());
    const settleMs = await page.evaluate(() =>
      window.scrollRecorder.settled(10_000),
    );
    const cpu = await stopProfile(client);
    const result = {
      note: NOTE,
      sections: SECTIONS,
      throttle: THROTTLE,
      scenario: name,
      ...summary(record, driver.latency, settleMs),
      ...(cpu && { cpu }),
    };
    console.log(`SCROLL ${JSON.stringify(result, null, 1)}`);
    if (OUT) {
      appendFileSync(OUT, `${JSON.stringify(result)}\n`);
    }
  });
}
