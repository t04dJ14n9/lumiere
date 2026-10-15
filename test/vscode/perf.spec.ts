import { test, expect, chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import { closeBrowser, openWorkbench, workbenchPage } from "./workbench";
import { note } from "../support/perf-note";

interface Sample {
  /** Choosing the editor to its content on screen (first animation frame after the plugins are up). */
  firstPaintMs: number;
  /** Webview script start, relative to the choice. */
  scriptStartMs: number;
  /** `ready` answered by the host, relative to the choice. */
  readyMs: number;
  /** All plugins applied. */
  pluginsMs: number;
  /** A key (Ctrl+End) changes the editor's DOM. */
  keyMs: number;
  heapMb: number;
  domNodes: number;
  scripts: { name: string; kb: number; ms: number }[];
}

async function frameOf(page: Page): Promise<Frame> {
  for (const frame of page.frames()) {
    if (
      await frame.getByRole("textbox", { name: "Markdown content" }).count()
    ) {
      return frame;
    }
  }
  throw new Error("No Markdown Workshop frame");
}

async function sample(page: Page, file: string): Promise<Sample> {
  const timing: { start?: number; end?: number } = {};
  const content = await openWorkbench(page, file, timing);
  const frame = await frameOf(page);
  await expect(frame.locator(".cm-line").first()).toBeVisible();
  const marks = await frame.evaluate(() => {
    const at = (name: string) =>
      performance.timeOrigin +
      (performance.getEntriesByName(name)[0]?.startTime ?? NaN);
    const memory = (
      performance as unknown as { memory?: { usedJSHeapSize: number } }
    ).memory;
    return {
      main: at("mw:main"),
      ready: at("mw:ready"),
      plugins: at("mw:plugins"),
      paint: at("mw:first-paint"),
      heap: (memory?.usedJSHeapSize ?? 0) / 1048576,
      nodes: document.getElementsByTagName("*").length,
      scripts: performance
        .getEntriesByType("resource")
        .filter((entry) => /\.(js|wasm)(\?|$)/.test(entry.name))
        .map((entry) => ({
          name: entry.name.split("/").pop()!.split("?")[0]!,
          kb: Math.round(
            ((entry as PerformanceResourceTiming).encodedBodySize || 0) / 1024,
          ),
          ms: Math.round(entry.duration),
        })),
    };
  });
  const start = timing.start!;
  await content.click();
  await frame.evaluate(() => {
    const target = document.querySelector(".cm-editor")!;
    (window as unknown as { keyed: Promise<number> }).keyed = new Promise(
      (resolve) => {
        const before = performance.now();
        new MutationObserver(() => resolve(performance.now() - before)).observe(
          target,
          {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
          },
        );
      },
    );
  });
  await page.keyboard.press("Control+End");
  const keyMs = await frame.evaluate(
    () => (window as unknown as { keyed: Promise<number> }).keyed,
  );
  return {
    firstPaintMs: Math.round(marks.paint - start),
    scriptStartMs: Math.round(marks.main - start),
    readyMs: Math.round(marks.ready - start),
    pluginsMs: Math.round(marks.plugins - start),
    keyMs: Math.round(keyMs),
    heapMb: Math.round(marks.heap),
    domNodes: marks.nodes,
    scripts: marks.scripts.sort((a, b) => b.kb - a.kb).slice(0, 8),
  };
}

/** The activation line the extension writes to its output channel. */
function activation(): string {
  const logs = path.join(paths.userData, "logs");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/Markdown Workshop\.log$/.test(entry)) {
        found.push(full);
      }
    }
  };
  walk(logs);
  const line = found
    .flatMap((file) => readFileSync(file, "utf8").split("\n"))
    .find((text) => text.includes("Activated in"));
  return line?.replace(/^.*Activated in /, "") ?? "n/a";
}

function bundles(): Record<string, number> {
  const sizeOf = (dir: string, pattern: RegExp) =>
    readdirSync(dir)
      .filter((name) => pattern.test(name))
      .reduce((sum, name) => sum + statSync(path.join(dir, name)).size, 0);
  const dist = path.join(paths.repository, "dist");
  return {
    extensionJs: statSync(path.join(dist, "extension.js")).size,
    webviewEntryJs: statSync(path.join(dist, "webview", "editor.js")).size,
    webviewAllJs: sizeOf(path.join(dist, "webview"), /\.js$/),
    webviewCss: sizeOf(path.join(dist, "webview"), /\.css$/),
  };
}

test("load time: small and 16,000-block notes", async () => {
  test.setTimeout(300_000);
  const blocks = Number(process.env.PERF_BLOCKS ?? 16000);
  writeFileSync(path.join(paths.workspace, "Small.md"), note(24));
  writeFileSync(path.join(paths.workspace, "Big.md"), note(blocks));
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const results: Record<string, Sample> = {};
    results["small, cold"] = await sample(page, "Small.md");
    results[`${blocks} blocks`] = await sample(page, "Big.md");
    const report = { activation: activation(), bundles: bundles(), results };
    console.log(`PERF ${JSON.stringify(report, null, 1)}`);
    writeFileSync(
      process.env.PERF_OUT ?? path.join(paths.root, "perf.json"),
      JSON.stringify(report, null, 2),
    );
  } finally {
    await closeBrowser(browser);
  }
});
