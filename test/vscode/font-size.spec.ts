import { test, expect, chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import { closeBrowser, openWorkbench, workbenchPage } from "./workbench";
import {
  FONT_NOTE,
  HEADING_SCALES,
  gutterOffsets,
  sizes,
} from "../support/font-metrics";

async function editorFrame(page: Page): Promise<Frame> {
  for (const frame of page.frames()) {
    if (await frame.locator(".cm-line").count()) {
      return frame;
    }
  }
  throw new Error("No Markdown Workbench frame");
}

/** Settings.json changes reach the open note live, without reloading it. */
function setSettings(file: string, original: string, extra: object) {
  writeFileSync(
    file,
    JSON.stringify({ ...(JSON.parse(original) as object), ...extra }),
  );
}

test("markdownWorkbench.editor.fontSize sets the note's body size (16px by default, never editor.fontSize) and everything scales with it, live", async () => {
  const settingsFile = path.join(paths.userData, "User", "settings.json");
  const original = readFileSync(settingsFile, "utf8");
  const note = path.join(paths.workspace, "Note.md");
  const text = readFileSync(note, "utf8");
  writeFileSync(note, FONT_NOTE);
  // The global and [markdown] editor sizes are deliberately different.
  setSettings(settingsFile, original, {
    "editor.fontSize": 27,
    "[markdown]": { "editor.fontSize": 31 },
  });
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    const frame = await editorFrame(page);
    // The caret at the end keeps every heading and the table rendered.
    await frame.getByRole("textbox", { name: "Markdown content" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await expect(frame.locator(".md-h6")).toBeVisible();
    // Marks the page: the editor must not reload when the setting changes.
    await frame.evaluate(() => {
      (window as unknown as { marker: number }).marker = 1;
    });

    for (const size of [undefined, 12, 20, 32, 16]) {
      setSettings(settingsFile, original, {
        "editor.fontSize": 27,
        "[markdown]": { "editor.fontSize": 31 },
        ...(size === undefined
          ? {}
          : { "markdownWorkbench.editor.fontSize": size }),
      });
      const expected = size ?? 16;
      await expect.poll(async () => (await sizes(frame)).body).toBe(expected);
      const measured = await sizes(frame);
      const label = `${expected}px`;
      measured.headings.forEach((heading, index) => {
        expect(heading / measured.body, `${label} H${index + 1}`).toBeCloseTo(
          HEADING_SCALES[index]!,
          2,
        );
      });
      expect(measured.inlineCode, `${label} inline code`).toBe(expected);
      expect(measured.codeLine, `${label} code block`).toBe(expected);
      expect(measured.tableCell, `${label} table`).toBe(expected);
      expect(measured.properties, `${label} properties`).toBe(expected);
      expect(measured.footnoteRef / expected, `${label} footnote`).toBeCloseTo(
        0.7,
        2,
      );
      expect(
        measured.footnoteDefinition / expected,
        `${label} footnote text`,
      ).toBeCloseTo(0.875, 2);
      expect(measured.lineNumber, `${label} line numbers`).toBe(expected);

      // Every number sits level with its line, after the live change.
      await expect
        .poll(async () => {
          const rows = await gutterOffsets(frame);
          return Math.max(
            ...rows.map((row) =>
              Math.max(
                Math.abs(row.top),
                Math.abs(row.height),
                Math.abs(row.textOffset ?? 0),
              ),
            ),
          );
        })
        .toBeLessThan(1.5);
    }
    expect(
      await frame.evaluate(
        () => (window as unknown as { marker?: number }).marker,
      ),
      "the editor was not reloaded",
    ).toBe(1);
  } finally {
    writeFileSync(settingsFile, original);
    writeFileSync(note, text);
    await closeBrowser(browser);
  }
});
