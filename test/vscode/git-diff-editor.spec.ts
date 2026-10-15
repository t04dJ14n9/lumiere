/**
 * The rendered git diff in the real editor: the command against HEAD, the
 * Source Control takeover behind `diffEditor: rendered`, and turning it off.
 */
import { test, expect, chromium } from "@playwright/test";
import type { Page } from "@playwright/test";
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
  setUserSettings,
  shoot,
  useTheme,
} from "./git-fixture";

const ROWS = ".mw-diff-grid .mw-diff-row";
const panelFrames = async (page: Page) => {
  let count = 0;
  for (const frame of page.frames()) {
    count += await frame
      .locator(ROWS)
      .count()
      .then((n) => (n > 0 ? 1 : 0))
      .catch(() => 0);
  }
  return count;
};

test("rendered git diff: HEAD against the note, Source Control takeover, off", async () => {
  test.setTimeout(180000);
  createRepository();
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page, NOTE);
    await frameWith(page, ".mw-git-gutter .mw-git-bar");
    await command(page, "Markdown Workshop: Open Rendered Git Diff");
    const frame = await frameWith(page, ROWS);
    await expect(frame.locator(".mw-diff-label").first()).toContainText("HEAD");
    await expect(frame.locator(".mw-diff-label").nth(1)).toHaveText(
      "Working tree",
    );
    // Frontmatter shows as lines on both sides, the status line changed.
    await expect(
      frame.locator(".is-before .mw-gd-frontmatter .mw-gd-line-del"),
    ).toContainText("draft");
    await expect(
      frame.locator(".is-after .mw-gd-frontmatter .mw-gd-line-ins"),
    ).toContainText("reviewed");
    await expect(
      frame.locator(".is-after ins.mw-gd-ins").first(),
    ).toBeVisible();
    // The removed paragraph faces a spacer.
    await expect(
      frame.locator(".mw-diff-row.is-deleted .is-after.is-spacer"),
    ).toHaveCount(1);
    for (const theme of ["dark", "light"] as const) {
      await useTheme(page, theme);
      await shoot(page, `diffeditor-${theme}`);
    }
    setUserSettings({ "workbench.colorTheme": undefined });
    await frame.getByRole("button", { name: "Next change" }).click();
    await expect(frame.locator(".mw-diff-count")).toContainText("1 of");
    await closeEditorGroups(page);

    // With diffEditor: rendered, Source Control's text diff is replaced.
    setUserSettings({
      "markdownWorkbench.gitDiffEditor.diffEditor": "rendered",
    });
    await page.waitForTimeout(500);
    await openWorkbench(page, NOTE);
    await page.keyboard.press("Control+Shift+G");
    await page
      .locator(".scm-view .monaco-list-row", { hasText: "Gross margin.md" })
      .first()
      .click();
    await expect.poll(() => panelFrames(page), { timeout: 20000 }).toBe(1);
    await expect(
      page.locator(".tab .monaco-icon-label", { hasText: "→" }),
    ).toHaveCount(1);

    // Turned off, the panel closes and nothing takes over the text diff.
    setUserSettings({
      "markdownWorkbench.plugins.gitDiffEditor.enabled": false,
    });
    await expect.poll(() => panelFrames(page), { timeout: 15000 }).toBe(0);
    await closeEditorGroups(page);
  } finally {
    setUserSettings({
      "workbench.colorTheme": undefined,
      "markdownWorkbench.gitDiffEditor.diffEditor": undefined,
      "markdownWorkbench.plugins.gitDiffEditor.enabled": undefined,
    });
    await closeBrowser(browser);
  }
});
