/**
 * Git change bars in the real editor, against VS Code's own git extension:
 * bars from HEAD, the rendered peek with Revert and Stage, a commit clearing
 * the bars, and turning the plugin off.
 */
import { test, expect, chromium } from "@playwright/test";
import type { Frame } from "@playwright/test";
import { readState } from "./state";
import {
  closeBrowser,
  closeEditorGroups,
  openWorkbench,
  workbenchPage,
} from "./workbench";
import {
  BASE,
  NOTE,
  NOW,
  commitAll,
  createRepository,
  frameWith,
  readGitNote,
  setUserSettings,
  shoot,
  stagedNames,
  useTheme,
} from "./git-fixture";

const kinds = (frame: Frame) =>
  frame.evaluate(() =>
    [...document.querySelectorAll(".mw-git-gutter .mw-git-bar")].map((bar) =>
      [...bar.classList]
        .find((name) => name.startsWith("mw-git-bar-"))!
        .slice(11),
    ),
  );

test("git change bars: HEAD diff, rendered peek, revert, stage, commit, off", async () => {
  test.setTimeout(180000);
  createRepository();
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await openWorkbench(page, NOTE);
    const frame = await frameWith(page, ".mw-git-gutter .mw-git-bar");
    // Frontmatter, paragraph, table (one bar), the removal, two code lines
    // (code blocks keep their source lines) and the added paragraph.
    await expect
      .poll(() => kinds(frame), { timeout: 20000 })
      .toEqual([
        "modified",
        "modified",
        "modified",
        "deleted",
        "modified",
        "modified",
        "added",
        "added",
      ]);
    for (const theme of ["dark", "light"] as const) {
      await useTheme(page, theme);
      await shoot(page, `gutter-${theme}`);
      await frame.locator(".mw-git-bar-modified").nth(1).click();
      await expect(frame.locator(".mw-git-peek")).toBeVisible();
      await expect(
        frame.locator(".mw-git-peek ins.mw-gd-ins").first(),
      ).toBeVisible();
      await shoot(page, `peek-${theme}`);
      await frame.getByRole("button", { name: "Close" }).click();
      await expect(frame.locator(".mw-git-peek")).toHaveCount(0);
    }
    setUserSettings({ "workbench.colorTheme": undefined });

    // Revert the paragraph from the peek; saving writes HEAD's sentence back.
    await frame.locator(".mw-git-bar-modified").nth(1).click();
    await frame.getByRole("button", { name: "Revert this change" }).click();
    await page.keyboard.press("ControlOrMeta+s");
    await expect
      .poll(readGitNote)
      .toContain("shown as a percentage. Report it monthly.");
    await expect.poll(() => kinds(frame)).toHaveLength(7);

    // Stage File stages through the git extension.
    await frame.locator(".mw-git-bar-modified").first().click();
    await frame.getByRole("button", { name: "Stage the file" }).click();
    await expect
      .poll(stagedNames, { timeout: 20000 })
      .toContain("Gross margin.md");

    // A commit outside the editor clears the bars.
    commitAll();
    await expect.poll(() => kinds(frame), { timeout: 20000 }).toEqual([]);

    // Turned off, the bars go and nothing else changes; on again, they return.
    await frame.getByRole("textbox", { name: "Markdown content" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\nlater", { delay: 20 });
    await expect
      .poll(() => kinds(frame), { timeout: 10000 })
      .toEqual(["added"]);
    setUserSettings({ "markdownWorkbench.plugins.gitGutter.enabled": false });
    await expect(frame.locator(".mw-git-gutter")).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(frame.locator(".cm-lineNumbers")).toHaveCount(1);
    setUserSettings({
      "markdownWorkbench.plugins.gitGutter.enabled": undefined,
    });
    await expect
      .poll(() => kinds(frame), { timeout: 15000 })
      .toEqual(["added"]);
    expect(BASE).not.toBe(NOW);
    await closeEditorGroups(page);
  } finally {
    setUserSettings({
      "workbench.colorTheme": undefined,
      "markdownWorkbench.plugins.gitGutter.enabled": undefined,
    });
    await closeBrowser(browser);
  }
});
