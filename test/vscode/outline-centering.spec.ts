import { test, expect, chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import {
  closeBrowser,
  command,
  openWorkbench,
  workbenchPage,
} from "./workbench";

/** Within this many pixels counts as centred: half a line of rounding. */
const TOLERANCE = 8;
const FILLER = Array.from({ length: 80 }, (_, n) => `Filler ${n}.`).join(
  "\n\n",
);
const NOTE = [
  "# Title",
  "## Early",
  FILLER,
  "## Middle",
  FILLER,
  "## Late",
  FILLER,
  "## Last",
].join("\n\n");

async function editorFrame(page: Page): Promise<Frame> {
  for (const frame of page.frames()) {
    if (await frame.locator(".cm-line").count()) {
      return frame;
    }
  }
  throw new Error("No Lumière frame");
}

async function geometry(frame: Frame, title: string) {
  return frame.evaluate((title) => {
    const scroller = document.querySelector(".cm-scroller")!;
    const box = scroller.getBoundingClientRect();
    const line = [...document.querySelectorAll(".cm-line")].find(
      (candidate) => candidate.textContent?.replace(/^#+ /, "") === title,
    );
    const rect = line?.getBoundingClientRect();
    return {
      viewportCenter: box.top + box.height / 2,
      viewportTop: box.top,
      viewportBottom: box.bottom,
      headingCenter: rect ? rect.top + rect.height / 2 : undefined,
      scrollTop: scroller.scrollTop,
      maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
    };
  }, title);
}

/** Clicks a heading in the Markdown Outline view of the Explorer, as a user does. */
async function clickOutline(page: Page, title: string) {
  const header = page.getByRole("button", { name: "Markdown Outline Section" });
  if ((await header.getAttribute("aria-expanded")) !== "true") {
    await header.click();
  }
  const row = page
    .locator(".pane-body .monaco-list-row")
    .filter({ has: page.getByText(title, { exact: true }) });
  await expect(row.first()).toBeVisible();
  await row.first().click();
}

async function expectCentred(page: Page, title: string) {
  await expect
    .poll(async () => {
      const g = await geometry(await editorFrame(page), title);
      return Math.abs((g.headingCenter ?? Infinity) - g.viewportCenter);
    })
    .toBeLessThanOrEqual(TOLERANCE);
}

test("clicking a heading in the Markdown Outline centres it in the editor, clamping at both ends of the note", async () => {
  const note = path.join(paths.workspace, "Note.md");
  const original = readFileSync(note, "utf8");
  writeFileSync(note, NOTE);
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    await command(page, "View: Show Explorer");
    await clickOutline(page, "Middle");
    await expectCentred(page, "Middle");
    await clickOutline(page, "Late");
    await expectCentred(page, "Late");

    // Centring "Early" would need a negative scroll: the note stays at the top.
    await clickOutline(page, "Early");
    await expect
      .poll(
        async () =>
          (await geometry(await editorFrame(page), "Early")).scrollTop,
      )
      .toBe(0);
    const early = await geometry(await editorFrame(page), "Early");
    expect(early.headingCenter!).toBeLessThan(early.viewportCenter - TOLERANCE);
    expect(early.headingCenter!).toBeGreaterThan(early.viewportTop);

    // "Last" is the final line, so the scroll range ends before it can reach the middle.
    await clickOutline(page, "Last");
    await expect
      .poll(async () => {
        const g = await geometry(await editorFrame(page), "Last");
        return Math.abs(g.scrollTop - g.maxScrollTop);
      })
      .toBeLessThanOrEqual(1);
    const last = await geometry(await editorFrame(page), "Last");
    expect(last.headingCenter!).toBeGreaterThan(
      last.viewportCenter + TOLERANCE,
    );
    expect(last.headingCenter!).toBeLessThan(last.viewportBottom);
  } finally {
    writeFileSync(note, original);
    await closeBrowser(browser);
  }
});
