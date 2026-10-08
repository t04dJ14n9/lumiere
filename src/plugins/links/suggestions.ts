import type { SuggestionSource } from "../suggest/api";
export const linkSuggestion: SuggestionSource = ({ state, pos }) => {
  const line = state.doc.lineAt(pos);
  const match = /\[\[([^\]\n|[]*)$/.exec(state.sliceDoc(line.from, pos));
  if (!match) {
    return undefined;
  }
  const text = match[1]!;
  const base = { from: pos - text.length, closeLink: true };
  if (text.startsWith("^^")) {
    return { ...base, kind: "block", query: text.slice(2) };
  }
  const hash = text.indexOf("#");
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
