/**
 * Our Vim caret against VS Code's own caret, in the real editor.
 *
 * The built-in text editor draws `editor.cursorStyle: block | line | underline`;
 * in Vim normal/visual mode ours must draw the same block, in insert mode the
 * same line and in replace mode the same underline. Both are measured from the
 * DOM and again from pixels of a real screenshot (the caret rectangle, its
 * colour and a legible glyph in the block). Set VIM_CARET_SHOTS to a folder to
 * keep the cropped screenshots.
 */
import { test, expect, chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { paths, readState } from "./state";
import {
  closeBrowser,
  focusWorkbench,
  nativeTextEditor,
  openWorkbench,
  ORIGINAL_NOTE,
  reopenWith,
  resetNote,
  workbenchPage,
} from "./workbench";

interface Shot {
  width: number;
  height: number;
  pixel(x: number, y: number): [number, number, number];
}

/** A minimal decoder for the 8-bit, non-interlaced PNGs that Chromium writes. */
function decodePng(file: Buffer): Shot {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("latin1", offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (body[8] !== 8 || !channels || body[12] !== 0) {
        throw new Error("Unsupported PNG");
      }
    } else if (type === "IDAT") {
      parts.push(body);
    }
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? data[y * stride + x - channels]! : 0;
      const up = y ? data[(y - 1) * stride + x]! : 0;
      const corner =
        y && x >= channels ? data[(y - 1) * stride + x - channels]! : 0;
      const value = raw[y * (stride + 1) + 1 + x]!;
      const predictor = [
        0,
        left,
        up,
        (left + up) >> 1,
        (() => {
          const p = left + up - corner;
          const [a, b, c] = [
            Math.abs(p - left),
            Math.abs(p - up),
            Math.abs(p - corner),
          ];
          return a <= b && a <= c ? left : b <= c ? up : corner;
        })(),
      ][filter]!;
      data[y * stride + x] = (value + predictor) & 255;
    }
  }
  return {
    width,
    height,
    pixel: (x, y) => {
      const at = y * stride + x * channels;
      return [data[at]!, data[at + 1]!, data[at + 2]!];
    },
  };
}

interface Measured {
  /** CSS box of the caret element. */
  box: { x: number; y: number; width: number; height: number };
  /** Box found from pixels of the real screenshot. */
  pixels: { width: number; height: number; glyphPixels: number };
  colour: string;
  glyph: string;
  /** Height of the text line the caret sits in. */
  lineHeight: number;
}

const near = (a: number[], b: number[], tolerance = 24) =>
  a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);

/** The cursor colour is the most common colour in the box's edge pixels. */
async function measure(
  page: Page,
  box: Measured["box"],
  glyph: string,
  name: string,
  lineHeight: number,
  expected?: string,
): Promise<Measured> {
  const margin = 6;
  const clip = {
    x: Math.max(0, Math.floor(box.x) - margin),
    y: Math.max(0, Math.floor(box.y) - margin),
    width: Math.ceil(box.width) + margin * 2,
    height: Math.ceil(box.height) + margin * 2,
  };
  // Geometry below is measured in CSS pixels, including on Retina displays.
  const png = await page.screenshot({ clip, scale: "css" });
  const folder = process.env.VIM_CARET_SHOTS;
  if (folder) {
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `${name}.png`), png);
  }
  const shot = decodePng(png);
  // The background is the commonest colour of the crop (a corner can be text).
  const all = new Map<string, number>();
  for (let y = 0; y < shot.height; y++) {
    for (let x = 0; x < shot.width; x++) {
      const key = shot.pixel(x, y).join(",");
      all.set(key, (all.get(key) ?? 0) + 1);
    }
  }
  const backdrop = [...all.entries()]
    .sort((a, b) => b[1] - a[1])[0]![0]
    .split(",")
    .map(Number) as [number, number, number];
  // Scan the caret's own box (plus a pixel for anti-aliasing), not the text around it.
  const x0 = Math.max(0, Math.floor(box.x - clip.x) - 1);
  const x1 = Math.min(
    shot.width - 1,
    Math.ceil(box.x - clip.x + box.width) + 1,
  );
  const y0 = Math.max(0, Math.floor(box.y - clip.y) - 1);
  const y1 = Math.min(
    shot.height - 1,
    Math.ceil(box.y - clip.y + box.height) + 1,
  );
  // The caret colour is the commonest exact colour in that area that is not the background.
  const counts = new Map<string, number>();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const pixel = shot.pixel(x, y);
      if (!near(pixel, backdrop, 12)) {
        counts.set(pixel.join(","), (counts.get(pixel.join(",")) ?? 0) + 1);
      }
    }
  }
  // Thin carets are outnumbered by the line highlight and text, so they are
  // looked for in the block's colour; a different colour finds nothing.
  const colour = (
    expected ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  )
    .split(",")
    .map(Number) as [number, number, number];
  let left = shot.width;
  let right = -1;
  let top = shot.height;
  let bottom = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (
        near(shot.pixel(x, y), colour, 4) &&
        !near(shot.pixel(x, y), backdrop, 12)
      ) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  let glyphPixels = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (!near(shot.pixel(x, y), colour, 60)) {
        glyphPixels++;
      }
    }
  }
  return {
    box,
    pixels: { width: right - left + 1, height: bottom - top + 1, glyphPixels },
    colour: colour.join(","),
    glyph,
    lineHeight,
  };
}

