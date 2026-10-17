import { expect } from "@playwright/test";
import type { Browser, Page, Frame, Locator } from "@playwright/test";
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
/** CDP can drive a background window whose native focus-dependent UI is hidden. */
export async function focusWorkbench(page: Page) {
  await page.bringToFront();
  // Closing the last editor can leave focus on Electron's window chrome.
  // Activating the window alone does not return focus to its document.
  if (!(await page.evaluate(() => document.hasFocus()))) {
    await page.locator(".part.statusbar").click({ position: { x: 5, y: 5 } });
  }
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
}
/**
 * Opens the command palette. A webview that is still taking focus (a new
 * split, in Cursor) can swallow the shortcut, so press it until it opens.
 */
export async function openPalette(page: Page) {
  const input = page.locator(QUICK_INPUT);
  let attempt = 0;
  await expect(async () => {
    if (!(await input.isVisible())) {
      await focusWorkbench(page);
      // Leave a webview's input context before opening the host's palette.
      await page.locator(".part.statusbar").click({ position: { x: 5, y: 5 } });
      // F1 opens the palette too, when the shortcut is swallowed.
      await page.keyboard.press(
        attempt++ % 2 === 0 ? "ControlOrMeta+Shift+p" : "F1",
      );
    }
    await expect(input).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}
export async function command(page: Page, title: string) {
  const input = page.locator(QUICK_INPUT);
  const item = page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: title })
    .first();
  // Right after the previous spec restored the settings, the palette can open
  // without the command listed yet: close it and ask again.
  await expect(async () => {
    await openPalette(page);
    await input.fill(">" + title, { timeout: 3000 });
    try {
      await expect(item).toBeVisible({ timeout: 3000 });
    } catch (error) {
      await page.keyboard.press("Escape");
      throw error;
    }
  }).toPass({ timeout: 30000 });
  // The virtualized list can move between mouse-down and mouse-up after a
  // settings update. Accept the focused command once, avoiding a lost click
  // without retrying commands that toggle settings or edit the document.
  await expect
    .poll(async () => {
      const active = await input.getAttribute("aria-activedescendant");
      return active !== null && active === (await item.getAttribute("id"));
    })
    .toBe(true);
  await input.press("Enter");
  await expect(input).not.toBeVisible();
}
/** Finish native closing, including a delayed synthetic-buffer discard prompt. */
export async function closeEditorGroups(page: Page) {
  const dialog = page.locator(".monaco-dialog-box");
  if (await dialog.isVisible()) {
    await dialog.getByRole("button", { name: /Don.t Save/ }).click();
  }
  console.log("Native: closing all editors");
  await command(page, "View: Close All Editor Groups");
  // A spec that typed into the note and then restored the file leaves the
  // editor dirty: discard its buffer when VS Code asks.
  // The discard prompt may arrive after the palette has already closed.
  await expect(async () => {
    if (await dialog.isVisible()) {
      await dialog.getByRole("button", { name: /Don.t Save/ }).click();
    }
    await expect(page.locator(".tabs-container .tab")).toHaveCount(0, {
      timeout: 500,
    });
  }).toPass({ timeout: 10000 });
}
/**
 * Opens a note (Note.md by default) in Markdown Workshop and returns its
 * editable content. `timing` receives the clock at the choice of the editor
 * and when its content is on screen, for load-time measurements.
 */
export async function openWorkbench(
  page: Page,
  file = "Note.md",
  timing: { start?: number; end?: number } = {},
) {
  await focusWorkbench(page);
  await expect(page.locator(".monaco-workbench")).toBeVisible();
  await closeEditorGroups(page);
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
      .filter({ hasText: path.basename(file) })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page
      .locator(".tabs-container .tab")
      .filter({ hasText: path.basename(file) }),
  ).toBeVisible();
  const reopen = page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: "View: Reopen Editor With..." })
    .first();
  // The shortcut can be swallowed while the new tab takes the focus: ask again.
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+Shift+p");
    await page
      .locator(QUICK_INPUT)
      .fill(">View: Reopen Editor With", { timeout: 3000 });
    try {
      await expect(reopen).toBeVisible({ timeout: 3000 });
    } catch (error) {
      await page.keyboard.press("Escape");
      throw error;
    }
  }).toPass({ timeout: 30000 });
  await reopen.click();

  await page
    .locator(".quick-input-widget")
    .locator(".monaco-list-row")
    .filter({ hasText: "Markdown Workshop" })
    .first()
    .click();
  timing.start = Date.now();
  console.log("Native: waiting for Markdown Workshop webview");
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
  // Cursor can take over five seconds to initialize it after settings changes;
  // wait for the actual editor, within the host reveal readiness budget.
  await expect
    .poll(
      async () => {
        for (const f of page.frames()) {
          if (
            await f.getByRole("textbox", { name: "Markdown content" }).count()
          ) {
            frame = f;
            return true;
          }
        }
        return false;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  timing.end = Date.now();
  return frame!.getByRole("textbox", { name: "Markdown content" });
}
export function workbenchPage(browser: Browser): Page {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find(
      (candidate) =>
        !candidate.isClosed() && !candidate.url().startsWith("devtools:"),
    );
  if (!page) {
    throw new Error(
      `No live VS Code workbench page. Check ${path.join(paths.root, "startup.log")} for a renderer crash or process termination.`,
    );
  }
  return page;
}
/** SCM and Chat also use Monaco; measure the note editor containing the fixture. */
export function nativeTextEditor(page: Page, lineText: string): Locator {
  return page.locator(".monaco-editor:visible").filter({
    has: page.locator(".view-line").filter({ hasText: lineText }),
  });
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

/**
 * Where a screenshot the docs cite goes: the test output by default, and
 * `docs/screenshots` only when UPDATE_DOC_SCREENSHOTS=1, so a test run does
 * not rewrite tracked files.
 */
export function docScreenshot(name: string): string {
  return process.env.UPDATE_DOC_SCREENSHOTS === "1"
    ? path.resolve("docs/screenshots", name)
    : path.resolve("test-results/screenshots", name);
}
