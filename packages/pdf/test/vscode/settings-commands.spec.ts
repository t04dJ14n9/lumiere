import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { command, expect, openFile, pdfViewer, test } from "./workbench";
import { paths } from "./state";

// The settings commands read and write the keys the Settings editor shows:
// no state of their own, so the two always agree.

const EXTENSION_QUERY = "@ext:t04dj14n9.vscode-workshop";
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
  for (const key of keys) {
    delete settings[key];
  }
  writeFileSync(userFile, JSON.stringify(settings, null, 2));
}

const settingsEditor = (page: Page) => page.locator(".settings-editor");

/** The rows of the open quick pick, as text. */
const rows = (page: Page) => page.locator(".quick-input-list .monaco-list-row");

test.afterEach(async ({ workbench: page }) => {
  // Keep the watched directory alive: macOS can coalesce its deletion and
  // leave the configuration cache stale. An empty file removes the same keys.
  mkdirSync(path.dirname(workspaceFile), { recursive: true });
  writeFileSync(workspaceFile, "{}");
  resetUser(
    "pdfWorkshop.keyboardShortcuts",
    "pdfWorkshop.view.smoothScrolling",
    "pdfWorkshop.view.pageLayout",
    "pdfWorkshop.view.scrollMode",
    "pdfWorkshop.view.defaultZoom",
    "pdfWorkshop.regionImageCache.maxSizeMB",
    "pdfWorkshop.toolbar.mode",
  );
  // The next spec file must start from the defaults: wait until VS Code has
  // read the files again (its file watcher can take a while on a loaded runner).
  const input = page.locator(".quick-input-widget input:visible");
  for (const [filter, row, value] of [
    ["Keyboard", "Keyboard Shortcuts", "on"],
    ["Mode", "Mode", "chrome"],
    ["Smooth", "Smooth Scrolling", "follows the editor"],
    ["Layout", "Page Layout", "single"],
  ] as const) {
    // Each picker snapshots values at open time; reopen while waiting for
    // the file watcher instead of polling an old rendered snapshot.
    await expect
      .poll(
        async () => {
          await command(page, "PDF: Change Setting…");
          await input.fill(filter);
          return rows(page)
            .filter({ has: page.getByText(row, { exact: true }) })
            .first()
            .innerText();
        },
        { timeout: 30_000 },
      )
      .toContain(value);
  }
  await page.keyboard.press("Escape");
});

test("PDF: Open Settings opens the Settings editor on this extension's settings", async ({
  workbench: page,
}) => {
  await command(page, "PDF: Open Settings");
  await expect(settingsEditor(page)).toBeVisible();
  await expect(
    settingsEditor(page)
      .locator(".suggest-input-container, .search-container")
      .first(),
  ).toContainText(EXTENSION_QUERY);
  await expect(
    settingsEditor(page)
      .locator(".setting-item")
      .filter({ hasText: "Keyboard Shortcuts" })
      .first()
      .getByRole("checkbox"),
  ).toBeChecked();
  await page.screenshot({ path: "test-results/settings-open.png" });
});

test("a command saves to the workspace when the workspace sets the setting, else to the user settings", async ({
  workbench: page,
}) => {
  await command(page, "PDF: Toggle Smooth Scrolling");
  // Smooth scrolling follows the editor's setting (off here): the first toggle turns it on.
  await expect
    .poll(() => userSetting("pdfWorkshop.view.smoothScrolling"))
    .toBe(true);
  expect(workspaceSetting("pdfWorkshop.view.smoothScrolling")).toBeUndefined();

  mkdirSync(path.dirname(workspaceFile), { recursive: true });
  writeFileSync(
    workspaceFile,
    JSON.stringify({ "pdfWorkshop.view.smoothScrolling": false }),
  );
  // VS Code picks the new workspace file up through its file watcher.
  await page.waitForTimeout(3_000);
  await command(page, "PDF: Toggle Smooth Scrolling");
  await expect
    .poll(() => workspaceSetting("pdfWorkshop.view.smoothScrolling"))
    .toBe(true);
  // The user value is left alone.
  expect(userSetting("pdfWorkshop.view.smoothScrolling")).toBe(true);
});

test("the default layout and scrolling pickers write the setting, and open viewers follow", async ({
  workbench: page,
}) => {
  await openFile(page, "docs/outline.pdf");
  const viewer = await pdfViewer(page);
  const pick = async (label: string, choice: RegExp) => {
    await command(page, label);
    await page
      .locator(".quick-input-list .monaco-list-row")
      .filter({ hasText: choice })
      .first()
      .click();
  };
  await pick("PDF: Set Default Page Layout…", /Two pages \(1–2, 3–4\)/u);
  await expect
    .poll(() => userSetting("pdfWorkshop.view.pageLayout"))
    .toBe("spread");
  await expect(viewer.locator(".viewer")).toHaveAttribute(
    "data-page-layout",
    "spread",
  );
  await pick("PDF: Set Default Scrolling…", /Page-by-page/u);
  await expect
    .poll(() => userSetting("pdfWorkshop.view.scrollMode"))
    .toBe("paged");
  await pick("PDF: Set Default Zoom…", /Fit page/u);
  await expect
    .poll(() => userSetting("pdfWorkshop.view.defaultZoom"))
    .toBe("fitPage");
});

