import { CodeMirror } from "@replit/codemirror-vim";
import { continueList } from "./commands";

/**
 * Vim's `o` / `O` call `newlineAndIndentContinueComment` when set (else plain
 * `newlineAndIndent`). Wire it to smart-list continue so opening a line on a
 * list/quote/task keeps the marker and renumbers — same as Enter (BH-043).
 */
export function installVimListContinue(): () => void {
  const previous = CodeMirror.commands.newlineAndIndentContinueComment;
  CodeMirror.commands.newlineAndIndentContinueComment = (cm) => {
    if (continueList(cm.cm6)) {
      return;
    }
    CodeMirror.commands.newlineAndIndent(cm);
  };
  return () => {
    CodeMirror.commands.newlineAndIndentContinueComment = previous;
  };
}
