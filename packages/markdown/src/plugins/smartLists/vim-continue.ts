import { CodeMirror } from "@replit/codemirror-vim";
import { continueList } from "./commands";
import { setVimListContinueHandler } from "../../shared/vim-hooks";

/**
 * Vim's `o` / `O` call `newlineAndIndentContinueComment` when set (else plain
 * `newlineAndIndent`). Wire it to smart-list continue so opening a line on a
 * list/quote/task keeps the marker and renumbers — same as Enter (BH-043).
 *
 * Unit tests install this directly; the live vim plugin uses the same hooks.
 */
export function installVimListContinue(): () => void {
  const stopHandler = setVimListContinueHandler(continueList);
  const previous = CodeMirror.commands.newlineAndIndentContinueComment;
  CodeMirror.commands.newlineAndIndentContinueComment = (cm: CodeMirror) => {
    if (continueList(cm.cm6)) {
      return;
    }
    CodeMirror.commands.newlineAndIndent(cm);
  };
  return () => {
    stopHandler();
    CodeMirror.commands.newlineAndIndentContinueComment = previous;
  };
}
