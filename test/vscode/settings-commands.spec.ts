import { test, expect, chromium } from "@playwright/test";
import type { Browser, Frame, Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import {
  QUICK_INPUT,
  closeBrowser,
  closeEditorGroups,
  command,
  openPalette,
  openWorkbench,
  workbenchPage,
} from "./workbench";

const userFile = path.join(paths.userData, "User", "settings.json");
const folderFile = path.join(paths.workspace, ".vscode", "settings.json");
const notePath = path.join(paths.workspace, "Note.md");
const key = (name: string) => `markdownWorkbench.${name}`;

/**
 * Closes the Settings editor and any input box this spec left open, so the
 * next spec starts from a workbench whose palette opens (a focused Settings
 * search swallows the shortcut).
 */
async function leaveClean(browser: Browser) {
  try {
    const page = workbenchPage(browser);
    await page.keyboard.press("Escape");
    await closeEditorGroups(page);
  } catch {
    // Best effort: the next spec's own setup reports a workbench that is stuck.
  }
}

/** Runs the font size command, which leaves its own input box open. */
async function askFontSize(page: Page) {
  await expect(page.locator(".quick-input-widget")).toBeHidden();
  await openPalette(page);
  const input = page.locator(QUICK_INPUT);
  await input.fill(">Markdown Workbench: Set Note Font Size");
  await page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: "Set Note Font Size" })
    .first()
    .click();
  await expect(page.locator(".quick-input-widget")).toContainText(
    "Note font size in pixels",
  );
}

/**
 * The workspace's settings file stays in place and is only rewritten: VS Code's
 * file watcher follows edits to a file reliably, but can miss a file that was
 * deleted and created again.
 */
function resetFolder() {
  mkdirSync(path.dirname(folderFile), { recursive: true });
  writeFileSync(folderFile, "{}");
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 2000));

const read = (file: string): Record<string, unknown> =>
  existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : {};

async function editorFrame(page: Page): Promise<Frame> {
  for (const frame of page.frames()) {
    if (await frame.locator(".cm-line").count()) {
      return frame;
    }
  }
  throw new Error("No Markdown Workbench frame");
}

