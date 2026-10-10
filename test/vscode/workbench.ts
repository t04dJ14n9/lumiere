/**
 * Helpers for driving the real VS Code window: the command palette, Quick
 * Open, and the PDF viewer inside its webview.
 */
import {
  chromium,
  expect,
  test as base,
  type Browser,
  type Frame,
  type Page,
} from "@playwright/test";
import { readState } from "./state";
import { pageAtTop, pageFit, type Point } from "./pdf-geometry";
export {
  pageAtTop,
  pointAtTop,
  pagePoint,
  drag,
  selectText,
  PAGE_WIDTH,
} from "./pdf-geometry";

export { expect };
const modifier = process.platform === "darwin" ? "Meta" : "Control";
/** `workbench`: VS Code's main window, with every editor closed first. */
export const test = base.extend<{ workbench: Page }>({
  // Playwright fixtures take their dependencies as an (empty) object pattern.
  // eslint-disable-next-line no-empty-pattern
  workbench: async ({}, use) => {
    const browser = await chromium.connectOverCDP(readState().webSocket);
    const page = await findWorkbench(browser);
    await closeAllEditors(page);
    await use(page);
    await browser.close();
  },
});

async function findWorkbench(browser: Browser): Promise<Page> {
  let workbench: Page | undefined;
  await expect
    .poll(
      async () => {
        for (const page of browser
          .contexts()
          .flatMap((context) => context.pages())) {
          if (await page.locator(".monaco-workbench .part.editor").count()) {
            workbench = page;
            return true;
          }
        }
        return false;
      },
      { message: "The VS Code window did not open", timeout: 60_000 },
    )
    .toBe(true);
  return workbench!;
}

async function quickInput(
  page: Page,
  shortcut: string,
  text: string,
): Promise<void> {
  const widget = page.locator(".quick-input-widget");
  if (await widget.isVisible()) await page.keyboard.press("Escape");
  await page.locator(".monaco-workbench").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press(shortcut);
  await expect(widget).toBeVisible();
  await widget.locator("input:visible").fill(text);
}

/** Run a command from the command palette by its label. */
export async function command(page: Page, label: string): Promise<void> {
  await quickInput(page, `${modifier}+Shift+P`, `>${label}`);
  const item = page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: label })
    .first();
  await item.click();
  await page.mouse.move(0, 0);
}

/** Open a workspace file with Quick Open. */
export async function openFile(
  page: Page,
  relativePath: string,
  timing: { start?: number } = {},
): Promise<void> {
  await quickInput(page, `${modifier}+P`, relativePath);
  const name = relativePath.split("/").at(-1)!;
  const row = page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: name })
    .first();
  timing.start = Date.now();
  await row.click();
  await expect(page.locator(".quick-input-widget")).toBeHidden();
  await page.mouse.move(0, 0);
}

/**
 * Click an editor title action: its button, or, where the editor keeps it in
 * the More Actions menu (Cursor does, for extension actions), that menu item.
 */
export async function editorTitleAction(
  page: Page,
  label: string,
): Promise<void> {
  const actions = page.locator(".editor-actions");
  const button = actions.getByRole("button", { name: label });
  // The button appears once the editor reports the state that enables it.
  if (
    await button.waitFor({ timeout: 5_000 }).then(
      () => true,
      () => false,
    )
  ) {
    await button.click();
    return;
  }
  // The overflow dropdown is a plain labelled link, without a button role.
  await actions.locator('[aria-label^="More Actions"]').click();
  // Menu items act on mouse up after the pointer has entered them.
  const item = page
    .locator(".monaco-menu")
    .getByRole("menuitem", { name: label });
  await item.hover();
  await item.click();
}

/**
 * What the agent chat's input holds, its text and attached files, with all
 * whitespace removed: editors wrap long lines at spaces. VS Code's chat input,
 * or Cursor's agent chat input, where attached files are pills in the text.
 */
