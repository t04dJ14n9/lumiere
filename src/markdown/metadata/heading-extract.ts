import MarkdownIt from "markdown-it";
import type { Tree } from "@lezer/common";
const inline = new MarkdownIt({ html: true });
export interface Heading {
  from: number;
  to: number;
  end: number;
  level: number;
  label: string;
  key: string;
  scope: string;
}
export function extractHeadings(source: string, tree: Tree): Heading[] {
  const result: Heading[] = [];
  const counts = new Map<string, number>();
  tree.iterate({
    enter(node) {
      const match = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
      if (!match) {
        return;
      }
      const text = source
        .slice(node.from, node.to)
        .split("\n")[0]!
        .replace(/^#{1,6}\s+/, "")
        .replace(/\s+#+\s*$/, "");
      const label = (inline.parseInline(text, {})[0]?.children ?? [])
        .map((token) =>
          ["text", "code_inline", "image"].includes(token.type)
            ? token.content
            : "",
        )
        .join("")
        .replace(
          /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
          (_all, target: string, alias?: string) => alias ?? target,
        );
      const base = `${match[1]}:${label}`;
      const count = counts.get(base) ?? 0;
      counts.set(base, count + 1);
      const parent = node.node.parent;
      result.push({
        from: node.from,
        to: node.to,
        end: parent?.to ?? source.length,
        level: Number(match[1]),
        label,
        key: `${base}:${count}`,
        scope: `${parent?.from}:${parent?.to}`,
      });
    },
  });
  result.forEach((heading, index) => {
    const next = result
      .slice(index + 1)
      .find(
        (other) =>
          other.scope === heading.scope && other.level <= heading.level,
      );
    if (next) {
      heading.end = Math.max(heading.to, next.from - 1);
    }
  });
  return result;
}
