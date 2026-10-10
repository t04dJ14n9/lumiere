/**
 * Our Vim caret against the carets VSCodeVim shows in the real editor.
 *
 * VSCodeVim draws no caret of its own: it sets the built-in editor's cursor
 * style per mode (block in normal mode, an underline in replace mode, the user's
 * own style in insert mode) and, in visual mode, a line-thin caret plus a
 * decoration on the active character (docs/vim-caret.md, measured with
 * VSCodeVim 1.32.4 on VS Code 1.141). So the built-in editor with the matching
 * `editor.cursorStyle` is the reference here: the position (relative to the
 * text start of the line, in whole pixels) and size of each caret must be the
 * same in our editor. Set VIM_CARET_SHOTS to keep screenshots.
 */
import { test, expect, chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import {
  closeBrowser,
  openWorkbench,
  ORIGINAL_NOTE,
  reopenWith,
  resetNote,
  workbenchPage,
} from "./workbench";

interface Caret {
  left: number;
  width: number;
  height: number;
}

/** The built-in caret, left relative to the first character of "Original line". */
async function nativeCaret(page: Page): Promise<Caret> {
  const caret = page.locator(".monaco-editor .cursors-layer > .cursor").first();
  await expect(caret).toBeVisible();
  return page.evaluate(() => {
    const line = [
      ...document.querySelectorAll(".monaco-editor .view-line"),
    ].find((element) =>
      element.textContent?.replace(/\u00a0/g, " ").includes("Original line"),
    );
    if (!line) {
      throw new Error("the Original line is not on screen");
    }
    const text = document
      .createTreeWalker(line, NodeFilter.SHOW_TEXT)
      .nextNode()!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const start = range.getBoundingClientRect().left;
    const box = document
      .querySelector(".monaco-editor .cursors-layer > .cursor")!
      .getBoundingClientRect();
    return { left: box.left - start, width: box.width, height: box.height };
  });
}

/** Our caret (`main` or the visual `end` caret), measured the same way. */
async function ourCaret(frame: Frame, part: "main" | "end"): Promise<Caret> {
  return frame.evaluate((part) => {
    const line = [...document.querySelectorAll(".cm-line")].find((element) =>
      element.textContent?.includes("Original line"),
    )!;
    const text = document
      .createTreeWalker(line, NodeFilter.SHOW_TEXT)
      .nextNode()!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const start = range.getBoundingClientRect().left;
    const box = document
      .querySelector(`.mw-caret[data-part="${part}"]`)!
      .getBoundingClientRect();
    return { left: box.left - start, width: box.width, height: box.height };
  }, part);
}

async function workbenchFrame(page: Page): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(async () => {
      for (const frame of page.frames()) {
        if (await frame.locator(".cm-line").count()) {
          found = frame;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return found!;
}

test("our Vim carets sit where VSCodeVim's do: same whole-pixel offset and size in every mode", async () => {
  const settingsFile = path.join(paths.userData, "User", "settings.json");
  const original = readFileSync(settingsFile, "utf8");
  const note = path.join(paths.workspace, "Note.md");
  resetNote();
  const text = ORIGINAL_NOTE;
  const base = {
    ...(JSON.parse(original) as object),
    "editor.fontFamily": "DejaVu Sans Mono",
    "editor.fontSize": 16,
    "editor.lineHeight": 24,
    "editor.cursorBlinking": "solid",
    "editor.cursorSmoothCaretAnimation": "off",
    "markdownWorkbench.plugins.vim.enabled": true,
  };
  const style = (cursorStyle: string) =>
    writeFileSync(
      settingsFile,
      JSON.stringify({ ...base, "editor.cursorStyle": cursorStyle }),
    );
  // 9.64 px characters: these columns round both ways (19.3, 38.6, 57.8, 77.1).
  const columns = [0, 2, 4, 6, 8];
  style("block");
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    await reopenWith(page, "Text Editor");
    const line = page
      .locator(".monaco-editor .view-line")
      .filter({ hasText: "Original line" });
    await expect(line).toBeVisible();
    // The built-in editor's carets at each column, per style.
    const native: Record<string, Caret[]> = {};
    const atColumn = async (cursorStyle: string, column: number) => {
      style(cursorStyle);
      await line.click();
      await page.keyboard.press("Home");
      for (let step = 0; step < column; step++) {
        await page.keyboard.press("ArrowRight");
      }
      const expectedWidth = {
        block: (width: number) => width > 6,
        line: (width: number) => width >= 2 && width < 4,
        "line-thin": (width: number) => width === 1,
        underline: (width: number) => width > 6,
      }[cursorStyle]!;
      await expect
        .poll(async () => expectedWidth((await nativeCaret(page)).width))
        .toBe(true);
      return nativeCaret(page);
    };
    for (const [cursorStyle, offset] of [
      ["block", 0],
      ["line", 0],
      ["underline", 0],
      ["line-thin", 1],
    ] as const) {
      native[cursorStyle] = [];
      for (const column of columns) {
        native[cursorStyle]!.push(await atColumn(cursorStyle, column + offset));
      }
    }

    await reopenWith(page, "Markdown Workbench");
    const frame = await workbenchFrame(page);
    const editor = frame.locator(".mw-editor");
    await frame.getByRole("textbox", { name: "Markdown content" }).click();
    await page.keyboard.press("Escape");
    await expect(editor).toHaveAttribute("data-caret-mode", "normal");
    await page.keyboard.press("G");
    const near = (mine: Caret, theirs: Caret, said: string) => {
      expect(mine.left, `${said}: left`).toBeCloseTo(theirs.left, 0);
      expect(
        Math.abs(mine.width - theirs.width),
        `${said}: width`,
      ).toBeLessThan(1.01);
    };
    const goTo = async (column: number) => {
      await page.keyboard.press("0");
      for (let step = 0; step < column; step++) {
        await page.keyboard.press("l");
      }
    };
    style("line");
    await expect(editor).toHaveAttribute("data-caret-style", "block");
    for (const [index, column] of columns.entries()) {
      await goTo(column);
      // Normal: the block on the character.
      await expect
        .poll(async () =>
          Math.abs(
            (await ourCaret(frame, "main")).left - native.block![index]!.left,
          ),
        )
        .toBeLessThan(0.51);
      near(
        await ourCaret(frame, "main"),
        native.block![index]!,
        `normal ${column}`,
      );
      // Visual: the same block, and the line-thin caret after the character.
      await page.keyboard.press("v");
      await expect(editor).toHaveAttribute("data-caret-mode", "visual");
      near(
        await ourCaret(frame, "main"),
        native.block![index]!,
        `visual block ${column}`,
      );
      await expect
        .poll(async () =>
          Math.abs(
            (await ourCaret(frame, "end")).left -
              native["line-thin"]![index]!.left,
          ),
        )
        .toBeLessThan(0.51);
      near(
        await ourCaret(frame, "end"),
        native["line-thin"]![index]!,
        `visual end ${column}`,
      );
      await page.keyboard.press("Escape");
      // Insert: the editor's own line caret, straddling the character's edge.
      await page.keyboard.press("i");
      await expect(editor).toHaveAttribute("data-caret-mode", "insert");
      near(
        await ourCaret(frame, "main"),
        native.line![index]!,
        `insert ${column}`,
      );
      await page.keyboard.press("Escape");
      // Replace: the underline.
      await goTo(column);
      await page.keyboard.press("Shift+R");
      await expect(editor).toHaveAttribute("data-caret-mode", "replace");
      near(
        await ourCaret(frame, "main"),
        native.underline![index]!,
        `replace ${column}`,
      );
      await page.keyboard.press("Escape");
      await goTo(column);
    }

    // Operator pending: the lower half of the character; prompt: a one-pixel line.
    await goTo(4);
    await page.keyboard.press("d");
    await expect(editor).toHaveAttribute("data-caret-mode", "pending");
    const half = await frame.locator(".mw-caret-shape").evaluate((element) => {
      const before = getComputedStyle(element, "::before");
      return {
        colour: before.backgroundColor,
        share:
          parseFloat(before.height) / element.getBoundingClientRect().height,
      };
    });
    expect(half.share).toBeCloseTo(0.5, 2);
    expect(half.colour).toMatch(/^rgb\(/);
    await page.keyboard.press("Escape");
    await page.keyboard.press("/");
    await expect(editor).toHaveAttribute("data-caret-mode", "prompt");
    await expect(frame.locator(".mw-caret").first()).toBeVisible();
    expect((await ourCaret(frame, "main")).height).toBe(1);
    await page.keyboard.press("Escape");
    await expect(editor).toHaveAttribute("data-caret-mode", "normal");
  } finally {
    writeFileSync(settingsFile, original);
    writeFileSync(note, text);
    await closeBrowser(browser);
  }
});
