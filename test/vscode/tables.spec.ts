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
import {
  closeBrowser,
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
