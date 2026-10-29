/**
 * The browser harness as the quality checks use it: a note filling the
 * window like the webview's, the machine's speed, and the editor's view.
 */
import type { Page } from "@playwright/test";
import { servePage } from "../browser/page-server";

/** Fastest parse of the calibration note in Chromium on the reference machine (ms). */
export const REFERENCE_BROWSER_PARSE_MS = 5.5;

/** How much slower than the reference machine this page runs, at least 1. */
export async function browserFactor(page: Page): Promise<number> {
  const measured = await page.evaluate(() => window.calibrationParseMs());
  return Math.max(1, measured / REFERENCE_BROWSER_PARSE_MS);
}

const PAGE =
  '<!doctype html><html><head><link rel="stylesheet" href="/dist/webview/editor.css"></head><body><main id="app"></main><script src="/artifacts/fake-host.js"></script></body></html>';

/**
 * Open `source` as the harness does, and wait until every feature has
 * loaded. Times are from asking the editor to open the note: the harness
 * loads all of Lumière as one test bundle first, which the real webview
 * does not.
 */
export async function openNote(
  page: Page,
  source: string,
): Promise<{ firstPaint: number; features: number }> {
  await servePage(page, PAGE);
  const opened = await page.evaluate(async (text) => {
    window.harness = new window.BrowserHost(text);
    window.harness.trusted = false;
    window.harness.features = {};
    window.harness.videoDetails = {};
    window.harness.notes = {};
    const started = performance.now();
    await window.harness.open("obsidian");
    const mark = (name: string) =>
      performance.getEntriesByName(name)[0]?.startTime;
    while (mark("mw:features") === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return {
      firstPaint: mark("mw:first-paint")! - started,
      features: mark("mw:features")! - started,
    };
  }, source);
  // The webview mounts the editor straight into `#app`; the harness wraps it
  // in a panel, so make that panel fill the window the same way.
  await page.addStyleTag({
    content:
      "#app > section.panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  return opened;
}

/** Two animation frames: whatever the last input started has painted. */
export function frames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/**
 * Remember a line of plain text near the top of the window, and later how
 * far it has moved on screen. Lines inside rendered blocks are skipped.
 */
export async function installAnchor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    let anchor: { pos: number; top: number } | undefined;
    let straddling: HTMLElement | undefined;
    (window as unknown as { quality: unknown }).quality = {
      mark() {
        const rect = view.scrollDOM.getBoundingClientRect();
        anchor = undefined;
        for (let y = rect.top + 80; y < rect.bottom - 40; y += 12) {
          const pos = view.posAtCoords({ x: rect.left + 80, y }, false);
          if (pos === null || view.lineBlockAt(pos).type !== 0) {
            continue;
          }
          const line = view.state.doc.lineAt(pos);
          const coords = line.text.trim() ? view.coordsAtPos(line.from) : null;
          if (coords) {
            anchor = { pos: line.from, top: coords.top };
            return true;
          }
        }
        return false;
      },
      shift() {
        if (!anchor) {
          return 0;
        }
        const coords = view.coordsAtPos(anchor.pos);
        return coords ? Math.abs(coords.top - anchor.top) : Infinity;
      },
      /** Scroll so a rendered block crosses the top edge, if there is one. */
      straddle() {
        const blocks = [...view.contentDOM.children].filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement &&
            !element.classList.contains("cm-line") &&
            element.getBoundingClientRect().height > 120,
        );
        const block = blocks[Math.floor(blocks.length / 2)];
        if (!block) {
          return false;
        }
        const scroller = view.scrollDOM;
        scroller.scrollTop +=
          block.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          60;
        straddling = block;
        return true;
      },
      /** Grow the block across the top edge by `px`, as a late render does. */
      growStraddling(px: number) {
        const extra = document.createElement("div");
        extra.style.height = `${px}px`;
        straddling?.append(extra);
      },
      scrollToFraction(fraction: number) {
        view.scrollDOM.scrollTop = Math.round(
          (view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight) *
            fraction,
        );
      },
    };
  });
}

declare global {
  interface Window {
    quality: {
      mark(): boolean;
      shift(): number;
      straddle(): boolean;
      growStraddling(px: number): void;
      scrollToFraction(fraction: number): void;
    };
  }
}
