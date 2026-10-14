import { test, expect, chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  closeBrowser,
  command,
  openWorkbench,
  workbenchPage,
} from "./workbench";
import { paths, readState } from "./state";

function noteWithCodeBlock(): string {
  const prose = (prefix: string, count: number) =>
    Array.from(
      { length: count },
      (_unused, index) =>
        `${prefix} ${String(index + 1).padStart(3, "0")} ${"p".repeat(56)}`,
    );
  const code = Array.from(
    { length: 220 },
    (_unused, index) =>
      `const value_${String(index + 1).padStart(3, "0")} = ${index + 1};`,
  );
  return [
    ...prose("before", 90),
    "```ts",
    ...code,
    "```",
    ...prose("after", 60),
    "",
  ].join("\n");
}

async function editorFrame(page: Page): Promise<Frame> {
  for (const frame of page.frames()) {
    if (await frame.locator(".cm-scroller").count()) {
      return frame;
    }
  }
  throw new Error("No Markdown Workbench editor frame");
}

test("native: dragging upward in a fenced code block keeps the editor scroll position", async () => {
  const notePath = path.join(paths.workspace, "Note.md");
  const original = readFileSync(notePath, "utf8");
  writeFileSync(notePath, noteWithCodeBlock());
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    const editorFrameHandle = await editorFrame(page);

    await editorFrameHandle.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".cm-scroller");
      if (!scroller) {
        throw new Error("Missing editor scroller");
      }
      scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
    });
    await page.waitForTimeout(200);

    const codeLines = editorFrameHandle
      .locator(".cm-content > .cm-line")
      .filter({ hasText: "const value_" });
    const count = await codeLines.count();
    expect(count).toBeGreaterThanOrEqual(20);
    const from = await codeLines.nth(Math.floor(count * 0.75)).boundingBox();
    const to = await codeLines.nth(Math.floor(count * 0.25)).boundingBox();
    if (!from || !to) {
      throw new Error("Missing drag endpoints");
    }
    const before = await editorFrameHandle.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".cm-scroller");
      if (!scroller) {
        throw new Error("Missing editor scroller");
      }
      return scroller.scrollTop;
    });

    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 14 });
    await page.waitForTimeout(200);
    const during = await editorFrameHandle.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".cm-scroller");
      if (!scroller) {
        throw new Error("Missing editor scroller");
      }
      return scroller.scrollTop;
    });
    await page.mouse.up();

    expect(Math.abs(during - before)).toBeLessThanOrEqual(2);
  } finally {
    writeFileSync(notePath, original);
    await closeBrowser(browser);
  }
});

test("native (with Note Outline visible): code-block upward drag keeps editor scroll position", async () => {
  const notePath = path.join(paths.workspace, "Note.md");
  const original = readFileSync(notePath, "utf8");
  writeFileSync(notePath, noteWithCodeBlock());
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    await command(page, "View: Show Explorer");
    await expect(
      page.getByRole("button", { name: "Note Outline Section" }).first(),
    ).toBeVisible({ timeout: 10000 });
    const editorFrameHandle = await editorFrame(page);

    await editorFrameHandle.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".cm-scroller");
      if (!scroller) {
        throw new Error("Missing editor scroller");
      }
      scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
    });
    await page.waitForTimeout(200);

    const codeLines = editorFrameHandle
      .locator(".cm-content > .cm-line")
      .filter({ hasText: "const value_" });
    const count = await codeLines.count();
    expect(count).toBeGreaterThanOrEqual(20);
    const from = await codeLines.nth(Math.floor(count * 0.75)).boundingBox();
    const to = await codeLines.nth(Math.floor(count * 0.25)).boundingBox();
    if (!from || !to) {
      throw new Error("Missing drag endpoints");
    }
    const before = await editorFrameHandle.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".cm-scroller");
      if (!scroller) {
        throw new Error("Missing editor scroller");
      }
      return scroller.scrollTop;
    });

    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 14 });
    await page.waitForTimeout(200);
    const during = await editorFrameHandle.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".cm-scroller");
      if (!scroller) {
        throw new Error("Missing editor scroller");
      }
      return scroller.scrollTop;
    });
    await page.mouse.up();

    expect(Math.abs(during - before)).toBeLessThanOrEqual(2);
  } finally {
    writeFileSync(notePath, original);
    await closeBrowser(browser);
  }
});
