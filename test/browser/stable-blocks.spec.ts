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
