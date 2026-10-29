/**
 * Cell click must place the caret in that cell without rewriting the table
 * source. Invisible grips / add strips previously stole edge presses
 * (Hunt 3 / Host stress +290 dirty blip).
 */
import { test, expect } from "@playwright/test";
import { open } from "./harness";

const DOC = `Before the table with enough words to drag-select.

| Name | Role | Notes |
| --- | --- | --- |
| Ada | math | first cell with a longer note so the column is wide |
| Grace | code | second cell |
| Edsger | algo | fourth cell for wheel and drag |

After the table, another paragraph for hold-and-drag selection.
`;

test("clicking a table cell opens that cell and does not rewrite the document", async ({
  page,
}) => {
  await open(page, DOC, "obsidian", {
    features: { vim: { enabled: false, config: {} } },
  });
  const before = await page.evaluate(() => window.harness.text);
  const notes = page.locator(".hybrid-table .table-cell-content").nth(11); // Edsger notes
  const box = (await notes.boundingBox())!;
  // Mid-cell press (not the bottom/right add strip, not the top column grip).
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByRole("textbox", { name: "Table cell 4, 3", exact: true }),
  ).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(before);
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect
    .poll(() => page.evaluate(() => window.harness.text.includes("drag!")))
    .toBe(true);
});

test("hold-and-drag inside an open cell keeps a native text selection", async ({
  page,
}) => {
  await open(page, DOC, "obsidian", {
    features: { vim: { enabled: false, config: {} } },
  });
  const notes = page.locator(".hybrid-table .table-cell-content").nth(11);
  await notes.click();
  const editor = page.getByRole("textbox", {
    name: "Table cell 4, 3",
    exact: true,
  });
  await expect(editor).toBeFocused();
  const box = (await editor.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + Math.min(box.width - 4, 80),
    box.y + box.height / 2,
    {
      steps: 6,
    },
  );
  await page.mouse.up();
  // Still editing the same cell — not converted into a grid/column selection.
  await expect(editor).toBeFocused();
  await expect(page.locator(".table-cell-selected")).toHaveCount(1);
});

test("native text drag onto a column grip does not start grid selection", async ({
  page,
}) => {
  await open(page, DOC, "obsidian", {
    features: { vim: { enabled: false, config: {} } },
  });
  // Open a body cell so :focus-within makes column grips pointer-hittable.
  const notes = page.locator(".hybrid-table .table-cell-content").nth(11);
  await notes.click();
  const editor = page.getByRole("textbox", {
    name: "Table cell 4, 3",
    exact: true,
  });
  await expect(editor).toBeFocused();

  const editorBox = (await editor.boundingBox())!;
  // Header Notes column grip — absolute, above the header cell box, but DOM
  // parented under that header's .table-cell-wrapper.
  const grip = page.locator(
    '.hybrid-table .table-column-handle[data-index="2"]',
  );
  await expect(grip).toBeVisible();
  const gripBox = (await grip.boundingBox())!;

  await page.mouse.move(
    editorBox.x + Math.min(editorBox.width / 2, 40),
    editorBox.y + editorBox.height / 2,
  );
  await page.mouse.down();
  // Jump onto the grip in one pointermove so we do not sample intervening
  // header/body cells (those would correctly start a grid selection). The
  // regression is ancestry treating the grip as the header cell.
  await page.mouse.move(
    gripBox.x + gripBox.width / 2,
    gripBox.y + gripBox.height / 2,
    { steps: 1 },
  );
  await page.mouse.up();

  await expect(editor).toBeFocused();
  await expect(page.locator(".table-cell-selected")).toHaveCount(1);
});

test("left cell padding opens at the start of the text, not the end", async ({
  page,
}) => {
  await open(
    page,
    "| Fruit | Colour |\n| --- | --- |\n| Banana | Yellow |\n",
    "obsidian",
    { features: { vim: { enabled: false, config: {} } } },
  );
  const banana = page.locator(".hybrid-table .table-cell-content").nth(2);
  const cell = page.locator(".hybrid-table td[data-row='1'][data-column='0']");
  const cellBox = (await cell.boundingBox())!;
  const textBox = (await banana.boundingBox())!;
  // 4px into the cell's left padding (td padding is 8px), left of the glyphs.
  await page.mouse.click(cellBox.x + 3, textBox.y + textBox.height / 2);
  const editor = page.getByRole("textbox", {
    name: "Table cell 2, 1",
    exact: true,
  });
  await expect(editor).toBeFocused();
  await page.keyboard.type("z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("| zBanana |");
});

test("right cell padding opens at the end of the text", async ({ page }) => {
  await open(
    page,
    "| Fruit | Colour |\n| --- | --- |\n| Banana | Yellow |\n",
    "obsidian",
    { features: { vim: { enabled: false, config: {} } } },
  );
  const banana = page.locator(".hybrid-table .table-cell-content").nth(2);
  const cell = page.locator(".hybrid-table td[data-row='1'][data-column='0']");
  const cellBox = (await cell.boundingBox())!;
  const textBox = (await banana.boundingBox())!;
  await page.mouse.click(
    cellBox.x + cellBox.width - 3,
    textBox.y + textBox.height / 2,
  );
  const editor = page.getByRole("textbox", {
    name: "Table cell 2, 1",
    exact: true,
  });
  await expect(editor).toBeFocused();
  await page.keyboard.type("z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("| Bananaz |");
});

test("clicking in the middle of a table cell places the caret at the clicked character, not at offset 0", async ({
  page,
}) => {
  await open(
    page,
    "| Fruit | Description |\n| --- | --- |\n| Banana | Alpha Beta Gamma |\n",
    "obsidian",
    { features: { vim: { enabled: false, config: {} } } },
  );
  const point = await page.evaluate(() => {
    const cell = document.querySelectorAll(
      ".hybrid-table .table-cell-content",
    )[3]!;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const idx = node.data.indexOf("Beta");
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + 4);
        const rect = range.getBoundingClientRect();
        return { x: rect.left, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  });
  expect(point).toBeTruthy();
  await page.mouse.click(point!.x + 1, point!.y);
  const editor = page.getByRole("textbox", {
    name: "Table cell 2, 2",
    exact: true,
  });
  await expect(editor).toBeFocused();
  await page.keyboard.type("X");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("| Alpha XBeta Gamma |");
});

test("dragging across text in an unopened table cell selects that text range", async ({
  page,
}) => {
  await open(
    page,
    "| Fruit | Description |\n| --- | --- |\n| Banana | Alpha Beta Gamma |\n",
    "obsidian",
    { features: { vim: { enabled: false, config: {} } } },
  );
  const bounds = await page.evaluate(() => {
    const cell = document.querySelectorAll(
      ".hybrid-table .table-cell-content",
    )[3]!;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const idx = node.data.indexOf("Beta");
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + 4);
        const rect = range.getBoundingClientRect();
        return {
          startX: rect.left + 1,
          endX: rect.right - 1,
          y: rect.top + rect.height / 2,
        };
      }
    }
    return null;
  });
  expect(bounds).toBeTruthy();
  await page.mouse.move(bounds!.startX, bounds!.y);
  await page.mouse.down();
  await page.mouse.move(bounds!.endX, bounds!.y, { steps: 4 });
  await page.mouse.up();
  const editor = page.getByRole("textbox", {
    name: "Table cell 2, 2",
    exact: true,
  });
  await expect(editor).toBeFocused();
  await page.keyboard.type("Z");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toContain("| Alpha Z Gamma |");
});
