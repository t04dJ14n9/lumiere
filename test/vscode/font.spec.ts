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

// The built-in text editor honours [markdown] font overrides; the note used
// to keep VS Code's global editor font, line height and ligatures instead.
test("note text uses the same font settings as the built-in text editor for Markdown", async () => {
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
      "[markdown]": {
        "editor.fontFamily": "DejaVu Sans Mono",
        "editor.fontSize": 18,
        "editor.fontWeight": "300",
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
    expect(workbench.size).toBe(builtIn.size);
    expect(workbench.weight).toBe(builtIn.weight);
    expect(workbench.lineHeight).toBeCloseTo(builtIn.lineHeight, 1);
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