test("Open Settings, and the commands for common settings read and write the Settings UI's own keys, live", async () => {
  const originalUser = readFileSync(userFile, "utf8");
  const originalNote = readFileSync(notePath, "utf8");
  const userKeys = () => read(userFile);
  const folderKeys = () => read(folderFile);
  writeFileSync(
    notePath,
    "# Title\n\nBody text\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nLast line\n",
  );
  resetFolder();
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    let frame = await editorFrame(page);
    // Marks the page: no command may reload the editor.
    await frame.evaluate(() => {
      (window as unknown as { marker: number }).marker = 1;
    });
    const stillSame = async () =>
      expect(
        await (
          await editorFrame(page)
        ).evaluate(() => (window as unknown as { marker?: number }).marker),
      ).toBe(1);

    // Open Settings: the Settings UI, searching for this extension.
    await command(page, "Markdown Workbench: Open Settings");
    const search = page.locator(".settings-editor .suggest-input-container");
    await expect(search).toBeVisible();
    await expect(search).toContainText(
      "@ext:t04dj14n9.vscode-markdown-workbench",
    );
    await expect(
      page
        .locator(".settings-editor .settings-tree-container .monaco-list-row")
        .first(),
    ).toBeVisible();
    await page.keyboard.press("ControlOrMeta+w");
    await expect(page.locator(".settings-editor")).toHaveCount(0);

    // Back on the note.
    await page
      .locator(".tabs-container .tab")
      .filter({ hasText: "Note.md" })
      .click();
    frame = await editorFrame(page);

    // Readable line width: the user's settings, then the folder's once it sets it.
    const readable = () =>
      frame.locator(".cm-editor.is-readable-line-width").count();
    expect(await readable()).toBe(0);
    await command(page, "Markdown Workbench: Toggle Readable Line Width");
    await expect
      .poll(() => userKeys()[key("editor.readableLineLength")])
      .toBe(true);
    await expect.poll(readable).toBe(1);
    await command(page, "Markdown Workbench: Toggle Readable Line Width");
    await expect
      .poll(() => userKeys()[key("editor.readableLineLength")])
      .toBe(false);
    await expect.poll(readable).toBe(0);
    // A value set in the folder is the one changed, and the user's stays.
    mkdirSync(path.dirname(folderFile), { recursive: true });
    writeFileSync(
      folderFile,
      JSON.stringify({ [key("editor.readableLineLength")]: true }),
    );
    await expect.poll(readable).toBe(1);
    await command(page, "Markdown Workbench: Toggle Readable Line Width");
    await expect
      .poll(() => folderKeys()[key("editor.readableLineLength")])
      .toBe(false);
    expect(userKeys()[key("editor.readableLineLength")]).toBe(false);
    await expect.poll(readable).toBe(0);
    // An edit in settings.json is what the next run reads (no state of its own).
    writeFileSync(
      folderFile,
      JSON.stringify({ [key("editor.readableLineLength")]: true }),
    );
    await expect.poll(readable).toBe(1);
    await command(page, "Markdown Workbench: Toggle Readable Line Width");
    await expect
      .poll(() => folderKeys()[key("editor.readableLineLength")])
      .toBe(false);
    resetFolder();

    // Line numbers.
    const gutter = () => frame.locator(".cm-lineNumbers").count();
    await expect.poll(gutter).toBeGreaterThan(0);
    await command(page, "Markdown Workbench: Toggle Line Numbers");
    await expect
      .poll(() => userKeys()[key("plugins.lineNumbers.enabled")])
      .toBe(false);
    await expect.poll(gutter).toBe(0);
    await command(page, "Markdown Workbench: Toggle Line Numbers");
    await expect
      .poll(() => userKeys()[key("plugins.lineNumbers.enabled")])
      .toBe(true);
    await expect.poll(gutter).toBeGreaterThan(0);

    // Inline title.
    const title = () => frame.locator(".file-title").count();
    expect(await title()).toBe(0);
    await command(page, "Markdown Workbench: Toggle Inline Title");
    await expect
      .poll(() => userKeys()[key("plugins.inlineTitle.enabled")])
      .toBe(true);
    await expect.poll(title).toBeGreaterThan(0);
    await command(page, "Markdown Workbench: Toggle Inline Title");
    await expect
      .poll(() => userKeys()[key("plugins.inlineTitle.enabled")])
      .toBe(false);
    await expect.poll(title).toBe(0);

    // Mermaid: the block renders as a diagram, and as source when off.
    const diagram = () => frame.locator(".cm-content svg").count();
    await frame.getByRole("textbox", { name: "Markdown content" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await expect.poll(diagram, { timeout: 20000 }).toBeGreaterThan(0);
    await command(page, "Markdown Workbench: Toggle Mermaid Diagrams");
    await expect
      .poll(() => userKeys()[key("plugins.diagrams.enabled")])
      .toBe(false);
    await expect.poll(diagram).toBe(0);
    await command(page, "Markdown Workbench: Toggle Mermaid Diagrams");
    await expect
      .poll(() => userKeys()[key("plugins.diagrams.enabled")])
      .toBe(true);
    await expect.poll(diagram, { timeout: 20000 }).toBeGreaterThan(0);

    // Vim.
    const vim = () => frame.locator(".cm-vim-panel, .cm-fat-cursor").count();
    expect(await vim()).toBe(0);
    await command(page, "Markdown Workbench: Toggle Vim Mode");
    await expect.poll(() => userKeys()[key("plugins.vim.enabled")]).toBe(true);
    await expect.poll(vim).toBeGreaterThan(0);
    await command(page, "Markdown Workbench: Toggle Vim Mode");
    await expect.poll(() => userKeys()[key("plugins.vim.enabled")]).toBe(false);
    await expect.poll(vim).toBe(0);

    // Note font size: a prompt with the current size, validated.
    const body = () =>
      frame.evaluate(() =>
        parseFloat(
          getComputedStyle(
            document.querySelector(".cm-line:not([class*='md-h'])")!,
          ).fontSize,
        ),
      );
    await expect.poll(body).toBe(16);
    await askFontSize(page);
    const input = page.locator(QUICK_INPUT);
    await expect(input).toHaveValue("16");
    await input.fill("7");
    await page.keyboard.press("Enter");
    await expect(page.locator(".quick-input-message")).toContainText(
      "from 8 to 48",
    );
    expect(userKeys()[key("editor.fontSize")]).toBeUndefined();
    await input.fill("20");
    await page.keyboard.press("Enter");
    await expect.poll(() => userKeys()[key("editor.fontSize")]).toBe(20);
    await expect.poll(body).toBe(20);
    // Escape changes nothing.
    await askFontSize(page);
    await expect(input).toHaveValue("20");
    await input.fill("30");
    await page.keyboard.press("Escape");
    await expect.poll(() => userKeys()[key("editor.fontSize")]).toBe(20);
    await expect.poll(body).toBe(20);
    await stillSame();
  } finally {
    writeFileSync(userFile, originalUser);
    writeFileSync(notePath, originalNote);
    resetFolder();
    // VS Code reads the restored settings files before the next test starts.
    await settle();
    await leaveClean(browser);
    await closeBrowser(browser);
  }
});

/** Runs Change Setting…, filters the list and picks the first row. */
async function changeSetting(page: Page, query: string, row: string) {
  await expect(page.locator(".quick-input-widget")).toBeHidden();
  await openPalette(page);
  const input = page.locator(QUICK_INPUT);
  await input.fill(">Markdown Workbench: Change Setting");
  await page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: "Change Setting" })
    .first()
    .click();
  await expect(input).toHaveAttribute(
    "placeholder",
    /Change a Markdown Workbench setting/,
  );
  await input.fill(query);
  const first = page.locator(".quick-input-list .monaco-list-row").first();
  await expect(first).toContainText(row);
  await page.keyboard.press("Enter");
}

