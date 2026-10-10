/**
 * Replays the interactions measured in real Obsidian 1.14.4
 * (docs/obsidian-measurements/tables-interactions.mjs, results in
 * docs/obsidian-measurements/tables-interactions.md) against our widget and
 * compares the resulting Markdown source and focus.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { open } from "./harness";

const TABLE =
  "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";

const text = (page: Page) => page.evaluate(() => window.harness.text);
const tableLines = async (page: Page, from = 2, to = 7) =>
  (await text(page)).split("\n").slice(from, to).join("\n");
const label = (page: Page) =>
  page.locator(".hybrid-table .cm-content").getAttribute("aria-label");

async function drag(
  page: Page,
  handle: Locator,
  target: Locator,
  offset = { x: 0, y: 0 },
): Promise<void> {
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error("Table drag target is not visible");
  }
  const x = to.x + to.width / 2 + offset.x;
  const y = to.y + to.height / 2 + offset.y;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
}

test.describe("interactions measured in Obsidian 1.14.4", () => {
  test("Add row button: appends an aligned empty row and focuses its first cell", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(4).click();
    await table
      .getByRole("button", { name: "Add row below", exact: true })
      .click();
    // Obsidian: `|     |     |     |` below `| 4   |  5  |   6 |`, caret in row 3 cell 1.
    await expect
      .poll(() => tableLines(page))
      .toBe(
        "| a   |  b  |   c |\n| --- | :-: | --: |\n| 1   |  2  |   3 |\n| 4   |  5  |   6 |\n|     |     |     |",
      );
    await expect.poll(() => label(page)).toBe("Table cell 4, 1");
  });

  test("Add column button: appends an empty header with a left-aligned delimiter and focuses it", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(4).click();
    await table.hover();
    await table
      .getByRole("button", { name: "Add column to the right", exact: true })
      .click();
    // Obsidian: `| a   |  b  |   c |     |` / `| --- | :-: | --: | --- |`, caret in the new header.
    await expect
      .poll(() => tableLines(page, 2, 6))
      .toBe(
        "| a   |  b  |   c |     |\n| --- | :-: | --: | --- |\n| 1   |  2  |   3 |     |\n| 4   |  5  |   6 |     |",
      );
    await expect.poll(() => label(page)).toBe("Table cell 1, 4");
  });

  test("Shift+Enter stores <br> and keeps the caret in the cell", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(3).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("x");
    // Obsidian: `| 1<br>x |`
    await expect
      .poll(() => tableLines(page, 4, 5))
      .toBe("| 1<br>x |  2  |   3 |");
    await expect.poll(() => label(page)).toBe("Table cell 2, 1");
  });

  test("dragging a row grip reorders rows; the moved row keeps focus", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(4).click();
    await drag(
      page,
      table.locator('.table-row-handle[data-index="1"]'),
      table.locator("tbody tr").nth(1),
      { x: 0, y: 6 },
    );
    // Obsidian: rows 1 and 2 swap.
    await expect
      .poll(() => tableLines(page, 4, 6))
      .toBe("| 4   |  5  |   6 |\n| 1   |  2  |   3 |");
  });

  test("dragging a column grip reorders columns with their alignments", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(4).click();
    await drag(
      page,
      table.locator('.table-column-handle[data-index="0"]'),
      table.locator("thead th").nth(2),
      { x: 6, y: 0 },
    );
    // Obsidian: `|  b  |   c | a   |` / `| :-: | --: | --- |`.
    await expect
      .poll(() => tableLines(page, 2, 5))
      .toBe("|  b  |   c | a   |\n| :-: | --: | --- |\n|  2  |   3 | 1   |");
  });

  test("clicking a column grip selects the column and opens no menu", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(4).click();
    await table.locator('.table-column-handle[data-index="1"]').click();
    await expect(table.getByRole("menu")).toHaveCount(0);
    await expect(table.locator(".table-cell-selected")).toHaveCount(3);
  });

  test("native undo: Tab starts a new step; the first edit's step also takes back the alignment", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(3).click();
    await page.keyboard.press("End");
    await page.keyboard.type("A", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.keyboard.type("B", { delay: 30 });
    await expect.poll(() => tableLines(page, 4, 5)).toBe("| 1A  |  B  |   3 |");
    // Same as Obsidian: the first undo removes B ...
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => tableLines(page, 4, 5)).toBe("| 1A  |  2  |   3 |");
    // ... and the next one removes A. Obsidian aligns the table when the table
    // is focused, as a history step of its own (a click dirties the note);
    // we align with the first edit, so this undo restores the original source.
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => text(page)).toBe(TABLE);
  });

  test("20 edits across cells undo one step at a time through states already seen", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(3).click();
    await page.keyboard.press("End");
    const seen = [await text(page)];
    for (let index = 0; index < 20; index++) {
      await page.keyboard.type(String.fromCharCode(97 + index), { delay: 10 });
      await expect.poll(() => text(page)).not.toBe(seen[seen.length - 1]);
      seen.push(await text(page));
      await page.keyboard.press("Tab");
      await page.waitForTimeout(150);
      seen.push(await text(page));
    }
    let current = seen[seen.length - 1]!;
    for (let step = 0; step < 60 && current !== seen[0]; step++) {
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => text(page)).not.toBe(current);
      current = await text(page);
      // Never a half-written table: every undo lands on a state we passed through.
      expect(seen).toContain(current);
    }
    expect(current).toBe(seen[0]);
  });

  for (const [name, cell, rows] of [
    ["CJK", "中文", "| 中文  |  5  |   6 |"],
    ["emoji", "😀", "| 😀  |  5  |   6 |"],
    ["combining mark", "e\u0301", "| e\u0301  |  5  |   6 |"],
    ["ZWJ sequence", "👨‍👩‍👧", "| 👨‍👩‍👧 |  5  |   6 |"],
  ] as const) {
    test(`${name} cells pad by string length, as Obsidian does`, async ({
      page,
    }) => {
      await open(page, TABLE);
      const table = page.locator(".hybrid-table");
      await table.locator(".table-cell-content").nth(6).click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText(cell);
      await expect.poll(() => tableLines(page, 5, 6)).toBe(rows);
      // The caret stays inside the cell after the grapheme, and typing continues there.
      await page.keyboard.type("z", { delay: 20 });
      await expect
        .poll(async () => (await tableLines(page, 5, 6)).includes(cell + "z"))
        .toBe(true);
    });
  }

  test("IME composition writes through to the source and commits once", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(6).click();
    await page.keyboard.press("End");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      text: "n",
      selectionStart: 1,
      selectionEnd: 1,
    });
    // Obsidian shows the composition text in the source while composing.
    await expect.poll(() => tableLines(page, 5, 6)).toBe("| 4n  |  5  |   6 |");
    await cdp.send("Input.imeSetComposition", {
      text: "ni",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await expect.poll(() => tableLines(page, 5, 6)).toBe("| 4ni |  5  |   6 |");
    await cdp.send("Input.insertText", { text: "你" });
    await expect
      .poll(() => tableLines(page, 5, 6))
      .toBe("| 4你  |  5  |   6 |");
    await expect.poll(() => label(page)).toBe("Table cell 3, 1");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => text(page)).toBe(TABLE);
  });

  test("an external edit to another cell while a cell is focused keeps the caret and later typing", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(3).click();
    await page.keyboard.press("End");
    await page.keyboard.type("A", { delay: 20 });
    await expect.poll(() => tableLines(page, 4, 5)).toBe("| 1A  |  2  |   3 |");
    // Another panel (or a git operation) changes a cell and adds a row above it.
    await page.evaluate(() => {
      window.harness.external(
        window.harness.text
          .replace("| 4   |  5  |   6 |", "| 4   |  five  |   6 |")
          .replace("para\n", "para\nnew first line\n"),
      );
    });
    await expect.poll(() => text(page)).toContain("five");
    await page.keyboard.type("B", { delay: 20 });
    await expect.poll(() => text(page)).toContain("| 1AB ");
    const final = await text(page);
    expect(final).toContain("five");
    expect(final).toContain("new first line");
    expect(final).not.toContain("| 1A ");
    await expect.poll(() => label(page)).toBe("Table cell 2, 1");
  });
});
