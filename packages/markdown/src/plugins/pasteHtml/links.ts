export function safeDestination(value: string): string | undefined {
  const compact = Array.from(value.trim())
    .filter((character) => character.charCodeAt(0) > 32)
    .join("");
  if (/^(javascript|vbscript|data):/i.test(compact)) {
    return undefined;
  }
  return value.trim();
}
/**
 * A link or image address as Obsidian writes it: spaces as `%20`, which
 * would otherwise end the address, and parentheses escaped.
 */
function destination(href: string): string {
  return href.replace(/ /g, "%20").replace(/[()]/g, "\\$&");
}
/** A link or image title, kept as Obsidian keeps it: ` "title"`. */
function titlePart(node: HTMLElement): string {
  const title = node.getAttribute("title")?.trim();
  return title ? ` "${title.replace(/(["\\])/g, "\\$1")}"` : "";
}
function wikiPart(value: string): string {
  return value.replace(/([\\\]|])/g, "\\$1");
}
export function linkMarkdown(content: string, node: HTMLElement): string {
  const target = node.getAttribute("data-href")?.trim();
  const label = content.trim() || node.textContent?.trim() || target || "";
  if (target) {
    return label === target
      ? `[[${wikiPart(target)}]]`
      : `[[${wikiPart(target)}|${wikiPart(label)}]]`;
  }
  const href = safeDestination(node.getAttribute("href") ?? "");
  return href ? `[${label}](${destination(href)}${titlePart(node)})` : label;
}
export function imageMarkdown(node: HTMLElement): string {
  const target =
    node.getAttribute("data-href")?.trim() ||
    node
      .closest(".internal-embed, .image-embed, [data-href]")
      ?.getAttribute("data-href")
      ?.trim();
  const alt = node.getAttribute("alt")?.trim() ?? "";
  if (target) {
    const label = alt && alt !== target ? `|${wikiPart(alt)}` : "";
    return `![[${wikiPart(target)}${label}]]`;
  }
  const src = safeDestination(node.getAttribute("src") ?? "");
  return src
    ? `![${alt.replace(/([\\\]])/g, "\\$1")}](${destination(src)}${titlePart(node)})`
    : alt;
}
