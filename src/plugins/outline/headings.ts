import type { NoteMetadata } from "../../markdown/metadata";

/** A heading with its place in the outline. */
export interface OutlineHeading {
  /** Stable while the outline's shape is unchanged: `0`, `0/2`, `0/2/1`. */
  id: string;
  title: string;
  level: number;
  /** Offset of the heading in the note's text. */
  offset: number;
  parent?: OutlineHeading;
  children: OutlineHeading[];
}

/**
 * Nest headings by level, as Obsidian's Outline does: a heading belongs to
 * the nearest earlier heading with a lower level. Skipped levels nest
 * directly (an `###` after an `#` is its child).
 */
export function outlineOf(
  headings: NoteMetadata["headings"],
): OutlineHeading[] {
  const roots: OutlineHeading[] = [];
  const stack: OutlineHeading[] = [];
  for (const heading of headings) {
    while (stack.length > 0 && stack.at(-1)!.level >= heading.level) {
      stack.pop();
    }
    const parent = stack.at(-1);
    const siblings = parent ? parent.children : roots;
    const node: OutlineHeading = {
      id: parent ? `${parent.id}/${siblings.length}` : String(siblings.length),
      title: heading.heading,
      level: heading.level,
      offset: heading.position.start.offset,
      ...(parent && { parent }),
      children: [],
    };
    siblings.push(node);
    stack.push(node);
  }
  return roots;
}

/** The last heading at or before an offset: the section the caret is in. */
export function headingAt(
  outline: readonly OutlineHeading[],
  offset: number,
): OutlineHeading | undefined {
  let found: OutlineHeading | undefined;
  for (const heading of outline) {
    if (heading.offset > offset) {
      break;
    }
    found = headingAt(heading.children, offset) ?? heading;
  }
  return found;
}
