import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";

/**
 * Moving the caret into or out of a block must not move any line: every
 * line keeps its offsetTop and height, and the note keeps its scrollHeight,
 * as in Obsidian.
 */
interface Layout {
  scrollHeight: number;
  rows: string[];
}

async function layout(page: Page): Promise<Layout> {
  // Let CodeMirror measure, then wait one more frame for widgets.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return page.evaluate(() => {
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const rows = [...content.children].map((child) => {
      const element = child as HTMLElement;
      return `${element.offsetTop}+${element.offsetHeight}`;
    });
    const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
    return { scrollHeight: scroller.scrollHeight, rows };
  });
}

async function caretAt(page: Page, position: number): Promise<Layout> {
  await page.evaluate((at) => window.harness.reveal(at), position);
  return layout(page);
}

async function expectStable(page: Page, doc: string, block: string) {
  await open(page, doc);
  const start = doc.indexOf(block);
  const outside = await caretAt(page, 0);
  const positions = [
    start,
    start + Math.floor(block.length / 2),
    start + block.length,
  ];
  for (const position of positions) {
    expect(await caretAt(page, position), `caret at ${position}`).toEqual(
      outside,
    );
  }
  expect(await caretAt(page, doc.length), "caret after the block").toEqual(
    outside,
  );
}

const codeBlocks: Record<string, string> = {
  "a JavaScript fence": "```js\nconst a = 1;\nconst b = 2;\n```",
  "a Python fence":
    '```python\ndef greet(name):\n    return f"Hello, {name}"\n```',
  "a fence without a language": "```\nA fence without a language.\n```",
  "a tilde fence": "~~~ts\nlet x: number = 1;\n~~~",
  "an indented code block": "    indented one\n    indented two",
  "a fence with a wrapping line": `\`\`\`json\n{ "long": "${"wrapping text ".repeat(20)}" }\n\`\`\``,
};

for (const [name, block] of Object.entries(codeBlocks)) {
  test(`${name} keeps every line in place when the caret enters or leaves`, async ({
    page,
  }) => {
    await expectStable(
      page,
      `Before\n\n${block}\n\nAfter one\n\nAfter two`,
      block,
    );
  });
}

test("code blocks keep their layout with a larger editor font", async ({
  page,
}) => {
  const block = "```ts\nexport const answer = 42;\n```";
  const doc = `Before\n\n${block}\n\nAfter`;
  await open(page, doc);
  await page.addStyleTag({
    content: ":root { --text-size: 22px !important; }",
  });
  await expectStable(page, doc, block);
});

test("a horizontal rule keeps its line height when the caret is on it", async ({
  page,
}) => {
  await expectStable(page, "Before\n\n---\n\nAfter one\n\nAfter two", "---");
});

test("a fenced block shows its language and copy button in the hidden opening fence line", async ({
  page,
}) => {
  await open(page, "Before\n\n```ts\nlet x = 1;\n```\n\nAfter");
  const fence = page.locator(".cm-line.md-code-fence-open");
  await expect(fence).toHaveCount(1);
  await expect(fence).not.toContainText("```");
  await expect(fence.locator(".code-language")).toHaveText("TypeScript");
  await expect(fence.getByRole("button", { name: "Copy code" })).toHaveCount(1);
  await expect(page.locator(".cm-line.md-code-fence-close")).toHaveText("");
  await expect(page.locator(".cm-content .token.keyword").first()).toHaveText(
    "let",
  );
  await page.evaluate(() => window.harness.reveal(12));
  await expect(fence).toContainText("```ts");
  await expect(fence.locator(".code-language")).toHaveCount(0);
  await expect(page.locator(".cm-line.md-code-fence-close")).toHaveText("```");
});

/** Reveals that show their source in place (audited; none may jump). */
const inPlace: Record<string, string> = {
  "a heading": "## A heading",
  "a quote": "> A quote\n> on two lines",
  "a list": "- one\n- two\n  - nested",
  "a task list": "- [ ] open\n- [x] done",
  "a table": "| a | b |\n| - | - |\n| 1 | 2 |",
  "a footnote definition": "[^1]: The note text.",
};

for (const [name, block] of Object.entries(inPlace)) {
  test(`${name} keeps every line in place when the caret enters or leaves`, async ({
    page,
  }) => {
    const doc = `Before[^1]\n\n${block}\n\nAfter one\n\nAfter two`;
    await expectStable(page, doc, block);
  });
}

