import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("Tab and Shift+Tab indent list items and keep focus in the note", async ({
  page,
}) => {
  await open(page, "- one\n- two");
  await page.evaluate(() => window.harness.reveal(11));
  await page.keyboard.press("Tab");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("- one\n\t- two");
  await page.keyboard.insertText("x");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("- one\n\t- twox");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.insertText("y");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("- one\n- twoxy");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest(".cm-content")),
    ),
  ).toBe(true);
});

test("Enter continues a list and an empty item leaves it", async ({ page }) => {
  await open(page, "- one");
  await page.evaluate(() => window.harness.reveal(5));
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("after");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("- one\n- two\nafter");
});

test("find field appends while the query has matches (BH-010)", async ({
  page,
}) => {
  // Repro: match path used to select-all the find field after each key
  // (CodeMirror findNext → selectSearchInput), so "p" then "r" became "r".
  await open(page, "price proper apple\n");
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByRole("textbox", { name: "Find..." });
  await expect(find).toBeFocused();
  await page.keyboard.type("p");
  await expect(find).toHaveValue("p");
  await expect(page.locator(".mw-find-count")).toHaveText("1 / 5");
  await page.keyboard.type("r");
  await expect(find).toHaveValue("pr");
  await expect(page.locator(".mw-find-count")).toHaveText("1 / 2");
});

test("Ctrl/Cmd+F opens a find bar with a match count and replace", async ({
  page,
}) => {
  await open(page, "one two\nthree two\n");
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByRole("textbox", { name: "Find..." });
  await expect(find).toBeFocused();
  await page.keyboard.insertText("two");
  const count = page.locator(".mw-find-count");
  await expect(count).toHaveText("1 / 2");
  await page.keyboard.press("Enter");
  await expect(count).toHaveText("2 / 2");
  expect(await page.evaluate(() => window.harness.text)).toBe(
    "one two\nthree two\n",
  );
  await page.keyboard.press("ControlOrMeta+h");
  await page.keyboard.insertText("2");
  await page.getByRole("button", { name: "Replace all" }).click();
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("one 2\nthree 2\n");
  await expect(count).toHaveText("No results");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mw-find")).toHaveCount(0);
  await page.keyboard.insertText("!");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("!");
});

test("block math: a click selects the formula and shows source only (BH-009)", async ({
  page,
}) => {
  // Offsets: "$$" at 8, the formula "x^2" at 11–14, "after" at 19.
  await open(page, "before\n\n$$\nx^2\n$$\n\nafter");
  const math = page.locator(".hybrid-math");
  const delimiters = page.locator(".md-math-delimiter");
  await expect(math).toHaveCount(1);
  await math.click();
  await expect
    .poll(() => page.evaluate(() => window.harness.capture()))
    .toMatchObject({ from: 11, to: 14 });
  // Source replaces the widget — no stacked preview under the $$ lines.
  await expect(math).toHaveCount(0);
  await expect(delimiters).toHaveCount(2);
  await expect(page.locator(".md-math-command")).toHaveText("^");
  await expect(page.locator(".md-math-number")).toHaveText("2");
  // Typing replaces the formula body.
  await page.keyboard.insertText("y");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("before\n\n$$\ny\n$$\n\nafter");
  // Leaving restores the render; arrowing in from above shows source again.
  await page.evaluate(() => window.harness.reveal(0));
  await expect(math).toHaveCount(1);
  await expect(delimiters).toHaveCount(0);
  await page.evaluate(() => window.harness.reveal(7));
  await page.keyboard.press("ArrowDown");
  await expect(math).toHaveCount(0);
  await expect(delimiters).toHaveCount(2);
});

test("mermaid margin click stays rendered after inserting a line above", async ({
  page,
}) => {
  const source =
    "above the diagram\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nbelow";
  await open(page, source);
  const diagram = page.locator(".hybrid-diagram");
  await expect(diagram).toHaveCount(1);
  await expect(page.locator('pre[data-fence="mermaid"] svg')).toBeVisible({
    timeout: 15_000,
  });
  // Edit above without touching Mermaid source — widget DOM is reused while
  // fence offsets shift (the ChatGPT PR 76 stale-guard trigger).
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.insertText("inserted line\n");
  await expect(diagram).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toMatch(/^inserted line\nabove the diagram/);
  const box = (await diagram.boundingBox())!;
  // Editor margin to the right of the widget (misses shell, maps into fence).
  await page.mouse.click(box.x + box.width + 12, box.y + box.height / 2);
  await expect(diagram).toHaveCount(1);
  await expect(page.locator(".cm-content")).not.toContainText("```mermaid");
});

