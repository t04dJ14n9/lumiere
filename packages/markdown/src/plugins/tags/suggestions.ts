import type { SuggestionSource } from "../suggest/api";
export const tagSuggestion: SuggestionSource = ({ state, pos }) => {
  const line = state.doc.lineAt(pos);
  const match = /(?:^|[\s(])#([\p{L}\p{N}_/-]*)$/u.exec(
    state.sliceDoc(line.from, pos),
  );
  if (!match) {
    return undefined;
  }
  return {
    kind: "tag",
    query: match[1]!,
    from: pos - match[1]!.length,
    closeLink: false,
  };
};