export async function agentChatInput(page: Page): Promise<string> {
  const cursor = page.locator(".aislash-editor-input:visible");
  if (await cursor.count())
    return withoutSpaces(await cursor.last().innerText());
  const input = page.locator(".interactive-input-part:visible").last();
  const attachments = await input
    .locator(".chat-attached-context-attachment")
    .allInnerTexts();
  return withoutSpaces(
    [
      await input.locator(".monaco-editor").first().innerText(),
      ...attachments,
    ].join(""),
  );
}

export function withoutSpaces(text: string): string {
  return text.replace(/\s+/gu, "");
}

/** Right-click at a point and choose an item of VS Code's context menu. */
export async function contextMenu(
  page: Page,
  at: Point,
  label: string,
): Promise<void> {
  await page.mouse.click(...at.screen, { button: "right" });
  const item = page
    .locator(".monaco-menu")
    .getByRole("menuitem", { name: label });
  await item.hover();
  await item.click();
}

export async function closeAllEditors(page: Page): Promise<void> {
  if (await page.locator(".tabs-container .tab").count())
    await command(page, "View: Close All Editor Groups");
  await expect(page.locator(".tabs-container .tab")).toHaveCount(0);
}

/** The visible PDF viewer, inside VS Code's webview frames. */
export async function pdfViewer(page: Page): Promise<Frame> {
  let viewer: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          try {
            if (
              (await frame.locator(".viewer .page").count()) &&
              (await (await frame.frameElement()).isVisible())
            ) {
              viewer = frame;
              return true;
            }
          } catch {
            // The frame went away while a tab was changing.
          }
        }
        return false;
      },
      { message: "The PDF viewer did not open", timeout: 30_000 },
    )
    .toBe(true);
  return viewer!;
}

/**
 * Fit whole pages in the viewer, so every point of a page is on screen. The
 * default fit-to-width zoom can make the narrow fixture pages taller than the
 * window. When the editor is narrow (Cursor's agent pane on a small screen),
 * fit width already is fit page and the zoom does not change, so this waits
 * for the fitted state itself rather than for a change.
 */
export async function fitPage(page: Page, viewer: Frame): Promise<void> {
  await command(page, "PDF: Fit Page");
  await expect
    .poll(() => pageFit(viewer), { message: "The page did not fit the viewer" })
    .toEqual({ fitsWidth: true, fitsHeight: true, fills: true });
}

/**
 * The text field of the quick input showing `title`. Waiting for the title
 * rather than any quick input skips a command palette that is still closing.
 */
export function quickInputTitled(page: Page, title: RegExp) {
  return page
    .locator(".quick-input-widget:visible")
    .filter({ has: page.locator(".quick-input-title", { hasText: title }) })
    .locator("input:visible");
}

/** A status bar entry of the PDF viewer, by its text. */
export function statusBarEntry(page: Page, text: RegExp) {
  return page
    .locator(".part.statusbar .statusbar-item")
    .filter({ hasText: text });
}

/** The status bar's "Page N / M" and zoom ("Fit Width (164%)", "140%") entries. */
export const PAGE_STATUS = /^Page \d+ \/ \d+$/u;
export const ZOOM_STATUS = /^(Fit (Width|Page) \()?\d+%\)?$/u;

/**
 * Show a page by clicking the status bar's page entry and typing it, and
 * wait until it is at the top.
 */
export async function showPage(
  page: Page,
  viewer: Frame,
  number: number,
): Promise<void> {
  await statusBarEntry(page, PAGE_STATUS).click();
  const input = quickInputTitled(page, /^Go to Page/u);
  // The box opens first and gets its value (the current page) after: typing
  // before then would be overwritten.
  await expect(input).toHaveValue(/^\d+$/u);
  await input.fill(String(number));
  await input.press("Enter");
  await expect.poll(() => pageAtTop(viewer, number)).toBe(true);
  await expect(
    viewer.locator(`.page[data-page-index="${number - 1}"] img`),
  ).toBeVisible();
}
