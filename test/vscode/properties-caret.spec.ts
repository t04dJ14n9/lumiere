import { test, expect, chromium, type Frame } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import {
  closeBrowser,
  openWorkbench,
  readNote,
  workbenchPage,
} from "./workbench";

const NOTE = "---\ntitle: T\ntags:\n  - a\n---\nFirst body line\nSecond line\n";

async function propertiesFrame(frames: () => Frame[]): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(async () => {
      for (const frame of frames()) {
        if (
          await frame.locator(".hybrid-properties .metadata-container").count()
        ) {
          found = frame;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return found!;
}

/** What has focus in the webview: the editor, a row, the Add button or the heading. */
const focused = (frame: Frame) =>
  frame.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const row = element.closest("[data-property-key]");
    return row
      ? `row:${row.getAttribute("data-property-key")}`
      : element.hasAttribute("data-property-add")
        ? "add"
        : element.hasAttribute("data-properties-heading")
          ? "heading"
          : element.getAttribute("role") === "textbox"
            ? "editor"
            : element.tagName;
  });

test("the caret never enters the Properties block in the real editor (as in Obsidian 1.14.4)", async () => {
  const original = readFileSync(path.join(paths.workspace, "Note.md"), "utf8");
  writeFileSync(path.join(paths.workspace, "Note.md"), NOTE);
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const editor = await openWorkbench(page);
    const frame = await propertiesFrame(() => page.frames());
    await frame.getByText("First body line").click();
    await page.keyboard.press("Home");

    // ArrowUp from the first body line: focus goes to the Add property button.
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(frame)).toBe("add");
    await page.screenshot({
      path: path.resolve("docs/screenshots/properties-arrowup-vscode.png"),
    });
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(frame)).toBe("row:tags");
    await page.keyboard.press("Escape");
    await expect.poll(() => focused(frame)).toBe("editor");

    // Keys that would move the caret into the block stop at the body start,
    // and Backspace there changes nothing.
    for (const keys of ["ArrowLeft", "ControlOrMeta+Home", "PageUp"]) {
      await page.keyboard.press(keys);
      expect(await focused(frame), keys).toBe("editor");
    }
    await page.keyboard.press("Backspace");
    await page.keyboard.press("ControlOrMeta+s");
    await page.waitForTimeout(500);
    expect(readNote()).toBe(NOTE);

    // Select All takes the body only; typing replaces it and leaves the properties.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("X", { delay: 40 });
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(readNote).toBe("---\ntitle: T\ntags:\n  - a\n---\nX");
    await expect(editor).toBeVisible();
  } finally {
    writeFileSync(path.join(paths.workspace, "Note.md"), original);
    await closeBrowser(browser);
  }
});
