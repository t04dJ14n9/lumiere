import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { servePage } from "./page-server";
import type {} from "./fake-host";

/**
 * Prism grammars load on demand, so highlighting arrives after the first
 * paint. These specs measure how long after: the first fence, twenty languages
 * in one view, and fences scrolled into view later. Chunks come from local
 * disk, as in the extension's webview. Numbers are written to
 * test-results/code-latency.json; the assertions are loose enough for shared
 * runners but catch a load that serialises (a waterfall) or never finishes.
 */
const languages: [string, string][] = [
  ["ts", 'const answer: number = 42; // "x"'],
  ["js", "function f() { return 'x'; }"],
  ["python", 'def f():\n  return "x"'],
  ["rust", 'fn main() { let x = "a"; }'],
  ["go", 'func main() { x := "a" }'],
  ["java", 'public class A { String s = "a"; }'],
  ["c", 'int main() { return 0; } // "x"'],
  ["cpp", "#include <vector>\nstd::vector<int> v;"],
  ["csharp", 'public class A { string s = "a"; }'],
  ["ruby", 'def f; puts "x"; end'],
  ["php", '<?php echo "x"; ?>'],
  ["bash", 'echo "x" && ls -la'],
  ["json", '{ "a": [1, true, null] }'],
  ["yaml", "key: value # comment"],
  ["css", "a { color: #fff; }"],
  ["sql", "SELECT a FROM t WHERE b = 1;"],
  ["kotlin", 'fun main() { val x = "a" }'],
  ["swift", 'let x: String = "a"'],
  ["lua", 'local x = "a" -- c'],
  ["haskell", 'main = putStrLn "x"'],
];

const fence = ([language, code]: [string, string]) =>
  `\`\`\`${language}\n${code}\n\`\`\``;

interface Lat {
  /** Reference time; `open()` start, or the last `mark()`. */
  begin: number;
  /** `times[n]`: ms from `begin` until n code lines carried a token. */
  times: number[];
  mark(): void;
}
declare global {
  interface Window {
    lat: Lat;
  }
}

const shell =
  '<!doctype html><html><head><link rel="stylesheet" href="/dist/webview/editor.css"></head><body><main id="app"></main><script src="/artifacts/fake-host.js"></script></body></html>';

/** Opens `source`, timing from the start of `open()` inside the page. */
async function openTimed(page: Page, source: string): Promise<number> {
  await servePage(page, shell);
  const visible = await page.evaluate(async (text) => {
    const count = () =>
      document.querySelectorAll(".cm-content .cm-line:has(.token)").length;
    const lat: Lat = {
      begin: performance.now(),
      times: [],
      mark() {
        lat.begin = performance.now();
        lat.times = [];
        for (let n = 1; n <= count(); n++) {
          lat.times[n] = 0;
        }
      },
    };
    window.lat = lat;
    new MutationObserver(() => {
      const now = performance.now() - lat.begin;
      for (let n = lat.times.length || 1; n <= count(); n++) {
        lat.times[n] = now;
      }
    }).observe(document.body, { childList: true, subtree: true });
    window.harness = new window.BrowserHost(text);
    await window.harness.open("obsidian");
    return performance.now() - lat.begin;
  }, source);
  await expect(
    page.getByRole("textbox", { name: "Markdown content" }),
  ).toBeVisible();
  return visible;
}

/** Ms from the last mark until `count` code lines carried a token. */
async function until(page: Page, count: number): Promise<number> {
  await expect
    .poll(() => page.evaluate((n) => window.lat.times[n] ?? -1, count), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(0);
  return page.evaluate((n) => window.lat.times[n]!, count);
}

const results: Record<string, number> = {};
test.afterAll(() => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/code-latency.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
});

test.use({ viewport: { width: 1200, height: 3200 } });

test("the first fence is highlighted soon after the editor is on screen", async ({
  page,
}) => {
  const visible = await openTimed(
    page,
    `Intro\n\n${fence(languages[0]!)}\n\nOutro`,
  );
  const first = await until(page, 1);
  results["first fence: editor visible (ms)"] = Math.round(visible);
  results["first fence: highlighted (ms from open)"] = Math.round(first);
  results["first fence: highlight after visible (ms)"] = Math.round(
    Math.max(0, first - visible),
  );
  expect(first - visible).toBeLessThan(2500);
});

test("twenty languages in one view load in parallel, not one after another", async ({
  page,
}) => {
  const visible = await openTimed(
    page,
    languages.map((entry) => `${fence(entry)}\n`).join("\n"),
  );
  const first = await until(page, 1);
  const all = await until(page, languages.length);
  results["20 languages: editor visible (ms)"] = Math.round(visible);
  results["20 languages: first highlighted (ms from open)"] = Math.round(first);
  results["20 languages: all highlighted (ms from open)"] = Math.round(all);
  expect(all - visible).toBeLessThan(6000);
  // A waterfall would take about twenty times the first; parallel loads do not.
  expect(all - first).toBeLessThan(Math.max(1500, 8 * first));
});

test("fences scrolled into view later highlight within a moment", async ({
  page,
}) => {
  const filler = Array.from(
    { length: 400 },
    (_, index) => `Paragraph ${index}.\n`,
  ).join("\n");
  await openTimed(
    page,
    `${filler}\n${languages.map((entry) => `${fence(entry)}\n`).join("\n")}`,
  );
  await expect(page.locator(".cm-content .token")).toHaveCount(0);
  // The harness page scrolls \`#app\`, the editor's host element.
  const scroll = (to: "end" | "start") =>
    page.evaluate((target) => {
      window.lat.mark();
      document.querySelector("#app")!.scrollTop = target === "end" ? 1e9 : 0;
    }, to);
  await scroll("end");
  const first = await until(page, 1);
  const all = await until(page, languages.length);
  results[`scrolled in: first fence highlighted (ms)`] = Math.round(first);
  results[`scrolled in: 20 languages highlighted (ms)`] = Math.round(all);
  expect(all).toBeLessThan(6000);
  // Back to the top and down again: grammars are loaded, so it is immediate.
  await scroll("start");
  await expect(page.locator(".cm-content .token")).toHaveCount(0);
  await scroll("end");
  const again = await until(page, languages.length);
  results["scrolled in again, grammars loaded (ms)"] = Math.round(again);
  expect(again).toBeLessThan(500);
});