test("Change Setting… lists every setting by plugin and edits the picked one by its type, with the Settings UI's keys", async () => {
  const originalUser = readFileSync(userFile, "utf8");
  const originalNote = readFileSync(notePath, "utf8");
  const userKeys = () => read(userFile);
  resetFolder();
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page);
    const frame = await editorFrame(page);

    // The whole list, grouped by plugin, each row with its value and description.
    await expect(page.locator(".quick-input-widget")).toBeHidden();
    await openPalette(page);
    await page.locator(QUICK_INPUT).fill(">Markdown Workbench: Change Setting");
    await page
      .locator(".quick-input-list .monaco-list-row")
      .filter({ hasText: "Change Setting" })
      .first()
      .click();
    const rows = page.locator(
      ".quick-input-list .monaco-list-row:not(.quick-input-list-separator-border)",
    );
    await expect(page.locator(".quick-input-list")).toContainText("Auto pair");
    // The list is long and virtualised: Up wraps to the last group.
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".quick-input-list")).toContainText("Word count");
    expect(await rows.count()).toBeGreaterThan(5);
    await page.keyboard.press("Escape");
    await expect(page.locator(".quick-input-widget")).toBeHidden();

    // Boolean: toggles in the user settings.
    await changeSetting(page, "readable line", "Readable line length");
    await expect
      .poll(() => userKeys()[key("editor.readableLineLength")])
      .toBe(true);
    await expect(
      frame.locator(".cm-editor.is-readable-line-width"),
    ).toHaveCount(1, { timeout: 15000 });
    // Set in the folder: that is where the next change goes.
    mkdirSync(path.dirname(folderFile), { recursive: true });
    writeFileSync(
      folderFile,
      JSON.stringify({ [key("editor.readableLineLength")]: false }),
    );
    // The folder's false overrides the user's true once VS Code has read it.
    await expect(
      frame.locator(".cm-editor.is-readable-line-width"),
    ).toHaveCount(0, { timeout: 15000 });
    await changeSetting(page, "readable line", "Readable line length");
    await expect
      .poll(() => read(folderFile)[key("editor.readableLineLength")])
      .toBe(true);
    expect(userKeys()[key("editor.readableLineLength")]).toBe(true);
    resetFolder();

    // Enum: a pick list of the values, the current one marked.
    await changeSetting(page, "default mode", "Default mode");
    const choices = page.locator(".quick-input-list .monaco-list-row");
    await expect(choices.filter({ hasText: "livePreview" })).toContainText(
      "current",
    );
    await choices
      .filter({ hasText: /^source/ })
      .first()
      .click();
    await expect
      .poll(() => userKeys()[key("editor.defaultMode")])
      .toBe("source");

    // Number: an input box that refuses values outside the range.
    const body = () =>
      frame.evaluate(() =>
        parseFloat(
          getComputedStyle(
            document.querySelector(".cm-line:not([class*='md-h'])")!,
          ).fontSize,
        ),
      );
    await expect(page.locator(".quick-input-widget")).toBeHidden();
    await changeSetting(page, "font size", "Font size");
    const input = page.locator(QUICK_INPUT);
    await expect(input).toHaveValue("16");
    await input.fill("7");
    await page.keyboard.press("Enter");
    await expect(page.locator(".quick-input-message")).toContainText(
      "from 8 to 48",
    );
    await input.fill("24");
    await page.keyboard.press("Enter");
    await expect.poll(() => userKeys()[key("editor.fontSize")]).toBe(24);
    await expect.poll(body).toBe(24);

    // String: any text.
    await expect(page.locator(".quick-input-widget")).toBeHidden();
    await changeSetting(page, "new note folder", "New note folder");
    await input.fill("Inbox");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => userKeys()[key("files.newNoteFolder")])
      .toBe("Inbox");

    // A list opens the Settings UI on that key; nothing is written.
    await expect(page.locator(".quick-input-widget")).toBeHidden();
    await changeSetting(page, "excluded files", "Excluded files");
    await expect(
      page.locator(".settings-editor .suggest-input-container"),
    ).toContainText("@id:markdownWorkbench.vault.excludedFiles");
    expect(userKeys()[key("vault.excludedFiles")]).toBeUndefined();
  } finally {
    writeFileSync(userFile, originalUser);
    writeFileSync(notePath, originalNote);
    resetFolder();
    // VS Code reads the restored settings files before the next test starts.
    await settle();
    await leaveClean(browser);
    await closeBrowser(browser);
  }
});