test("mermaid margin plain click keeps prior caret and stays rendered", async ({
  page,
}) => {
  const source =
    "above the diagram\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nbelow";
  await open(page, source);
  await expect(page.locator(".hybrid-diagram")).toHaveCount(1);
  await expect(page.locator('pre[data-fence="mermaid"] svg')).toBeVisible({
    timeout: 15_000,
  });
  // Park caret in "above" before the margin click.
  await page.evaluate(() => window.harness.reveal(2));
  const before = await page.evaluate(() => window.harness.capture());
  const box = (await page.locator(".hybrid-diagram").boundingBox())!;
  await page.mouse.click(box.x + box.width + 12, box.y + box.height / 2);
  await expect(page.locator(".hybrid-diagram")).toHaveCount(1);
  await expect(page.locator(".cm-content")).not.toContainText("```mermaid");
  const after = await page.evaluate(() => window.harness.capture());
  // Plain margin click restores the pre-press selection (does not enter fence).
  expect(after.from).toBe(before.from);
  expect(after.to).toBe(before.to);
  // As in Obsidian, a double-click on the diagram does not reveal it either.
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".hybrid-diagram")).toHaveCount(1);
  await expect(page.locator(".cm-content")).not.toContainText("```mermaid");
});
test("click mid wrapped CJK inserts at the clicked character", async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 700 });
  // Stress-like: markdown markers + long lead so CJK wraps onto later visual rows.
  const source =
    "Intro with **bold**, *italic*, `code`, and a [link](https://example.com). " +
    "Latin lead words for wrapping. ".repeat(4) +
    "中文段落用来检查点击是否落在字形中间而不是跳到别处。";
  await open(page, source);
  const targetIndex = source.indexOf("检");
  expect(targetIndex).toBeGreaterThan(0);
  // Locate the glyph via rendered text (markers hidden in Live Preview).
  const point = await page.evaluate((ch) => {
    const line = document.querySelector(".cm-content > .cm-line");
    if (!line) {
      return null;
    }
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      const local = node.data.indexOf(ch);
      if (local < 0) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, local);
      range.setEnd(node, local + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    }
    return null;
  }, "检");
  expect(point).toBeTruthy();
  await page.mouse.click(point!.x, point!.y);
  // Allow pointer-freeze thaw, click-position sync, and reveal to settle.
  await page.waitForTimeout(80);
  const clicked = await page.evaluate(() => window.harness.capture());
  await page.keyboard.insertText("PROBE");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("PROBE");
  const text = await page.evaluate(() => window.harness.text);
  const probeAt = text.indexOf("PROBE");
  // Insertion must land at the clicked document offset (not visual-line start).
  expect(probeAt).toBe(clicked.from);
  expect(Math.abs(clicked.from - targetIndex)).toBeLessThanOrEqual(2);
});

test("drag across wrapped CJK selects a range without click-position snap-back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 700 });
  const source =
    "Intro with **bold**, *italic*, `code`, and a [link](https://example.com). " +
    "Latin lead words for wrapping. ".repeat(4) +
    "中文段落用来检查点击是否落在字形中间而不是跳到别处。";
  await open(page, source);
  const point = await page.evaluate((ch) => {
    const line = document.querySelector(".cm-content > .cm-line");
    if (!line) {
      return null;
    }
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      const local = node.data.indexOf(ch);
      if (local < 0) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, local);
      range.setEnd(node, local + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    }
    return null;
  }, "检");
  expect(point).toBeTruthy();
  // down → move past drag threshold → up: must remain a range (correction
  // must not fire on mousedown and snap the CM drag anchor afterward).
  await page.mouse.move(point!.x, point!.y);
  await page.mouse.down();
  await page.mouse.move(point!.x + 72, point!.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const sel = await page.evaluate(() => window.harness.capture());
  expect(sel.from).not.toBe(sel.to);
});