test("the View picker has a Settings… entry that opens the Settings editor", async ({
  workbench: page,
}) => {
  await openFile(page, "docs/outline.pdf");
  await pdfViewer(page);
  await command(page, "PDF: View…");
  await page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: "Settings…" })
    .first()
    .click();
  await expect(settingsEditor(page)).toBeVisible();
  await expect(
    settingsEditor(page)
      .locator(".setting-item")
      .filter({ hasText: "Keyboard Shortcuts" })
      .first(),
  ).toBeVisible();
});

test("PDF: Change Setting… lists every setting, grouped with its value, and edits each by its type", async ({
  workbench: page,
}) => {
  await command(page, "PDF: Change Setting…");
  const widget = page.locator(".quick-input-widget");
  await expect(widget).toBeVisible();
  await widget.locator("input:visible").fill("Smooth");
  await expect(
    rows(page).filter({ hasText: "Smooth Scrolling" }),
  ).toContainText("follows the editor");
  await widget.locator("input:visible").fill("Keyboard");
  await expect(
    rows(page).filter({ hasText: "Keyboard Shortcuts" }),
  ).toContainText("on");
  await widget.locator("input:visible").fill("");
  // Grouped: a separator labels each group.
  await expect(
    rows(page).filter({ hasText: "Agent Bridge" }).first(),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/change-setting.png" });
  // A boolean toggles at once.
  await widget.locator("input:visible").fill("Keyboard Shortcuts");
  await rows(page).filter({ hasText: "Keyboard Shortcuts" }).first().click();
  await expect
    .poll(() => userSetting("pdfWorkshop.keyboardShortcuts"))
    .toBe(false);

  // An enum: a pick list with the descriptions.
  await command(page, "PDF: Change Setting…");
  await widget.locator("input:visible").fill("Mode");
  await rows(page)
    .filter({ has: page.getByText("Mode", { exact: true }) })
    .first()
    .click();
  await expect(rows(page).filter({ hasText: "floating" })).toContainText(
    "floating over the pages",
  );
  await rows(page)
    .filter({ hasText: /^\s*slim/u })
    .first()
    .click();
  await expect.poll(() => userSetting("pdfWorkshop.toolbar.mode")).toBe("slim");

  // A true/false/null setting: the third choice follows the editor.
  await command(page, "PDF: Change Setting…");
  await widget.locator("input:visible").fill("Smooth Scrolling");
  await rows(page).filter({ hasText: "Smooth Scrolling" }).first().click();
  await rows(page).filter({ hasText: "Off" }).first().click();
  await expect
    .poll(() => userSetting("pdfWorkshop.view.smoothScrolling"))
    .toBe(false);
  await command(page, "PDF: Change Setting…");
  await widget.locator("input:visible").fill("Smooth Scrolling");
  await rows(page).filter({ hasText: "Smooth Scrolling" }).first().click();
  await rows(page).filter({ hasText: "Follow the editor" }).first().click();
  await expect
    .poll(() => userSetting("pdfWorkshop.view.smoothScrolling"))
    .toBeNull();

  // A number is checked against the manifest's minimum.
  await command(page, "PDF: Change Setting…");
  await widget.locator("input:visible").fill("Max Size");
  await rows(page).filter({ hasText: "Max Size" }).first().click();
  const input = widget.locator("input:visible");
  await input.fill("0");
  await expect(widget).toContainText("at least 1");
  await input.fill("64");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => userSetting("pdfWorkshop.regionImageCache.maxSizeMB"))
    .toBe(64);

  // A setting with no simple editor opens in the Settings editor.
  await command(page, "PDF: Change Setting…");
  await widget.locator("input:visible").fill("Default Zoom");
  await rows(page).filter({ hasText: "Default Zoom" }).first().click();
  await expect(settingsEditor(page)).toBeVisible();
});

test("a setting changed in the Settings editor shows in Change Setting… and the other way round", async ({
  workbench: page,
}) => {
  await command(page, "PDF: Toggle Keyboard Shortcuts");
  await expect
    .poll(() => userSetting("pdfWorkshop.keyboardShortcuts"))
    .toBe(false);
  await command(page, "PDF: Change Setting…");
  await expect(
    rows(page).filter({ hasText: "Keyboard Shortcuts" }),
  ).toContainText("off");
  await page.keyboard.press("Escape");
  await command(page, "PDF: Open Settings");
  await expect(
    settingsEditor(page)
      .locator(".setting-item")
      .filter({ hasText: "Keyboard Shortcuts" })
      .first()
      .getByRole("checkbox"),
  ).not.toBeChecked();
});
