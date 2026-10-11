/**
 * The text caret never enters the Properties block, as measured in Obsidian
 * 1.14.4 (docs/obsidian-measurements/properties/caret-and-properties.mjs,
 * results.md). Offsets are written as "line:column" like the probe's output.
 */
import { test, expect, type Page } from "@playwright/test";
import { open } from "./harness";

const documentStart =
  process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home";

const NOTE = "---\ntitle: T\ntags:\n  - a\n---\nFirst body line\nSecond line\n";
const offset = (text: string, line: number, column: number) =>
  text
    .split("\n")
    .slice(0, line)
    .reduce((total, row) => total + row.length + 1, 0) + column;

async function start(page: Page, line: number, column: number, text = NOTE) {
  await open(page, text);
  await page.evaluate(
    (at) => window.harness.reveal(at),
    offset(text, line, column),
  );
  await expect.poll(() => selection(page)).toMatch(/^\d+:\d+ \d+:\d+$/);
}

/** `from to` of the main selection, as line:column. */
function selection(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const chosen = await window.harness.capture();
    const text = window.harness.text;
    const at = (position: number) => {
      const lines = text.slice(0, position).split("\n");
      return `${lines.length - 1}:${lines[lines.length - 1]!.length}`;
    };
    return `${at(chosen.from)} ${at(chosen.to)}`;
  });
}

const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    return element.closest("[data-property-key]")
      ? `row:${element.closest("[data-property-key]")!.getAttribute("data-property-key")}`
      : element.hasAttribute("data-property-add")
        ? "add"
        : element.hasAttribute("data-properties-heading")
          ? "heading"
          : element.getAttribute("role") === "textbox"
            ? "editor"
            : element.tagName;
  });

test.describe("the caret stays out of the Properties block", () => {
  test("arrow keys, document start, Page Up and Shift selections stop at the start of the body", async ({
    page,
  }) => {
    await start(page, 5, 0);
    for (const [keys, expected] of [
      ["ArrowLeft", "5:0 5:0"],
      [documentStart, "5:0 5:0"],
      ["PageUp", "5:0 5:0"],
      ["Control+ArrowUp", "5:0 5:0"],
      ["Shift+ArrowUp", "5:0 5:0"],
      [`Shift+${documentStart}`, "5:0 5:0"],
    ] as const) {
      await start(page, 5, 0);
      await page.keyboard.press(keys);
      await expect.poll(() => selection(page), keys).toBe(expected);
      expect(await focused(page), keys).toBe("editor");
    }
    await start(page, 6, 3);
    await page.keyboard.press(documentStart);
    await expect.poll(() => selection(page)).toBe("5:0 5:0");
    await start(page, 6, 3);
    await page.keyboard.press(`Shift+${documentStart}`);
    await expect.poll(() => selection(page)).toBe("5:0 6:3");
  });

  test("Select All selects the body only; Backspace at its start changes nothing", async ({
    page,
  }) => {
    await start(page, 5, 0);
    await page.keyboard.press("ControlOrMeta+a");
    await expect.poll(() => selection(page)).toBe("5:0 7:0");
    await start(page, 5, 0);
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.harness.text)).toBe(NOTE);
    expect(await selection(page)).toBe("5:0 5:0");
  });

  test("a selection placed inside the properties lands at the body start, and typing goes there", async ({
    page,
  }) => {
    await start(page, 1, 3);
    expect(await selection(page)).toBe("5:0 5:0");
    await page.keyboard.type("X");
    await expect
      .poll(() => page.evaluate(() => window.harness.text))
      .toBe(NOTE.replace("First", "XFirst"));
  });

  test("opening a note puts the caret at the body start, not in the properties", async ({
    page,
  }) => {
    await open(page, NOTE);
    expect(await selection(page)).toBe("5:0 5:0");
  });

  test("ArrowUp on the first body line focuses the Add property button, then walks up the rows", async ({
    page,
  }) => {
    await start(page, 5, 4);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toBe("add");
    expect(await selection(page)).toBe("5:0 5:0");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toBe("row:tags");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toBe("row:title");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toBe("heading");
  });

  test("ArrowUp from a later line stays in the text; the first line is the way out", async ({
    page,
  }) => {
    await start(page, 6, 4);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => selection(page)).toMatch(/^5:\d+ 5:\d+$/);
    expect(await focused(page)).toBe("editor");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toBe("add");
  });

  test("Escape from a row, and Tab or ArrowDown from the Add button, return to the text", async ({
    page,
  }) => {
    await start(page, 5, 0);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toBe("row:tags");
    await page.keyboard.press("Escape");
    await expect.poll(() => focused(page)).toBe("editor");
    expect(await selection(page)).toBe("5:0 5:0");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toBe("add");
    await page.keyboard.press("Tab");
    await expect.poll(() => focused(page)).toBe("editor");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focused(page)).toBe("editor");
    expect(await selection(page)).toBe("5:0 5:0");
  });

  test("a blank line after the properties is still a body line: two ArrowUps to leave", async ({
    page,
  }) => {
    const note = "---\ntitle: T\n---\n\nbody\n";
    await start(page, 4, 0, note);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => selection(page)).toBe("3:0 3:0");
    expect(await focused(page)).toBe("editor");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focused(page)).toBe("add");
  });

  test("a note that is only properties keeps the caret after them", async ({
    page,
  }) => {
    const note = "---\ntitle: T\n---\n";
    await start(page, 0, 0, note);
    expect(await selection(page)).toBe("3:0 3:0");
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ControlOrMeta+Home");
    expect(await selection(page)).toBe("3:0 3:0");
  });

  test("editing a property still rewrites the frontmatter", async ({
    page,
  }) => {
    await start(page, 5, 0);
    const row = page.locator('[data-property-key="title"]');
    await row.locator("[data-property-input]").fill("Changed");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => window.harness.text))
      .toContain("title: Changed");
  });
});
