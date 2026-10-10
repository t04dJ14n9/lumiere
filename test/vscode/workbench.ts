import { expect } from "@playwright/test";
import type { Browser, Page, Frame } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
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
  let attempt = 0;
  await expect(async () => {
    if (!(await input.isVisible())) {
      // F1 opens the palette too, when the shortcut is swallowed.
      await page.keyboard.press(
        attempt++ % 2 === 0 ? "ControlOrMeta+Shift+p" : "F1",
      );
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
/** Opens Note.md in Markdown Workbench and returns its editable content. */
export async function openWorkbench(page: Page, file = "Note.md") {
  await expect(page.locator(".monaco-workbench")).toBeVisible();
  console.log("Native: closing all editors");
  await command(page, "View: Close All Editor Groups");
  console.log("Native: opening fixture");
  await page.keyboard.press("ControlOrMeta+p");
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
  const row = page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: "View: Reopen Editor With..." })
    .first();
  // Right after an editor opens, the palette can lack the command for a
  // moment (its context keys are not set yet): close it and ask again.
  await expect(async () => {
    await openPalette(page);
    await page.locator(QUICK_INPUT).fill(">View: Reopen Editor With");
    try {
      await expect(row).toBeVisible({ timeout: 3000 });
    } catch (error) {
      await page.keyboard.press("Escape");
      throw error;
    }
  }).toPass({ timeout: 30000 });
  await row.click();
  await page
    .locator(".quick-input-widget .monaco-list-row")
    .filter({ hasText: editor })
    .first()
    .click();
}

/** What global setup writes to Note.md; other specs may leave it changed. */
export const ORIGINAL_NOTE = "# Native Markdown\n\nOriginal line";
/** Puts Note.md back, so a spec does not depend on the ones that ran before. */
export function resetNote() {
  writeFileSync(path.join(paths.workspace, "Note.md"), ORIGINAL_NOTE);
}
