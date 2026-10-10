import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { command, expect, openFile, pdfViewer, test } from "./workbench";
import { paths } from "./state";

// The settings commands read and write the keys the Settings editor shows:
// no state of their own, so the two always agree.

const EXTENSION_QUERY = "@ext:t04dj14n9.vscode-embedpdf";
const userFile = path.join(paths.userData, "User", "settings.json");
const workspaceFile = path.join(paths.workspace, ".vscode", "settings.json");

const readJson = (file: string): Record<string, unknown> => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
};
const userSetting = (key: string) => readJson(userFile)[key];
const workspaceSetting = (key: string) => readJson(workspaceFile)[key];

/** Remove a key from the user settings file: what the Settings editor's reset does. */
function resetUser(...keys: string[]): void {
  const settings = readJson(userFile);
  for (const key of keys) delete settings[key];
  writeFileSync(userFile, JSON.stringify(settings, null, 2));
}

/**
 * Run a command from the palette while the Settings editor (a dialog in this
 * VS Code) is open: clicking elsewhere, as `command` does first, would close it.
 */
async function runWhileOpen(page: Page, label: string): Promise<void> {
  await page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+Shift+P`);
  const widget = page.locator(".quick-input-widget");
  await expect(widget).toBeVisible();
  await widget.locator("input:visible").fill(`>${label}`);
  await page.locator(".quick-input-list .monaco-list-row").filter({ hasText: label }).first().click();
}

const settingsEditor = (page: Page) => page.locator(".settings-editor");

test.afterEach(() => {
  rmSync(path.join(paths.workspace, ".vscode"), { recursive: true, force: true });
  resetUser("vscodeEmbedPdf.keyboardShortcuts", "vscodeEmbedPdf.view.smoothScrolling", "vscodeEmbedPdf.view.pageLayout", "vscodeEmbedPdf.view.scrollMode", "vscodeEmbedPdf.view.defaultZoom");
});

test("PDF: Open Settings opens the Settings editor on this extension's settings, and a command moves the checkbox live", async ({ workbench: page }) => {
  await command(page, "PDF: Open Settings");
  await expect(settingsEditor(page)).toBeVisible();
  await expect(settingsEditor(page).locator(".suggest-input-container, .search-container").first()).toContainText(EXTENSION_QUERY);
  const shortcuts = settingsEditor(page).locator(".setting-item").filter({ hasText: "Keyboard Shortcuts" }).first();
  const box = shortcuts.getByRole("checkbox");
  await expect(box).toBeChecked();
  await page.screenshot({ path: "test-results/settings-open.png" });

  await runWhileOpen(page, "PDF: Toggle Keyboard Shortcuts");
  await expect.poll(() => userSetting("vscodeEmbedPdf.keyboardShortcuts")).toBe(false);
  await expect(box).not.toBeChecked();
  await runWhileOpen(page, "PDF: Toggle Keyboard Shortcuts");
  await expect.poll(() => userSetting("vscodeEmbedPdf.keyboardShortcuts")).toBe(true);
  await expect(box).toBeChecked();
});

test("a command saves to the workspace when the workspace sets the setting, else to the user settings", async ({ workbench: page }) => {
  await command(page, "PDF: Toggle Smooth Scrolling");
  // Smooth scrolling follows the editor's setting (off here): the first toggle turns it on.
  await expect.poll(() => userSetting("vscodeEmbedPdf.view.smoothScrolling")).toBe(true);
  expect(workspaceSetting("vscodeEmbedPdf.view.smoothScrolling")).toBeUndefined();

  mkdirSync(path.dirname(workspaceFile), { recursive: true });
  writeFileSync(workspaceFile, JSON.stringify({ "vscodeEmbedPdf.view.smoothScrolling": false }));
  await expect.poll(async () => {
    await command(page, "PDF: Toggle Smooth Scrolling");
    return workspaceSetting("vscodeEmbedPdf.view.smoothScrolling");
  }, { timeout: 15_000 }).toBe(true);
  // The user value is left alone.
  expect(userSetting("vscodeEmbedPdf.view.smoothScrolling")).toBe(true);
});

test("the default layout and scrolling pickers write the setting, and open viewers follow", async ({ workbench: page }) => {
  await openFile(page, "docs/outline.pdf");
  const viewer = await pdfViewer(page);
  const pick = async (label: string, choice: RegExp) => {
    await command(page, label);
    await page.locator(".quick-input-list .monaco-list-row").filter({ hasText: choice }).first().click();
  };
  await pick("PDF: Set Default Page Layout…", /Two pages \(1–2, 3–4\)/u);
  await expect.poll(() => userSetting("vscodeEmbedPdf.view.pageLayout")).toBe("spread");
  await expect(viewer.locator(".viewer")).toHaveAttribute("data-page-layout", "spread");
  await pick("PDF: Set Default Scrolling…", /Page-by-page/u);
  await expect.poll(() => userSetting("vscodeEmbedPdf.view.scrollMode")).toBe("paged");
  await pick("PDF: Set Default Zoom…", /Fit page/u);
  await expect.poll(() => userSetting("vscodeEmbedPdf.view.defaultZoom")).toBe("fitPage");
});

test("the View picker has a Settings… entry that opens the Settings editor", async ({ workbench: page }) => {
  await openFile(page, "docs/outline.pdf");
  await pdfViewer(page);
  await command(page, "PDF: View…");
  await page.locator(".quick-input-list .monaco-list-row").filter({ hasText: "Settings…" }).first().click();
  await expect(settingsEditor(page)).toBeVisible();
  await expect(settingsEditor(page).locator(".setting-item").filter({ hasText: "Keyboard Shortcuts" }).first()).toBeVisible();
});
