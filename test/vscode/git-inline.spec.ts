/**
 * Inline git changes in the real editor: the toggle command, word marks and
 * ghost blocks against VS Code's git extension, Restore, and the dependency on
 * the change bars.
 */
import { test, expect, chromium } from "@playwright/test";
import { readState } from "./state";
import {
  closeBrowser,
  closeEditorGroups,
  command,
  openWorkbench,
  workbenchPage,
} from "./workbench";
import {
  NOTE,
  createRepository,
  frameWith,
  readGitNote,
  setUserSettings,
  shoot,
  useTheme,
} from "./git-fixture";

test("inline git changes: toggle, track changes, restore, waits for the bars", async () => {
  test.setTimeout(180000);
  createRepository();
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page, NOTE);
    await frameWith(page, ".mw-git-gutter .mw-git-bar");
    await command(page, "Lumière: Toggle Inline Git Changes");
    // Palette text must not be mistaken for an insert mark (scope to note body).
    await expect(page.locator(".quick-input-widget")).toBeHidden({
      timeout: 15000,
    });
    const frame = await frameWith(page, ".cm-content del.mw-gi-removed");
    await expect(
      frame
        .locator(".cm-content del.mw-gi-removed")
        .filter({ hasText: /^shown$/ }),
    ).toBeVisible();
    await expect(
      frame
        .locator(".cm-content .mw-gi-inserted")
        .filter({ hasText: /^expressed$/ }),
    ).toBeVisible();
    // Frontmatter, the table and the code block get a ghost; the removed paragraph too.
    await expect(frame.locator(".mw-gi-ghost")).toHaveCount(4);
    await expect(frame.locator(".mw-gi-ghost.is-removed")).toContainText(
      "Margins below 20% must be escalated",
    );
    for (const theme of ["dark", "light"] as const) {
      await useTheme(page, theme);
      await shoot(page, `inline-${theme}`);
      await frame.evaluate(() => {
        const scroller = document.querySelector(".cm-scroller")!;
        scroller.scrollTop = scroller.scrollHeight;
      });
      await page.waitForTimeout(300);
      await shoot(page, `inline-blocks-${theme}`);
    }
    setUserSettings({ "workbench.colorTheme": undefined });

    await frame
      .locator(".mw-gi-ghost.is-removed")
      .getByRole("button", { name: "Restore" })
      .click();
    await page.keyboard.press("ControlOrMeta+s");
    await expect
      .poll(readGitNote)
      .toContain("Margins below 20% must be escalated");
    await expect(frame.locator(".mw-gi-ghost.is-removed")).toHaveCount(0);

    // Without the bars it waits; with them again it returns.
    setUserSettings({ "lumiere.markdown.plugins.gitGutter.enabled": false });
    await expect(frame.locator(".mw-gi-ghost")).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(frame.locator("del.mw-gi-removed")).toHaveCount(0);
    setUserSettings({
      "lumiere.markdown.plugins.gitGutter.enabled": undefined,
    });
    await expect(frame.locator(".mw-gi-ghost")).toHaveCount(3, {
      timeout: 15000,
    });

    // Toggled off, every mark goes and the text stays.
    const before = readGitNote();
    await command(page, "Lumière: Toggle Inline Git Changes");
    await expect(
      frame.locator(".mw-gi-ghost, del.mw-gi-removed, .mw-gi-inserted"),
    ).toHaveCount(0, {
      timeout: 15000,
    });
    expect(readGitNote()).toBe(before);
    await closeEditorGroups(page);
  } finally {
    setUserSettings({
      "workbench.colorTheme": undefined,
      "lumiere.markdown.plugins.gitGutter.enabled": undefined,
      "lumiere.markdown.plugins.gitInline.enabled": undefined,
    });
    await closeBrowser(browser);
  }
});