test("block math keeps its preview height while its source is shown above it", async ({
  page,
}) => {
  // As in Obsidian, editing adds the source lines above the unchanged render.
  await open(page, "Before\n\n$$\n\\frac{a}{b}\n$$\n\nAfter");
  // Fractional line heights: measure rects, not rounded offsets.
  const measure = () =>
    page.evaluate(() => {
      const height = (element: Element) =>
        element.getBoundingClientRect().height;
      const after = [...document.querySelectorAll(".cm-line")].find(
        (line) => line.textContent === "After",
      )!;
      const source = [
        ...document.querySelectorAll(".cm-line.md-math-source"),
      ].reduce((sum, line) => sum + height(line), 0);
      return {
        after: after.getBoundingClientRect().top,
        source,
        math: height(document.querySelector(".hybrid-math")!),
      };
    });
  const outside = await caretAt(page, 0).then(measure);
  expect(outside.source).toBe(0);
  await caretAt(page, 10);
  const inside = await measure();
  expect(inside.source).toBeGreaterThan(0);
  expect(inside.math).toBeCloseTo(outside.math, 1);
  expect(inside.after).toBeCloseTo(outside.after + inside.source, 0);
});

/** The test vault's Code.md, where the owner saw lines 7→8 jump. */
const codeNote = [
  "# Code",
  "",
  "```ts",
  "export function greet(name: string): string {",
  "  return `Hello, ${name}`;",
  "}",
  "```",
  "",
  "```python",
  "def greet(name):",
  '    return f"Hello, {name}"',
  "```",
  "",
  "```json",
  '{ "fixture": true, "count": 3 }',
  "```",
  "",
  "```",
  "A fence without a language.",
  "```",
  "",
  "    An indented code block.",
  "",
  "~~~markdown",
  "# Tildes work too",
  "~~~",
].join("\n");

/** The 1-based line holding the DOM caret. */
async function caretLine(page: Page): Promise<number> {
  return page.evaluate(() => {
    const node = window.getSelection()!.focusNode!;
    const element = node instanceof Element ? node : node.parentElement!;
    const line = element.closest(".cm-line")!;
    // Only source lines count (the note title is a widget above line 1).
    return (
      [...line.parentElement!.querySelectorAll(":scope > .cm-line")].indexOf(
        line,
      ) + 1
    );
  });
}

test("moving the caret from the closing fence (line 7) to the blank line 8 moves nothing", async ({
  page,
}) => {
  await open(page, codeNote);
  const line8 = codeNote.split("\n").slice(0, 7).join("\n").length + 1;
  const outside = await caretAt(page, line8);
  await page.keyboard.press("ArrowUp");
  expect(await caretLine(page)).toBe(7);
  expect(await layout(page), "caret on line 7").toEqual(outside);
  await page.keyboard.press("ArrowDown");
  expect(await caretLine(page)).toBe(8);
  expect(await layout(page), "caret back on line 8").toEqual(outside);
});

test("walking the caret down and up through every line of the code note moves nothing", async ({
  page,
}) => {
  await open(page, codeNote);
  const lines = codeNote.split("\n").length;
  const baseline = await caretAt(page, 0);
  for (let line = 2; line <= lines; line++) {
    await page.keyboard.press("ArrowDown");
    expect(await caretLine(page), `ArrowDown to line ${line}`).toBe(line);
    expect(await layout(page), `caret on line ${line}`).toEqual(baseline);
  }
  for (let line = lines - 1; line >= 1; line--) {
    await page.keyboard.press("ArrowUp");
    expect(await caretLine(page), `ArrowUp to line ${line}`).toBe(line);
    expect(await layout(page), `caret on line ${line}`).toEqual(baseline);
  }
});

/** Each source line's top and height against its line number's. */
async function gutterRows(page: Page) {
  return page.evaluate(() => {
    const lines = [
      ...document.querySelectorAll<HTMLElement>(".cm-content > .cm-line"),
    ];
    const numbers = [
      ...document.querySelectorAll<HTMLElement>(
        ".cm-lineNumbers .cm-gutterElement",
      ),
    ].filter((element) => element.offsetHeight > 0);
    return lines.map((line, index) => {
      const number = numbers[index]!.getBoundingClientRect();
      const box = line.getBoundingClientRect();
      return {
        number: numbers[index]!.textContent,
        top: Math.round((number.top - box.top) * 10) / 10,
        height: Math.round((number.height - box.height) * 10) / 10,
      };
    });
  });
}

test("line numbers stay level with their lines when the editor font changes", async ({
  page,
}) => {
  const doc = "# Title\n\nText line\n\n```js\nlet a = 1;\n```\n\n- item\n\nEnd";
  await open(page, doc);
  for (const settings of [
    { fontSize: 12 },
    { fontSize: 20 },
    { fontSize: 16, lineHeight: 30 },
    { fontSize: 14 },
  ]) {
    await page.evaluate(
      (value) => window.harness.configureEditor(value),
      settings,
    );
    await layout(page);
    const rows = await gutterRows(page);
    const label = JSON.stringify(settings);
    // Every line has its own number, level and as tall, headings included.
    expect(
      rows.map((row) => row.number),
      label,
    ).toEqual(doc.split("\n").map((_, index) => String(index + 1)));
    for (const row of rows) {
      expect(Math.abs(row.top), `${label} line ${row.number} top`).toBeLessThan(
        1,
      );
      if (row.number !== "1") {
        expect(
          Math.abs(row.height),
          `${label} line ${row.number} height`,
        ).toBeLessThan(1);
      }
    }
  }
});
