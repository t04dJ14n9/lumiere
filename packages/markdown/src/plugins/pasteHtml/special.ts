export function mathMarkdown(node: HTMLElement): string | undefined {
  if (
    !node.matches(
      "mjx-container, .katex, .katex-display, .math, .math-inline, .math-display, .cm-hybrid-inline-math, .cm-hybrid-math-block",
    )
  ) {
    return undefined;
  }
  const tex =
    node.getAttribute("data-tex")?.trim() ||
    node.querySelector("[data-tex]")?.getAttribute("data-tex")?.trim() ||
    node
      .querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent?.trim();
  if (!tex) {
    return undefined;
  }
  return isDisplayMath(node) ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
}
export function calloutMarkdown(
  node: HTMLElement,
  convert: (node: HTMLElement) => string,
): string | undefined {
  const type = node.getAttribute("data-callout")?.trim();
  if (!type) {
    return undefined;
  }
  const titleNode = node.querySelector<HTMLElement>(".callout-title-inner");
  let title = titleNode ? convert(titleNode).trim() : "";
  const defaultTitle = type.replace(/[-_]+/g, " ");
  if (title.toLowerCase().replace(/\s+/g, " ") === defaultTitle.toLowerCase()) {
    title = "";
  }
  const bodyNode = node.querySelector<HTMLElement>(".callout-content");
  const body = bodyNode ? convert(bodyNode).trim() : "";
  const fold = node.getAttribute("data-callout-fold") ?? "";
  const marker = fold === "+" || fold === "-" ? fold : "";
  const first = `> [!${type}]${marker}${title ? ` ${title}` : ""}`;
  const lines = body
    ? body.split("\n").map((line) => (line ? `> ${line}` : ">"))
    : [];
  return `\n\n${[first, ...lines].join("\n")}\n\n`;
}
export function tableMarkdown(
  node: HTMLElement,
  convert: (node: HTMLElement) => string,
): string {
  const rows = Array.from(node.querySelectorAll("tr"))
    .map((row) =>
      Array.from(row.children)
        .filter((cell) => /^(TD|TH)$/.test(cell.nodeName))
        .map((cell) =>
          convert(cell as HTMLElement)
            .trim()
            .replace(/\n+/g, " ")
            .replace(/\|/g, "\\|"),
        ),
    )
    .filter((row) => row.length);
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (!columns) {
    return "";
  }
  // Compact, with each column's alignment and short rows left short, as
  // Obsidian writes a pasted table.
  const lines = rows.map((row) => `|${row.join("|")}|`);
  const header = node.querySelector("tr");
  const rule = Array.from({ length: columns }, (_, index) =>
    alignmentRule(header?.children[index] as HTMLElement | undefined),
  );
  lines.splice(1, 0, `|${rule.join("|")}|`);
  return `\n\n${lines.join("\n")}\n\n`;
}

/** A column's delimiter row cell: `:--`, `--:`, `:-:` or `---`. */
function alignmentRule(cell: HTMLElement | undefined): string {
  // Obsidian reads the align attribute, not CSS text-align.
  const align = (cell?.getAttribute("align") ?? "").toLowerCase();
  const rules: Record<string, string> = {
    left: ":--",
    right: "--:",
    center: ":-:",
  };
  return rules[align] ?? "---";
}

function isDisplayMath(node: HTMLElement): boolean {
  return (
    node.matches(".katex-display, .math-display, .cm-hybrid-math-block") ||
    node.getAttribute("data-display") === "true" ||
    node.querySelector("[data-display]")?.getAttribute("data-display") ===
      "true" ||
    (node.nodeName === "MJX-CONTAINER" &&
      node.getAttribute("display") === "true")
  );
}
