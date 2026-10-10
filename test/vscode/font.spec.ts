import { test, expect, chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import {
  closeBrowser,
  openWorkbench,
  reopenWith,
  workbenchPage,
} from "./workbench";

interface Font {
  family: string;
  size: string;
  weight: string;
  lineHeight: number;
  letterSpacing: string;
  features: string;
}

/** The first family of a CSS font-family list, unquoted. */
const firstFamily = (list: string) =>
  list
    .split(",")[0]!
    .trim()
    .replace(/^["']|["']$/g, "");

/** The built-in text editor's body line. */
async function textEditorFont(page: Page): Promise<Font> {
  return page.evaluate(() => {
    const line = [
      ...document.querySelectorAll<HTMLElement>(".monaco-editor .view-line"),
    ].find((element) => element.textContent?.includes("Original"))!;
    const text = getComputedStyle(line.querySelector("span span") ?? line);
    const lines = getComputedStyle(
      document.querySelector(".monaco-editor .view-lines")!,
    );
    return {
      family: text.fontFamily,
      size: text.fontSize,
      weight: text.fontWeight,
      lineHeight: line.getBoundingClientRect().height,
      letterSpacing: lines.letterSpacing,
      features: lines.fontFeatureSettings,
    };
  });
}

/** The note's body line and its code line in Markdown Workbench. */
async function workbenchFont(frame: Frame): Promise<Font & { code: string }> {
  return frame.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>(".cm-line")];
    const line = lines.find((element) =>
      element.textContent?.includes("Original"),
    )!;
    const code = lines.find((element) =>
      element.classList.contains("md-code-line"),
    )!;
    const text = getComputedStyle(line);
    return {
      family: text.fontFamily,
      size: text.fontSize,
      weight: text.fontWeight,
      lineHeight: line.getBoundingClientRect().height,
      letterSpacing: text.letterSpacing,
      features: text.fontFeatureSettings,
      code: `${getComputedStyle(code).fontFamily} ${getComputedStyle(code).fontSize}`,
    };
  });
}

async function editorFrame(page: Page): Promise<Frame> {
  for (const frame of page.frames()) {
    if (await frame.locator(".cm-line").count()) {
      return frame;
    }
  }
  throw new Error("No Markdown Workbench frame");
}

// The built-in text editor honours [markdown] font overrides; the note follows
// them for everything but the size, which is its own setting.
test("note text uses the same font settings as the built-in text editor for Markdown, except the size and line height", async () => {
  const settingsFile = path.join(paths.userData, "User", "settings.json");
  const original = readFileSync(settingsFile, "utf8");
  const note = path.join(paths.workspace, "Note.md");
  const text = readFileSync(note, "utf8");
  writeFileSync(note, `${text}\n\n\`\`\`js\nconst arrow = () => 1;\n\`\`\``);
  writeFileSync(
    settingsFile,
    JSON.stringify({
      ...(JSON.parse(original) as object),
      "editor.fontSize": 13,
      "markdownWorkbench.editor.fontSize": 18,
      "markdownWorkbench.editor.lineHeight": 1.8,
      "[markdown]": {
        "editor.fontFamily": "DejaVu Sans Mono",
        // The built-in editor uses this; the note ignores it.
        "editor.fontSize": 30,
        "editor.fontWeight": "300",
        // The built-in editor uses this; the note ignores it.
        "editor.lineHeight": 30,
        "editor.letterSpacing": 0.5,
        "editor.fontLigatures": true,
      },
    }),
  );
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    const frame = await editorFrame(page);
    // Settings reload asynchronously; wait for the Markdown size.
    await expect
      .poll(async () => (await workbenchFont(frame)).size)
      .toBe("18px");
    const workbench = await workbenchFont(frame);
    await reopenWith(page, "Text Editor");
    await expect(
      page.locator(".monaco-editor .view-line").first(),
    ).toBeVisible();
    const builtIn = await textEditorFont(page);
    expect(firstFamily(workbench.family)).toBe(firstFamily(builtIn.family));
    expect(firstFamily(builtIn.family)).toBe("DejaVu Sans Mono");
    expect(builtIn.size).toBe("30px");
    expect(workbench.size).toBe("18px");
    expect(workbench.weight).toBe(builtIn.weight);
    // The note's line height is its own: 1.8 times its 18px, not the built-in 30px.
    expect(builtIn.lineHeight).toBeCloseTo(30, 1);
    expect(workbench.lineHeight).toBeCloseTo(18 * 1.8, 1);
    expect(workbench.letterSpacing).toBe(builtIn.letterSpacing);
    expect(workbench.features).toBe(builtIn.features);
    // Code uses the same face and size as the text.
    expect(workbench.code).toBe(`${workbench.family} ${workbench.size}`);
  } finally {
    writeFileSync(settingsFile, original);
    writeFileSync(note, text);
    await closeBrowser(browser);
  }
});

