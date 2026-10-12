/** Inline track changes over the change bars' hunks, in the rendered note. */
import { test, expect } from "@playwright/test";
import { open } from "./harness";

const BASE =
  "# Gross margin\n\nReport it monthly to finance.\n\n| Region | Q3 |\n| --- | --- |\n| EMEA | 26% |\n\nMargins below 20% must be escalated.\n\nEnd.\n";
const NOW =
  "# Gross margin\n\nReport it per region to finance.\n\n| Region | Q3 |\n| --- | --- |\n| EMEA | 29% |\n\nEnd.\n\nSee also the margin standard.\n";
const on = { enabled: true, config: {} };

test("removed words are struck through, added ones tinted, blocks get a ghost", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", {
    gitBaseline: BASE,
    features: { gitInline: on },
  });
  await expect(page.locator("del.mw-gi-removed")).toHaveText(["monthly"]);
  await expect(page.locator(".mw-gi-inserted")).toHaveText(["per region"]);
  const ghosts = page.locator(".mw-gi-ghost");
  await expect(ghosts).toHaveCount(2);
  await expect(ghosts.nth(0)).toContainText(
    "Before · line 7 in HEAD (abc1234)",
  );
  await expect(ghosts.nth(0).locator("del.mw-gd-del")).toHaveText("26");
  await expect(ghosts.nth(1)).toContainText(
    "Margins below 20% must be escalated.",
  );
  await expect(page.locator(".cm-line.mw-gi-added")).toHaveCount(2);
  // The note's text is untouched.
  expect(await page.evaluate(() => window.harness.text)).toBe(NOW);
  // Removed words are widgets, not text: they cannot be selected.
  await expect(page.locator("del.mw-gi-removed")).toHaveCSS(
    "user-select",
    "none",
  );
  // A removed word keeps a gap before the inserted word that replaces it.
  const gap = await page
    .locator("del.mw-gi-removed")
    .first()
    .evaluate((del) => parseFloat(getComputedStyle(del).marginRight));
  expect(gap).toBeGreaterThan(2);
});

test("Restore puts a removed paragraph back as one undo step", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", {
    gitBaseline: BASE,
    features: { gitInline: on },
  });
  await page
    .locator(".mw-gi-ghost.is-removed")
    .getByRole("button", { name: "Restore" })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("Margins below 20% must be escalated.\n\nEnd.");
  await expect(page.locator(".mw-gi-ghost.is-removed")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Markdown content" }).focus();
  await page.keyboard.press("Control+z");
  await expect.poll(() => page.evaluate(() => window.harness.text)).toBe(NOW);
});

test("without the change bars inline changes wait; off, nothing is drawn", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", {
    gitBaseline: BASE,
    features: { gitInline: on, gitGutter: { enabled: false, config: {} } },
  });
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(1);
  await expect(
    page.locator(".mw-gi-ghost, del.mw-gi-removed, .mw-gi-inserted"),
  ).toHaveCount(0);
  await open(page, NOW, "obsidian", { gitBaseline: BASE });
  await expect(page.locator(".mw-git-bar").first()).toBeVisible();
  await expect(
    page.locator(".mw-gi-ghost, del.mw-gi-removed, .mw-gi-inserted"),
  ).toHaveCount(0);
});

test("B1: a double-click on Restore before the recompute restores once", async ({
  page,
}) => {
  await open(page, "A\n\nC\n", "obsidian", {
    gitBaseline: "A\n\nB\n\nC\n",
    features: { gitInline: on },
  });
  const restore = page
    .locator(".mw-gi-ghost.is-removed")
    .getByRole("button", { name: "Restore" });
  await expect(restore).toBeVisible();
  await restore.dblclick();
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("A\n\nB\n\nC\n");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.harness.text)).toBe("A\n\nB\n\nC\n");
  await expect(page.locator(".mw-gi-ghost")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Markdown content" }).focus();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("A\n\nC\n");
});

test("N5: a row added to a table is shown marked beside the rendered table", async ({
  page,
}) => {
  await open(page, "| a |\n| --- |\n| 1 |\n| 2 |\n", "obsidian", {
    gitBaseline: "| a |\n| --- |\n| 1 |\n",
    features: { gitInline: on },
  });
  const ghost = page.locator(".mw-gi-ghost.is-added");
  await expect(ghost.locator("table")).toHaveCount(1);
  await expect(ghost.locator("ins.mw-gd-ins")).toHaveText("2");
});

test("F1: Restore on the second of two identical blocks after a prefix edit restores only that block", async ({
  page,
}) => {
  const base = "X\n\n```txt\nold\n```\n\nY\n\n```txt\nold\n```\n\nZ\n";
  const now = base.replace("old", "one").replace("old", "two");
  await open(page, now, "obsidian", {
    gitBaseline: base,
    features: { gitInline: on },
  });
  const ghosts = page.locator(".mw-gi-ghost");
  await expect(ghosts).toHaveCount(2);
  await page.getByRole("textbox", { name: "Markdown content" }).focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Q".repeat(19));
  await ghosts.nth(1).getByRole("button", { name: "Restore" }).click();
  // Only the second block goes back; the first keeps "one".
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("Q".repeat(19) + base.replace("old", "one"));
});
