/**
 * Git change bars against a baseline the fake host serves as the git
 * extension would: one bar per rendered block, a raw unified peek with revert,
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
  await expect(peek.locator(".mw-git-peek-line.is-delete")).toContainText(
    "shown as a percentage",
  );
  await expect(peek.locator(".mw-git-peek-line.is-add")).toContainText(
    "expressed as a ratio",
  );
  await expect(peek.locator(".mw-git-peek-detail")).toContainText(
    "1 of 5 · HEAD (abc1234) → Working tree",
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
  await expect(
    peek.locator(".mw-git-peek-line.is-delete").first(),
  ).toContainText("Margins below 20% must be escalated.");
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
  // Line 14 is a pure addition — Show Git Change opens the raw peek.
  await page.evaluate(() => window.harness.run("editor:git-show-change"));
  await expect(page.locator(".mw-git-peek")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".mw-git-peek")).toHaveCount(0);
  await page.locator(".mw-git-bar-modified").first().click();
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

const text = (page: Page) => page.evaluate(() => window.harness.text);

test("B1: after an edit above, Revert in an open peek reverts its own lines, before and after the recompute", async ({
  page,
}) => {
  for (const wait of [0, 600]) {
    await open(page, "b\n\nnew\n", "obsidian", { gitBaseline: "a\n\nold\n" });
    await expect.poll(() => bars(page)).toEqual(["modified", "modified"]);
    await page.locator(".mw-git-bar-modified").nth(1).click();
    const peek = page.locator(".mw-git-peek");
    await expect(peek.locator(".mw-git-peek-title")).toHaveText(/Line 3/);
    await page.getByRole("textbox", { name: "Markdown content" }).focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("b");
    await page.waitForTimeout(wait);
    await peek.getByRole("button", { name: "Revert this change" }).click();
    await expect.poll(() => text(page)).toBe("bb\n\nold\n");
  }
});

test("B2: added bars open a raw unified peek", async ({ page }) => {
  await open(page, "a\nnew\nz", "obsidian", { gitBaseline: "a\nz" });
  await expect.poll(() => bars(page)).toEqual(["added"]);
  const added = page.locator(".mw-git-bar-added");
  await expect(added).toHaveAttribute("title", "added");
  await added.click();
  const peek = page.locator(".mw-git-peek");
  await expect(peek).toBeVisible();
  await expect(peek.locator(".mw-git-peek-line.is-add")).toContainText("new");
  await expect(
    peek.getByRole("button", { name: "Stage this change" }),
  ).toBeDisabled();
});

test("B2b: Revert on a modified change that was just undone by hand leaves the text alone", async ({
  page,
}) => {
  await open(page, "a\nnew\nz", "obsidian", { gitBaseline: "a\nold\nz" });
  await expect.poll(() => bars(page)).toEqual(["modified"]);
  await page.locator(".mw-git-bar-modified").click();
  const revert = page
    .locator(".mw-git-peek")
    .getByRole("button", { name: "Revert this change" });
  await expect(revert).toBeVisible();
  await page.getByRole("textbox", { name: "Markdown content" }).focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.type("old\n");
  await expect.poll(() => text(page)).toBe("a\nold\nz");
  if (await revert.count()) {
    await revert.click();
  }
  await page.waitForTimeout(400);
  expect(await text(page)).toBe("a\nold\nz");
});

test("B5: either side past the line limit shows no bars; back under it, they return", async ({
  page,
}) => {
  const big = "x\n".repeat(20_001);
  await open(page, "x\n", "obsidian", { gitBaseline: big });
  await page.waitForTimeout(600);
  expect(await bars(page)).toEqual([]);
  await open(page, big, "obsidian", { gitBaseline: "y\n" });
  await page.waitForTimeout(600);
  expect(await bars(page)).toEqual([]);
  await page.getByRole("textbox", { name: "Markdown content" }).focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("z");
  await expect.poll(() => bars(page)).toEqual(["modified"]);
});

test("N1, N6: the peek shows the changed table as raw lines, with no vertical margins", async ({
  page,
}) => {
  await open(page, NOW, "obsidian", { gitBaseline: BASE });
  await expect.poll(() => bars(page)).toHaveLength(6);
  await page.locator(".mw-git-bar-modified").nth(1).click();
  const peek = page.locator(".mw-git-peek");
  await expect(peek.locator(".mw-git-peek-line.is-delete")).toContainText(
    "26%",
  );
  await expect(peek.locator(".mw-git-peek-line.is-add")).toContainText("29%");
  await expect(peek.locator("table")).toHaveCount(0);
  await expect(peek).toHaveCSS("margin-top", "0px");
  await expect(peek).toHaveCSS("margin-bottom", "0px");
});

test("R2-B1: added bars open a raw peek; held-revert races stay unit-covered", async ({
  page,
}) => {
  await open(page, "X\nA\nY", "obsidian", { gitBaseline: "A" });
  await expect.poll(() => bars(page)).toContain("added");
  await page.locator(".mw-git-bar-added").last().click();
  await expect(page.locator(".mw-git-peek")).toBeVisible();
  await expect(page.locator(".mw-git-bar-added").last()).toHaveAttribute(
    "title",
    "added",
  );
});
