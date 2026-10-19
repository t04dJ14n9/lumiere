/**
 * CPU profile of opening a note in the browser harness (the real plugins and
 * editor, a fake host): prints the heaviest functions by self time.
 * Usage: tsx scripts/profile-open.ts [blocks]
 */
import { chromium } from "@playwright/test";
import { servePage } from "../test/browser/page-server";
import { note } from "../test/support/perf-note";

async function main() {
  const blocks = Number(process.argv[2] ?? 16000);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await servePage(
    page,
    '<!doctype html><html><head><link rel="stylesheet" href="/dist/webview/editor.css"></head><body><main id="app"></main><script src="/artifacts/fake-host.js"></script></body></html>',
  );
  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 200 });
  await client.send("Profiler.start");
  const started = Date.now();
  await page.evaluate(async (source) => {
    const w = window as unknown as {
      harness: { open(preset: string): Promise<void> };
      BrowserHost: new (source: string) => {
        open(preset: string): Promise<void>;
      };
    };
    w.harness = new w.BrowserHost(source);
    await w.harness.open("obsidian");
  }, note(blocks));
  await page.getByRole("textbox", { name: "Markdown content" }).waitFor();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  );
  const elapsed = Date.now() - started;
  const { profile } = (await client.send("Profiler.stop")) as {
    profile: {
      nodes: {
        id: number;
        callFrame: { functionName: string; url: string; lineNumber: number };
        children?: number[];
      }[];
      samples: number[];
      timeDeltas: number[];
    };
  };
  const self = new Map<number, number>();
  profile.samples.forEach((id, index) => {
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0));
  });
  const byFunction = new Map<string, number>();
  const parent = new Map<number, number>();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parent.set(child, node.id);
    }
  }
  for (const node of profile.nodes) {
    const time = self.get(node.id) ?? 0;
    const { functionName, url, lineNumber } = node.callFrame;
    const key = `${functionName || "(anonymous)"} ${url.split("/").pop()}:${lineNumber}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + time);
  }
  // Inclusive time per function (each sample counted once per distinct function on its stack).
  const inclusive = new Map<string, number>();
  const label = new Map<number, string>();
  for (const node of profile.nodes) {
    const { functionName, url, lineNumber } = node.callFrame;
    label.set(
      node.id,
      `${functionName || "(anonymous)"} ${url.split("/").pop()}:${lineNumber}`,
    );
  }
  profile.samples.forEach((id, index) => {
    const seen = new Set<string>();
    for (
      let at: number | undefined = id;
      at !== undefined;
      at = parent.get(at)
    ) {
      seen.add(label.get(at)!);
    }
    for (const key of seen) {
      inclusive.set(
        key,
        (inclusive.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0),
      );
    }
  });
  console.log("--- inclusive");
  for (const [key, time] of [...inclusive]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 45)) {
    console.log(`${String(Math.round(time / 1000)).padStart(6)} ms  ${key}`);
  }
  console.log(`open took ${elapsed} ms (${blocks} blocks)`);
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`sampled ${Math.round(total / 1000)} ms`);
  for (const [key, time] of [...byFunction]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)) {
    console.log(`${String(Math.round(time / 1000)).padStart(6)} ms  ${key}`);
  }
  await browser.close();
}
void main();
