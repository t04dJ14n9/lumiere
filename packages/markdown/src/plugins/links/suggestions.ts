import type { SuggestionContext, SuggestionTrigger } from "../suggest/api";
export const linkSuggestion = ({
  state,
  pos,
}: SuggestionContext): SuggestionTrigger | undefined => {
  const line = state.doc.lineAt(pos);
  const match = /\[\[([^\]\n[]*)$/.exec(state.sliceDoc(line.from, pos));
  if (!match) {
    return undefined;
  }
  const typed = match[1]!;
  const bar = typed.indexOf("|");
  if (bar >= 0) {
    // An alias is being typed: the note stays offered, as in Obsidian, and
    // accepting keeps what was typed and finishes the link.
    return {
      kind: "link",
      query: typed.slice(0, bar),
      from: pos,
      closeLink: true,
      keepTyped: true,
    };
  }
  const text = typed;
  const base = { from: pos - text.length, closeLink: true };
  if (text.startsWith("^^")) {
    return { ...base, kind: "block", query: text.slice(2) };
  }
  const hash = text.indexOf("#");
  const caret = text.lastIndexOf("^");
  if (hash < 0 && caret >= 0) {
    // `[[Note^` lists the note's blocks too, as in Obsidian; the `#` comes
    // with the picked id.
    const query = text.slice(caret + 1);
    return {
      ...base,
      kind: "block",
      query,
      note: text.slice(0, caret),
      bare: true,
      from: pos - query.length - 1,
    };
  }
  if (hash < 0) {
    return { ...base, kind: "link", query: text };
  }
  const fragment = text.slice(hash + 1);
  const block = fragment.startsWith("^");
  const query = block ? fragment.slice(1) : fragment;
  return {
    ...base,
    kind: block ? "block" : "heading",
    query,
    note: text.slice(0, hash),
    from: pos - query.length,
  };
};
