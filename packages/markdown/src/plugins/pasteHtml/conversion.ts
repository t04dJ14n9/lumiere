import TurndownService from "turndown";
import { mathMarkdown, calloutMarkdown, tableMarkdown } from "./special";
import { imageMarkdown, linkMarkdown } from "./links";
/**
 * Rich text as Markdown, written as Obsidian writes it (measured): `_italic_`,
 * `- item` and `1. item` with one space, `---` rules and compact tables. Unlike
 * Obsidian, Markdown characters in the text are escaped, so the note shows
 * what was copied. Inert conversion rules are also exercised in Node using
 * Turndown's bundled DOM.
 */
export function markdownFromHtml(html: string): string | undefined {
  const converter: TurndownService = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    strongDelimiter: "**",
    hr: "---",
    blankReplacement: (_content, node) =>
      mathMarkdown(node) ??
      calloutMarkdown(node, (child) => converter.turndown(child)) ??
      "",
  });
  registerInlineRules(converter);
  registerBlockRules(converter);
  return converter.turndown(html).trim() || undefined;
}
function registerInlineRules(converter: TurndownService): void {
  converter.remove(["script", "style", "iframe", "object", "embed"]);
  converter.addRule("strike", {
    filter: (node) => /^(S|DEL|STRIKE)$/.test(node.nodeName),
    replacement: (content) => `~~${content.trim()}~~`,
  });
  converter.addRule("highlight", {
    filter: (node) =>
      node.matches(
        "mark, .cm-highlight, .cm-active-highlight, .cm-hybrid-highlight",
      ),
    replacement: (content) => `==${content.trim()}==`,
  });
  converter.addRule("math", {
    filter: (node) => mathMarkdown(node) !== undefined,
    replacement: (_content, node) => mathMarkdown(node) ?? "",
  });
  converter.addRule("link", { filter: "a", replacement: linkMarkdown });
  converter.addRule("image", {
    filter: "img",
    replacement: (_content, node) => imageMarkdown(node),
  });
  converter.addRule("task", {
    filter: (node) =>
      node.nodeName === "INPUT" && node.getAttribute("type") === "checkbox",
    replacement: (_content, node) =>
      node.hasAttribute("checked") ? "[x] " : "[ ] ",
  });
}
function registerBlockRules(converter: TurndownService): void {
  const convert = (node: HTMLElement) => converter.turndown(node);
  converter.addRule("listItem", {
    filter: "li",
    replacement: listItemMarkdown,
  });
  converter.addRule("table", {
    filter: "table",
    replacement: (_content, node) => tableMarkdown(node, convert),
  });
  converter.addRule("callout", {
    filter: (node) => node.hasAttribute("data-callout"),
    replacement: (_content, node) => calloutMarkdown(node, convert) ?? "",
  });
}

/**
 * A list item, as Obsidian writes one: its marker and one space, and the
 * lines after its first (nested lists, more paragraphs) four spaces in.
 */
function listItemMarkdown(content: string, node: HTMLElement): string {
  const parent = node.parentNode as HTMLElement | null;
  let marker = "-";
  if (parent?.nodeName === "OL") {
    const start = Number(parent.getAttribute("start") ?? 1);
    marker = `${start + Array.prototype.indexOf.call(parent.children, node)}.`;
  }
  const paragraph = content.endsWith("\n");
  const body = content.replace(/^\n+|\n+$/g, "") + (paragraph ? "\n" : "");
  return `${marker} ${body.replace(/\n/g, "\n    ")}${node.nextSibling ? "\n" : ""}`;
}
