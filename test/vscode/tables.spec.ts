import {
  test,
  expect,
  chromium,
  type Frame,
  type Page,
} from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { readState, paths } from "./state";
import { geometry } from "../../packages/markdown/test/support/gutter-geometry";
import {
  closeBrowser,
  command,
  docScreenshot,
  openWorkbench,
  readNote,
  workbenchPage,
} from "./workbench";

const TABLE =
  "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";
const row = (index: number) => readNote().split("\n")[index];

async function tableFrame(
  frames: () => Frame[],
  timeout = 15000,
): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of frames()) {
          if (await frame.locator(".hybrid-table").count()) {
            found = frame;
            return true;
          }
        }
        return false;
      },
      { timeout },
    )
    .toBe(true);
  return found!;
}

/** Presses undo until the note is the original table; every state on the way is a whole table. */
async function undoToOriginal(page: Page, what: string): Promise<void> {
  for (let step = 0; step < 6 && readNote() !== TABLE; step++) {
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+s");
    await page.waitForTimeout(400);
    const lines = readNote().split("\n").slice(2);
    const table = lines.slice(0, lines.indexOf(""));
    const pipes = (line: string) => line.replace(/\\\|/g, "").split("|").length;
    expect(
      table.every((line) => pipes(line) === pipes(table[0]!)),
      `${what}: undo ${step + 1} left a ragged table:\n${readNote()}`,
    ).toBe(true);
  }
  expect(readNote(), `${what}: undo restores the original`).toBe(TABLE);
}

test("tables in the real editor: a projected short or empty cell keeps its row height", async () => {
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const editor = await openWorkbench(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(
      "| 指标 | 单位 | 公示单价（元） |\n| --- | --- | --- |\n| 日志写流量 | GBasdasd | 0.0135 |\n|  |  |  |\n",
    );
    await page.keyboard.press("ControlOrMeta+s");
    const frame = await tableFrame(() => page.frames());
    const table = frame.locator(".hybrid-table");
    await command(page, "Lumière: Toggle Vim Mode");
    await expect
      .poll(() => frame.locator(".cm-vim-panel, .cm-fat-cursor").count())
      .toBeGreaterThan(0);

    for (const cell of [
      table.locator("tbody tr").nth(0).locator("td").nth(2),
      table.locator("tbody tr").nth(1).locator("td").nth(0),
    ]) {
      const row = cell.locator("..");
      const closedHeight = await row.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      await cell.click();
      await expect(table.locator(".cm-editor")).toHaveCount(1);
      const openHeight = await row.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      expect(
        Math.abs(openHeight - closedHeight),
        JSON.stringify({ closedHeight, openHeight }),
      ).toBeLessThanOrEqual(1);
    }

    await command(page, "Lumière: Toggle Vim Mode");
  } finally {
    await closeBrowser(browser);
  }
});

test("tables in the real editor: typing, Tab, edge buttons, native undo and external edits", async () => {
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const editor = await openWorkbench(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(TABLE);
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(readNote).toBe(TABLE);
    const frame = await tableFrame(() => page.frames());
    const table = frame.locator(".hybrid-table");
    const cells = table.locator(".table-cell-content");

    // Typing and Tab: the first edit aligns the table.
    await cells.nth(3).click();
    await page.keyboard.press("End");
    await page.keyboard.type("A", { delay: 40 });
    await page.keyboard.press("Tab");
    await page.keyboard.type("B", { delay: 40 });
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => row(4)).toBe("| 1A  |  B  |   3 |");
    // VS Code's own undo stack merges the host's edits into coarser steps than
    // the webview's history (a general property of workspace edits, not of
    // tables), so assert what must hold either way: every undo lands on a
    // complete table and the stack ends at the original source.
    await undoToOriginal(page, "typing and Tab");

    // Edge buttons: the new row is aligned.
    await cells.nth(4).click();
    await table.getByRole("button", { name: "Add row below" }).click();
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => row(6)).toBe("|     |     |     |");
    await page.keyboard.type("n", { delay: 40 });
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => row(6)).toBe("| n   |     |     |");
    await undoToOriginal(page, "add row");

    // The caret stays in the table after undo, so a further edit still lands in it.
    await cells.nth(3).click();
    await page.keyboard.press("End");
    await page.keyboard.type("Z", { delay: 40 });
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => row(4)).toBe("| 1Z  |  2  |   3 |");

    // An edit from outside (another tool) shows in the table; later typing keeps it.
    writeFileSync(
      path.join(paths.workspace, "Note.md"),
      readNote().replace("| 4   |  5  |   6 |", "| 4   |  five |   6 |"),
    );
    await expect(table).toContainText("five", { timeout: 15000 });
    await cells.nth(3).click();
    await page.keyboard.press("End");
    await page.keyboard.type("Y", { delay: 40 });
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => row(4)).toContain("1ZY");
    await expect.poll(readNote).toContain("five");
  } finally {
    await closeBrowser(browser);
  }
});

