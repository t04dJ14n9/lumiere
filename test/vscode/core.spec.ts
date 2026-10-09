import { test, expect, chromium } from "@playwright/test";
import type { Browser, Page, Frame } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
/**
 * The visible text box of the quick input. Cursor's widget holds a second,
 * hidden input, so the plain selector would match two elements; the
 * select-all checkbox is an input too.
 */
const QUICK_INPUT = ".quick-input-widget input:not([type='checkbox']):visible";
async function command(page: Page, title: string) {
  await page.keyboard.press("ControlOrMeta+Shift+p");
  const input = page.locator(QUICK_INPUT);
  await input.fill(">" + title);
  const item = page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: title })
    .first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(input).not.toBeVisible();
}
/** Opens Note.md in Markdown Workbench and returns its editable content. */
async function openWorkbench(page: Page) {
  await expect(page.locator(".monaco-workbench")).toBeVisible();
  console.log("Native: closing all editors");
  await command(page, "View: Close All Editor Groups");
  console.log("Native: opening fixture");
  await page.keyboard.press("ControlOrMeta+p");
  await page.locator(QUICK_INPUT).fill(path.join(paths.workspace, "Note.md"));
  // Enter before the result row exists does nothing on a busy machine.
  await expect(
    page
      .locator(".quick-input-list .monaco-list-row")
      .filter({ hasText: "Note.md" })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".tabs-container .tab").filter({ hasText: "Note.md" }),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+p");
  await page.locator(QUICK_INPUT).fill(">View: Reopen Editor With");
  await page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: "View: Reopen Editor With..." })
    .first()
    .click();

  await page
    .locator(".quick-input-widget")
    .locator(".monaco-list-row")
    .filter({ hasText: "Markdown Workbench" })
    .first()
    .click();
  console.log("Native: waiting for Markdown Workbench webview");
  let frame: Frame | undefined;
  await expect
    .poll(() => {
      frame = page
        .frames()
        .find(
          (f) =>
            f.url().includes("vscode-webview") &&
            f.url().includes("index.html"),
        );
      return Boolean(frame);
    })
    .toBe(true);
  // The custom editor can be nested inside VS Code's outer webview frame.
  await expect
    .poll(async () => {
      for (const f of page.frames()) {
        if (
          await f.getByRole("textbox", { name: "Markdown content" }).count()
        ) {
          frame = f;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return frame!.getByRole("textbox", { name: "Markdown content" });
}
function workbenchPage(browser: Browser): Page {
  return browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((page) => !page.url().startsWith("devtools:"))!;
}
function readNote(): string {
  return readFileSync(path.join(paths.workspace, "Note.md"), "utf8");
}
async function closeBrowser(browser: Browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
}
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