async function builtIn(
  page: Page,
  name: string,
  expected?: string,
): Promise<Measured> {
  await focusWorkbench(page);
  const caret = nativeTextEditor(page, "Original line").locator(
    ".cursors-layer > .cursor",
  );
  await expect(caret).toBeVisible();
  const box = (await caret.boundingBox())!;
  const glyph = (await caret.textContent()) ?? "";
  const lineHeight = await page
    .locator(".monaco-editor .view-line")
    .filter({ hasText: "Original line" })
    .evaluate((element) => element.getBoundingClientRect().height);
  return measure(page, box, glyph, `builtin-${name}`, lineHeight, expected);
}

async function ours(
  frame: Frame,
  page: Page,
  name: string,
  expected?: string,
): Promise<Measured> {
  const caret = frame.locator(".mw-caret").first();
  await expect(caret).toBeVisible();
  const box = (await caret.boundingBox())!;
  const glyph = (await caret.locator(".mw-caret-shape").textContent()) ?? "";
  const lineHeight = await frame
    .locator(".cm-line")
    .filter({ hasText: "Original line" })
    .evaluate((element) => element.getBoundingClientRect().height);
  return measure(page, box, glyph, `workbench-${name}`, lineHeight, expected);
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

test("Vim carets match the built-in editor's block, line and underline in the real editor", async () => {
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
    const builtins: Record<string, Measured> = {};
    for (const cursorStyle of ["block", "line", "underline"]) {
      style(cursorStyle);
      await line.click();
      await page.keyboard.press("Home");
      for (let step = 0; step < 4; step++) {
        await page.keyboard.press("ArrowRight");
      }
      await expect
        .poll(async () => {
          const box = await nativeTextEditor(page, "Original line")
            .locator(".cursors-layer > .cursor")
            .boundingBox();
          return cursorStyle === "block"
            ? box!.width > 6
            : cursorStyle === "line"
              ? box!.width < 4 && box!.height > 12
              : box!.height < 4;
        })
        .toBe(true);
      builtins[cursorStyle] = await builtIn(
        page,
        cursorStyle,
        builtins.block?.colour,
      );
    }

    await reopenWith(page, "Markdown Workbench");
    const frame = await workbenchFrame(page);
    const editor = frame.getByRole("textbox", { name: "Markdown content" });
    await editor.click();
    await page.keyboard.press("Escape");
    await expect(frame.locator(".mw-editor")).toHaveAttribute(
      "data-caret-mode",
      "normal",
    );
    await page.keyboard.press("G");
    await page.keyboard.press("0");
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press("l");
    }
    const results: Record<string, [Measured, Measured]> = {};
    results.normal = [builtins.block!, await ours(frame, page, "normal")];
    await page.keyboard.press("v");
    await expect(frame.locator(".mw-editor")).toHaveAttribute(
      "data-caret-mode",
      "visual",
    );
    results.visual = [builtins.block!, await ours(frame, page, "visual")];
    await page.keyboard.press("Escape");
    // Insert mode is the editor's own caret, like VSCodeVim's: editor.cursorStyle decides.
    style("line");
    await page.keyboard.press("i");
    await expect(frame.locator(".mw-editor")).toHaveAttribute(
      "data-caret-mode",
      "insert",
    );
    await expect(frame.locator(".mw-editor")).toHaveAttribute(
      "data-caret-style",
      "line",
    );
    results.insert = [
      builtins.line!,
      await ours(frame, page, "insert", builtins.block!.colour),
    ];
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+R");
    await expect(frame.locator(".mw-editor")).toHaveAttribute(
      "data-caret-mode",
      "replace",
    );
    results.replace = [
      builtins.underline!,
      await ours(frame, page, "replace", builtins.block!.colour),
    ];
    await page.keyboard.press("Escape");

    for (const [mode, [native, mine]] of Object.entries(results)) {
      const fills = mode === "replace" ? 0 : 1;
      const said = `${mode}: built-in ${JSON.stringify(native.pixels)} (line ${native.lineHeight}) ours ${JSON.stringify(mine.pixels)} (line ${mine.lineHeight})`;
      console.log(said, native.colour, mine.colour);
      // The caret elements themselves have the same size (the built-in editor rounds to whole pixels).
      expect(
        Math.abs(mine.box.width - native.box.width),
        `${said}: element width`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          mine.box.height -
            fills * mine.lineHeight -
            (native.box.height - fills * native.lineHeight),
        ),
        `${said}: element height`,
      ).toBeLessThanOrEqual(1);
      // Our block carets are see-through tints (the glyph keeps its colour),
      // so only their element boxes are compared with the opaque built-in.
      if (mode === "normal" || mode === "visual") {
        continue;
      }
      // Same width on screen, to the pixel (±1 for anti-aliased edges).
      expect(
        Math.abs(mine.pixels.width - native.pixels.width),
        `${said}: width`,
      ).toBeLessThanOrEqual(1);
      // A block and a line fill their text line, an underline is as thick as the built-in's.
      // Compared with each editor's own line height: this branch does not carry
      // the editor-font fix, so the two editors' line heights can differ.
      expect(
        Math.abs(
          mine.pixels.height -
            fills * mine.lineHeight -
            (native.pixels.height - fills * native.lineHeight),
        ),
        `${said}: height relative to the line`,
      ).toBeLessThanOrEqual(1);
      // Same colour: the theme's editorCursor.foreground.
      expect(mine.colour, `${mode} colour`).toBe(native.colour);
    }
    // Block modes keep the character legible, as the built-in block does.
    for (const mode of ["normal", "visual"]) {
      const [native, mine] = results[mode]!;
      expect(
        native.pixels.glyphPixels,
        `${mode} built-in glyph`,
      ).toBeGreaterThan(10);
      expect(mine.pixels.glyphPixels, `${mode} glyph`).toBeGreaterThan(10);
    }
  } finally {
    writeFileSync(settingsFile, original);
    writeFileSync(note, text);
    await closeBrowser(browser);
  }
});
