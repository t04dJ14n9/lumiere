import type { SuggestionContext, SuggestionTrigger } from "../suggest/api";
import {
  followsSpaceOrStart,
  isTagCharacter,
} from "../../markdown/tags/grammar";

/**
 * Offers tags while the caret ends a `#` and the tag characters after it
 * (`text #proj/`). Measured in Obsidian 1.14.4, its list opens only for a `#`
 * at the start of the line or after whitespace, so not after markup or
 * another tag (`**#a`, `#a#b`), where a tag can still start. It opens for
 * digits (`#12`), and not when a `#` follows the caret.
 */
export const tagSuggestion = ({
  state,
  pos,
}: SuggestionContext): SuggestionTrigger | undefined => {
  const line = state.doc.lineAt(pos);
  const caret = pos - line.from;
  let start = caret;
  while (start > 0 && isTagCharacter(line.text[start - 1]!)) {
    start--;
  }
  const hash = start - 1;
  if (
    line.text[hash] !== "#" ||
    !followsSpaceOrStart(line.text, hash) ||
    line.text[caret] === "#"
  ) {
    return undefined;
  }
  return {
    kind: "tag",
    query: line.text.slice(start, caret),
    from: line.from + start,
    closeLink: false,
    spaceAfter: true,
  };
};