test("tables in the real editor: the add-row strip below and the add-column strip beside both exist, show under the pointer and work", async () => {
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const editor = await openWorkbench(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(TABLE);
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(readNote).toBe(TABLE);
    const frame = await tableFrame(() => page.frames());
    const table = frame.locator(".hybrid-table");
    const rowButton = table.getByRole("button", { name: "Add row below" });
    const columnButton = table.getByRole("button", {
      name: "Add column to the right",
    });
    const opacity = (button: typeof rowButton) =>
      button.evaluate((element) => getComputedStyle(element).opacity);
    const centre = async (button: typeof rowButton) => {
      const box = (await button.boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
    };

    // Obsidian 1.14.4: a 16px strip under the table, its full width, and one
    // beside it, its full height; each invisible until the pointer is on it.
    const grid = (await table.locator("table").boundingBox())!;
    const below = await centre(rowButton);
    const beside = await centre(columnButton);
    expect(Math.abs(below.box.y - (grid.y + grid.height))).toBeLessThanOrEqual(
      2,
    );
    expect(Math.abs(below.box.width - grid.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(below.box.height - 16)).toBeLessThanOrEqual(1);
    expect(Math.abs(beside.box.x - (grid.x + grid.width))).toBeLessThanOrEqual(
      2,
    );
    expect(Math.abs(beside.box.height - grid.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(beside.box.width - 16)).toBeLessThanOrEqual(1);
    await page.mouse.move(grid.x + grid.width / 2, grid.y + 5);
    expect(await opacity(rowButton)).toBe("0");
    expect(await opacity(columnButton)).toBe("0");

    await page.mouse.move(below.x, below.y);
    await expect.poll(() => opacity(rowButton)).toBe("1");
    expect(await opacity(columnButton)).toBe("0");
    await page.screenshot({
      path: docScreenshot("tables-add-row-vscode.png"),
    });
    await page.mouse.move(beside.x, beside.y);
    await expect.poll(() => opacity(columnButton)).toBe("1");
    await expect.poll(() => opacity(rowButton)).toBe("0");
    await page.screenshot({
      path: docScreenshot("tables-add-column-vscode.png"),
    });

    // Row insertion changes the strip geometry. Locator clicks wait for its
    // current position, and typing waits for the new cell to receive focus.
    await rowButton.click();
    await expect(
      table.getByRole("textbox", { name: "Table cell 4, 1", exact: true }),
    ).toBeFocused();
    await page.keyboard.type("n", { delay: 40 });
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => row(6)).toBe("| n   |     |     |");
    await columnButton.click();
    await expect(
      table.getByRole("textbox", { name: "Table cell 1, 4", exact: true }),
    ).toBeFocused();
    await page.keyboard.type("h", { delay: 40 });
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => row(2)).toMatch(/^\| a +\| +b +\| +c +\| h +\|$/);
  } finally {
    await closeBrowser(browser);
  }
});

test("line numbers in the real editor: a table gets one number level with its header, and the next number follows it directly", async () => {
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const editor = await openWorkbench(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(
      "# Wider\n\n| Col A | Col B | Col C |\n| --- | --- | --- |\n| pipe | code | bold |\n| row 2 | more | cells |\n\nClick a cell.\nLast line\n",
    );
    await page.keyboard.press("ControlOrMeta+s");
    const frame = await tableFrame(() => page.frames());
    await expect
      .poll(async () => (await geometry(frame)).numbers.map((n) => n.n))
      .toEqual(["1", "2", "3", "7", "8", "9", "10"]);
    const g = await geometry(frame);
    const three = g.numbers.find((n) => n.n === "3")!;
    const seven = g.numbers.find((n) => n.n === "7")!;
    expect(Math.abs(three.top - g.table.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(seven.top - g.table.bottom)).toBeLessThanOrEqual(2);
    expect(Math.abs(three.textCentre - g.headerCentre)).toBeLessThanOrEqual(3);
    await page.screenshot({
      path: docScreenshot("tables-line-numbers-vscode.png"),
    });
  } finally {
    await closeBrowser(browser);
  }
});

test("column handle copy reaches the native clipboard and pastes TSV into prose", async () => {
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    const editor = await openWorkbench(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(TABLE);
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(readNote).toBe(TABLE);
    const frame = await tableFrame(() => page.frames());
    const table = frame.locator(".hybrid-table");
    await table
      .locator('.table-column-handle[data-index="1"]')
      .click({ force: true });
    await expect(table.locator(".table-cell-selected")).toHaveCount(3);
    await page.keyboard.press("ControlOrMeta+c");
    // Paste back into ordinary prose to verify the OS clipboard, rather than
    // observing a message or substituting a clipboard API in the webview.
    await frame
      .locator(".cm-line")
      .filter({ hasText: /^after$/ })
      .click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ControlOrMeta+v");
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(readNote).toContain("b\n2\n5");
  } finally {
    await closeBrowser(browser);
  }
});
