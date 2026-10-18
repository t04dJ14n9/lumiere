import { noteFragment } from "../../markdown/metadata/fragments";

/** The embedded note exists but has no such heading or block. */
export class MissingSection extends Error {
  constructor() {
    super("Embedded section not found");
  }
}
export function embeddedNote(
  text: string,
  source: string,
  target: string,
  ancestry: readonly string[],
) {
  const fragment = target.includes("#")
    ? target.slice(target.indexOf("#") + 1)
    : "";
  const key = `${source}#${fragment}`;
  if (ancestry.includes(key) || ancestry.length >= 12) {
    throw new Error("Circular or deeply nested embed");
  }
  const selection = noteFragment(text, fragment);
  if (!selection) {
    throw new MissingSection();
  }
  return {
    ...selection,
    ancestry: [...ancestry, key],
    sourceLine: text.slice(0, selection.from).split("\n").length - 1,
  };
}
