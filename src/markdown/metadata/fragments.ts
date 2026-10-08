import { metadata } from "./index";
import { headingId } from "../html/helpers";
export interface SourceRange {
  from: number;
  to: number;
  text: string;
}

export function noteFragment(source: string, fragment: string): SourceRange | undefined {
  if (!fragment) {
    return { from: 0, to: source.length, text: source };
  }
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    return undefined;
  }
  const note = metadata(source);
  if (fragment.startsWith("^")) {
    const block = note.blocks[fragment.slice(1)];
    return block ? { from: block.from, to: block.to, text: block.text } : undefined;
  }
  const headings = note.headings;
  const requested = fragment.split("#").map((part) => headingId(part));
  const ancestors: typeof headings = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    while (ancestors.at(-1) && ancestors.at(-1)!.level >= heading.level) {
      ancestors.pop();
    }
    ancestors.push(heading);
    if (
      requested.every(
        (part, index) =>
          part === headingId(ancestors[ancestors.length - requested.length + index]?.heading ?? ""),
      )
    ) {
      const end =
        headings.slice(i + 1).find((next) => next.level <= heading.level)?.from ?? source.length;
      return {
        from: heading.from,
        to: end,
        text: source.slice(heading.from, end),
      };
    }
  }
  return undefined;
}
