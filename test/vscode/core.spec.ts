import { test, expect, chromium } from "@playwright/test";
import { readState } from "./state";
import {
  closeBrowser,
  openWorkbench,
  readNote,
  workbenchPage,
} from "./workbench";
test("isolated installed editor types, saves and performs native document undo", async () => {
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const editor = await openWorkbench(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText(" saved");
    await page.keyboard.press("ControlOrMeta+s");
    await expect
      .poll(readNote)
      .toBe("# Native Markdown\n\nOriginal line saved");
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(readNote).toBe("# Native Markdown\n\nOriginal line");
  } finally {
    await closeBrowser(browser);
  }
});

// VS Code also runs its own Select All for Ctrl/Cmd+A in a webview; it used
// to replace the editor's selection with a caret at the end of the note.
test("Ctrl/Cmd+A selects the whole note, so typing replaces it", async () => {
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const editor = await openWorkbench(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    // Give VS Code's forwarded Select All time to arrive if it still does.
    await page.waitForTimeout(500);
    await page.keyboard.insertText("Replaced");
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(readNote).toBe("Replaced");
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(readNote).toBe("# Native Markdown\n\nOriginal line");
  } finally {
    await closeBrowser(browser);
  }
});
