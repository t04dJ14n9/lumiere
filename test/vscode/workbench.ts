import { expect } from "@playwright/test";
import type { Browser, Page, Frame } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { paths } from "./state";
/**
 * The visible text box of the quick input. Cursor's widget holds a second,
 * hidden input, so the plain selector would match two elements; the
 * select-all checkbox is an input too.
 */
export const QUICK_INPUT =
  ".quick-input-widget input:not([type='checkbox']):visible";
/**
 * Opens the command palette. A webview that is still taking focus (a new
 * split, in Cursor) can swallow the shortcut, so press it until it opens.
 */
export async function openPalette(page: Page) {
  const input = page.locator(QUICK_INPUT);
  await expect(async () => {
    if (!(await input.isVisible())) {
      await page.keyboard.press("ControlOrMeta+Shift+p");
    }
    await expect(input).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}
export async function command(page: Page, title: string) {
  await openPalette(page);
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
/**
 * Opens a note (Note.md by default) in Markdown Workbench and returns its
 * editable content. `timing` receives the clock at the choice of the editor
 * and when its content is on screen, for load-time measurements.
 */
export async function openWorkbench(
  page: Page,
  file = "Note.md",
  timing: { start?: number; end?: number } = {},
) {
  await expect(page.locator(".monaco-workbench")).toBeVisible();
  console.log("Native: closing all editors");
  await command(page, "View: Close All Editor Groups");
  console.log("Native: opening fixture");
  // A focused webview can swallow the shortcut, so press it until it opens.
  await expect(async () => {
    if (!(await page.locator(QUICK_INPUT).isVisible())) {
      // Take the focus out of a webview left from the previous note.
      await page.locator(".part.statusbar").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("ControlOrMeta+p");
    }
    await expect(page.locator(QUICK_INPUT)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await page.locator(QUICK_INPUT).fill(path.join(paths.workspace, file));
  // Enter before the result row exists does nothing on a busy machine.
  await expect(
    page
      .locator(".quick-input-list .monaco-list-row")
      .filter({ hasText: file })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".tabs-container .tab").filter({ hasText: file }),
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
  timing.start = Date.now();
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
  timing.end = Date.now();
  return frame!.getByRole("textbox", { name: "Markdown content" });
}
export function workbenchPage(browser: Browser): Page {
  return browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((page) => !page.url().startsWith("devtools:"))!;
}
export function readNote(): string {
  return readFileSync(path.join(paths.workspace, "Note.md"), "utf8");
}
export async function closeBrowser(browser: Browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
}

/** Reopens the active editor with another editor type, e.g. "Text Editor". */
export async function reopenWith(page: Page, editor: string) {
  await openPalette(page);
  await page.locator(QUICK_INPUT).fill(">View: Reopen Editor With");
  await page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: "View: Reopen Editor With..." })
    .first()
    .click();
  await page
    .locator(".quick-input-widget .monaco-list-row")
    .filter({ hasText: editor })
    .first()
    .click();
}
