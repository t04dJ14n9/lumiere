/**
 * Driving the workbench's command palette, shared by the Markdown
 * (test/vscode) and PDF (packages/pdf/test/vscode) harnesses.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

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
/** Run the command titled exactly `title` from the command palette. */
export async function command(page: Page, title: string) {
  const input = page.locator(QUICK_INPUT);
  // Exactly this command: "View: Close Editor" must not pick "View: Close
  // Editor Group". A row's name may go on after a comma ("…, recently used").
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const item = page
    .locator(".quick-input-list")
    .getByRole("option", { name: new RegExp(`^${escaped}(,|$)`) })
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
  const isActive = async () => {
    const active = await input.getAttribute("aria-activedescendant");
    return active !== null && active === (await item.getAttribute("id"));
  };
  // A recently used command that also matches the words can come first:
  // step down to this one.
  await expect
    .poll(
      async () => (await isActive()) || void (await input.press("ArrowDown")),
      {
        intervals: [250],
      },
    )
    .toBe(true);
  await input.press("Enter");
  // The palette closes, or the command opens its own quick input in its place.
  await expect
    .poll(() => input.inputValue({ timeout: 500 }).catch(() => "(closed)"))
    .not.toBe(">" + title);
}
