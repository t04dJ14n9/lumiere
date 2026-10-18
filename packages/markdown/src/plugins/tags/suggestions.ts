import type { SuggestionContext, SuggestionTrigger } from "../suggest/api";
export const tagSuggestion = ({
  state,
  pos,
}: SuggestionContext): SuggestionTrigger | undefined => {
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
    spaceAfter: true,
  };
};
