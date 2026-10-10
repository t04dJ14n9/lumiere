import type { Frame, Page } from "@playwright/test";

/** A page, or the frame of a VS Code webview: both evaluate in the editor's document. */
export type Target = Page | Frame;

/** Obsidian 1.14.4's heading sizes in ems, measured: docs/obsidian-measurements/font-size-results-16.json. */
export const HEADING_SCALES = [1.618, 1.462, 1.318, 1.188, 1.076, 1];

/** A note with every kind of text the font size must scale. */
export const FONT_NOTE = [
  "---",
  "title: Sizes",
  "tags: [a]",
  "---",
  "# Heading 1",
  "## Heading 2",
  "### Heading 3",
  "#### Heading 4",
  "##### Heading 5",
  "###### Heading 6",
  "",
  "Body text with `inline code` and a footnote.[^1]",
  "",
  "```js",
  "const x = 1;",
  "```",
  "",
  "| a | b |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "- list item",
  "",
  "[^1]: The footnote text.",
  "",
  "End",
].join("\n");

/** Computed font sizes, in px, of each kind of note text. */
export async function sizes(page: Target) {
  return (page as Page).evaluate(() => {
    const px = (selector: string): number => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`No element for ${selector}`);
      }
      return parseFloat(getComputedStyle(element).fontSize);
    };
    const gutter = [
      ...document.querySelectorAll<HTMLElement>(
        ".cm-lineNumbers .cm-gutterElement",
      ),
    ].find((element) => element.offsetHeight > 0)!;
    const body = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
      (line) => line.textContent?.startsWith("Body text"),
    )!;
    return {
      body: parseFloat(getComputedStyle(body).fontSize),
      headings: [1, 2, 3, 4, 5, 6].map((level) => px(`.md-h${level}`)),
      inlineCode: px(".md-inline-code"),
      codeLine: px(".md-code-line"),
      tableCell: px(".hybrid-table td, .hybrid-table th"),
      properties: px(".properties"),
      footnoteRef: px(".mw-footnote-ref"),
      footnoteDefinition: px(".mw-footnote-def"),
      lineNumber: parseFloat(getComputedStyle(gutter).fontSize),
    };
  });
}

/**
 * For each line number (or stack of numbers for a rendered block) the offset
 * of the content block at the same place: its top and height against the
 * number's. Both must be zero for the number to sit level with its line.
 */
export async function gutterOffsets(page: Target) {
  return (page as Page).evaluate(() => {
    const blockElements = [
      ...document.querySelectorAll<HTMLElement>(".cm-content > *"),
    ];
    const blocks = blockElements.map((block) => block.getBoundingClientRect());
    /** The first visible text of an element. */
    const firstText = (element: Element): Node | null =>
      document
        .createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) =>
            node.nodeValue!.trim() &&
            node.parentElement!.getBoundingClientRect().width > 0
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        })
        .nextNode();
    const centre = (node: Node): number => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      return box.top + box.height / 2;
    };
    /**
     * How far the number's text sits from the line's text, vertically; null
     * where there is no comparable text (a rendered block's stack of numbers, or a superscript
     * footnote number).
     */
    const textOffset = (number: Element, block: Element): number | null => {
      const numberText = firstText(number);
      const lineText = firstText(block);
      if (
        !numberText ||
        !lineText ||
        number.querySelector(".mw-line-number-stack") ||
        block.querySelector(".mw-footnote-number") ||
        block.querySelector(".hybrid-block, .properties, .hybrid-table")
      ) {
        return null;
      }
      return centre(numberText) - centre(lineText);
    };
    const numbers = [
      ...document.querySelectorAll<HTMLElement>(
        ".cm-lineNumbers .cm-gutterElement",
      ),
    ].filter((element) => element.offsetHeight > 0);
    return numbers.map((element) => {
      const number = element.getBoundingClientRect();
      // The block whose top is nearest the number's.
      const block = blocks.reduce((best, candidate) =>
        Math.abs(candidate.top - number.top) < Math.abs(best.top - number.top)
          ? candidate
          : best,
      );
      return {
        number: element.textContent,
        top: number.top - block.top,
        height: number.height - block.height,
        textOffset: textOffset(element, blockElements[blocks.indexOf(block)]!),
      };
    });
  });
}