/** Line heights of the note's text, code and line-number rows. */
async function workbenchLines(frame: Frame) {
  return frame.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>(".cm-line")];
    const text = lines.find((element) =>
      element.textContent?.includes("Original"),
    )!;
    const code = lines.find((element) =>
      element.classList.contains("md-code-line"),
    )!;
    const number = [
      ...document.querySelectorAll<HTMLElement>(
        ".cm-lineNumbers .cm-gutterElement",
      ),
    ].find(
      (element) =>
        Math.abs(
          element.getBoundingClientRect().top -
            text.getBoundingClientRect().top,
        ) < 2,
    );
    return {
      size: getComputedStyle(text).fontSize,
      text: text.getBoundingClientRect().height,
      code: code.getBoundingClientRect().height,
      number: number?.getBoundingClientRect().height ?? 0,
      numberTop: number
        ? number.getBoundingClientRect().top - text.getBoundingClientRect().top
        : NaN,
    };
  });
}

// The note's line height is markdownWorkbench.editor.lineHeight times its own
// font size (Obsidian's 1.5 by default), whatever editor.lineHeight says.
test("the note's lines are the line height setting times the size (1.5 by default), and line numbers stay level", async () => {
  const settingsFile = path.join(paths.userData, "User", "settings.json");
  const original = readFileSync(settingsFile, "utf8");
  const note = path.join(paths.workspace, "Note.md");
  const text = readFileSync(note, "utf8");
  writeFileSync(note, `${text}\n\n\`\`\`js\nconst a = 1;\n\`\`\``);
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    const frame = await editorFrame(page);
    for (const [size, multiple] of [
      [12, undefined],
      [14, undefined],
      [16, undefined],
      [20, undefined],
      [16, 2],
      [20, 1.2],
    ] as const) {
      writeFileSync(
        settingsFile,
        JSON.stringify({
          ...(JSON.parse(original) as object),
          // Ignored: the note has its own line height.
          "editor.lineHeight": 40,
          "markdownWorkbench.editor.fontSize": size,
          ...(multiple
            ? { "markdownWorkbench.editor.lineHeight": multiple }
            : {}),
        }),
      );
      const expected = size * (multiple ?? 1.5);
      const label = `${size}px x ${multiple ?? 1.5}`;
      await expect
        .poll(async () => (await workbenchLines(frame)).text)
        .toBeCloseTo(expected, 1);
      const lines = await workbenchLines(frame);
      expect(lines.size, label).toBe(`${size}px`);
      expect(lines.code, `${label} code`).toBeCloseTo(expected, 1);
      // The line number is level with its line and as tall.
      expect(lines.number, `${label} number`).toBeCloseTo(expected, 1);
      expect(lines.numberTop, `${label} number top`).toBeCloseTo(0, 1);
    }
  } finally {
    writeFileSync(settingsFile, original);
    writeFileSync(note, text);
    await closeBrowser(browser);
  }
});
