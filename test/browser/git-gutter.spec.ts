/**
 * Git change bars against a baseline the fake host serves as the git
 * extension would: one bar per rendered block, a rendered peek with revert,
 * and next/previous change.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";

const BASE =
  "# Gross margin\n\nGross margin is revenue minus cost, shown as a percentage. Report it monthly.\n\n| Region | Q3 |\n| --- | --- |\n| EMEA | 26% |\n\nMargins below 20% must be escalated.\n\n## Computation\n\n```js\nreturn (rev - cost) / rev * 100;\n```\n";
const NOW =
  "# Gross margin\n\nGross margin is revenue minus cost, expressed as a ratio. Report it per region.\n\n| Region | Q3 |\n| --- | --- |\n| EMEA | 29% |\n\n## Computation\n\n```js\nreturn (rev - cost) / rev;\n```\n\nSee also the margin standard.\n";

const bars = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".mw-git-gutter .mw-git-bar")].map((bar) =>
      [...bar.classList]
        .find((name) => name.startsWith("mw-git-bar-"))!
        .slice(11),
    ),
  );

test("bars mark modified, deleted and added blocks; a table gets one bar", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", { gitBaseline: BASE });
  await expect(page.locator(".hybrid-table")).toHaveCount(1);
  await expect
    .poll(() => bars(page))
    .toEqual(["modified", "modified", "deleted", "modified", "added", "added"]);
  // The bar column sits between line numbers and fold markers.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll(".cm-gutters > .cm-gutter")].map(
      (gutter) => gutter.className,
    ),
  );
  const at = (name: string) => order.findIndex((cls) => cls.includes(name));
  expect(at("cm-lineNumbers")).toBeLessThan(at("mw-git-gutter"));
  expect(at("mw-git-gutter")).toBeLessThan(at("cm-foldGutter"));
});

test("clicking a bar opens a rendered peek; Revert restores the text as one undo step", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", { gitBaseline: BASE });
  await expect.poll(() => bars(page)).toHaveLength(6);
  await page.locator(".mw-git-bar-modified").first().click();
  const peek = page.locator(".mw-git-peek");
  await expect(peek).toBeVisible();
  await expect(peek.locator("del.mw-gd-del")).toHaveText([
    "shown",
    "percentage",
    "monthly",
  ]);
  await expect(peek.locator("ins.mw-gd-ins")).toHaveText([
    "expressed",
    "ratio",
    "per region",
  ]);
  await expect(peek.locator(".mw-git-peek-detail")).toContainText(
    "1 of 5 changes · vs HEAD (abc1234)",
  );
  await peek.getByRole("button", { name: "Next change" }).click();
  await expect(peek.locator(".mw-git-peek-title")).toHaveText(
    /Line 7 · modified/,
  );
  await peek.getByRole("button", { name: "Previous change" }).click();
  await peek.getByRole("button", { name: "Revert this change" }).click();
  await expect(peek).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("shown as a percentage. Report it monthly.");
  await expect
    .poll(() => bars(page))
    .toEqual(["modified", "deleted", "modified", "added", "added"]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => page.evaluate(() => window.harness.text)).toBe(NOW);
});

test("a removed paragraph peeks the old text only, and Escape closes the peek", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", { gitBaseline: BASE });
  await expect.poll(() => bars(page)).toHaveLength(6);
  await page.locator(".mw-git-bar-deleted").click();
  const peek = page.locator(".mw-git-peek");
  await expect(peek.locator(".mw-git-peek-side")).toHaveCount(1);
  await expect(peek).toContainText("Margins below 20% must be escalated.");
  await page.getByRole("textbox", { name: "Markdown content" }).focus();
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
});

test("next and previous change move the caret and wrap around", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", { gitBaseline: BASE });
  await expect.poll(() => bars(page)).toHaveLength(6);
  const line = () =>
    page.evaluate(async () => {
      const state = await window.harness.viewState();
      return window.harness.text.slice(0, state.head).split("\n").length;
    });
  await page.evaluate(() => window.harness.run("editor:git-next-change"));
  await expect.poll(line).toBe(3);
  await page.evaluate(() => window.harness.run("editor:git-next-change"));
  await expect.poll(line).toBe(7);
  await page.evaluate(() => window.harness.run("editor:git-previous-change"));
  await expect.poll(line).toBe(3);
  await page.evaluate(() => window.harness.run("editor:git-previous-change"));
  await expect.poll(line).toBe(14);
  await page.evaluate(() => window.harness.run("editor:git-show-change"));
  await expect(page.locator(".mw-git-peek")).toBeVisible();
});

test("a commit clears the bars; typing updates them; no repository shows none", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", { gitBaseline: BASE });
  await expect.poll(() => bars(page)).toHaveLength(6);
  await page.evaluate(() => {
    window.harness.gitBaseline = window.harness.text;
    window.harness.gitChanged();
  });
  await expect.poll(() => bars(page)).toEqual([]);
  await page.getByRole("textbox", { name: "Markdown content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nmore");
  await expect.poll(() => bars(page)).toEqual(["added"]);
  await page.evaluate(() => {
    window.harness.gitBaseline = undefined;
    window.harness.gitChanged();
  });
  await expect.poll(() => bars(page)).toEqual([]);
});

test("turned off, the editor has no change gutter", async ({ page }) => {
  await open(page, NOW, "obsidian", {
    gitBaseline: BASE,
    features: { gitGutter: { enabled: false, config: {} } },
  });
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(1);
  await expect(page.locator(".mw-git-gutter")).toHaveCount(0);
});
