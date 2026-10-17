import TurndownService from "turndown";
import { mathMarkdown, calloutMarkdown, tableMarkdown } from "./special";
import { imageMarkdown, linkMarkdown } from "./links";
/** Inert conversion rules are also exercised in Node using Turndown's bundled DOM. */
export function markdownFromHtml(html: string): string | undefined {
  const converter: TurndownService = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
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
  converter.addRule("table", {
    filter: "table",
    replacement: (_content, node) => tableMarkdown(node, convert),
  });
  converter.addRule("callout", {
    filter: (node) => node.hasAttribute("data-callout"),
    replacement: (_content, node) => calloutMarkdown(node, convert) ?? "",
  });
}
