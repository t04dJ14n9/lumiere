import * as vscode from "vscode";
import {
  MARKDOWN_EDITOR,
  MARKDOWN_WORKSPACE_EDITOR_KEY,
} from "../shared/editor-provider";
import { readerText } from "./reader-text";

const NATIVE_TEXT_EDITOR = "default";

/**
 * Associations already route `*.md` through the text editor (the Search→reclaim
 * path from #458) but the workspaceEditor storage flag was never set — common
 * when settings.json copies `"*.md": "default"` without running Use Lumière for
 * Markdown. Reclaim then treats notes as unassociated. Set the flag and clear
 * false readerText sticks from that misconfiguration.
 *
 * Returns whether the workspace should treat Markdown as Lumière-owned
 * (existing key or just healed). The memory write is fire-and-forget; the
 * returned flag covers the same activation so the first tab event sees it.
 */
export function healWorkspaceEditorAssociation(
  memory: vscode.Memento | undefined,
  associations: unknown = workbenchAssociations(),
): boolean {
  if (memory?.get(MARKDOWN_WORKSPACE_EDITOR_KEY, false)) {
    return true;
  }
  if (!markdownOpensAsDefaultText(associations)) {
    return false;
  }
  readerText.clear();
  void memory?.update(MARKDOWN_WORKSPACE_EDITOR_KEY, true);
  return true;
}

function workbenchAssociations(): unknown {
  return vscode.workspace
    .getConfiguration("workbench")
    .get("editorAssociations");
}

function markdownOpensAsDefaultText(associations: unknown): boolean {
  if (!associations || typeof associations !== "object") {
    return false;
  }
  const map = associations as Record<string, unknown>;
  const patterns = MARKDOWN_EDITOR.filenamePatterns;
  // At least one Markdown pattern routes through text; none still force the
  // custom editor (a partial `*.md`-only workspace settings write still heals).
  return (
    patterns.some((pattern) => map[pattern] === NATIVE_TEXT_EDITOR) &&
    patterns.every(
      (pattern) =>
        map[pattern] === undefined || map[pattern] === NATIVE_TEXT_EDITOR,
    )
  );
}
