import * as vscode from "vscode";
import { SourceCoordinates } from "../shared/document/coordinates";
import type { NativeLineRange } from "../shared/native-links";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";
import type { NavigationIntent } from "../shared/host";
import { warmMarkdownDocument } from "./document-warm";
import { openRange, withNativeSelectionOpen } from "./native-selection-open";
import type { NativeNavigation } from "./navigation";

/**
 * Open a markdown `#L…` target in Lumière with the same line selection
 * Open Copied Agent Reference applies via `startLine`/`endLine` reveal.
 * Caller must already authorize containment (source-links `authorize`).
 */
export async function openNativeLineRange(
  navigation: NativeNavigation,
  options: {
    target: vscode.Uri;
    lines: NativeLineRange;
    column: number;
    intent: NavigationIntent;
  },
): Promise<void> {
  const { target, lines, column, intent } = options;
  if (intent.token.cancelled) {
    return;
  }
  await warmMarkdownDocument(target);
  if (intent.token.cancelled) {
    return;
  }
  const document = await vscode.workspace.openTextDocument(target);
  const selection = lineSelection(document.getText(), lines);
  if (!selection || intent.token.cancelled) {
    return;
  }
  const uri = target.toString();
  const open = () =>
    vscode.commands.executeCommand(
      "vscode.openWith",
      target,
      MARKDOWN_EDITOR.viewType,
      column,
    );
  await withNativeSelectionOpen(uri, column, () => openRange(selection), open);
  if (intent.token.cancelled) {
    return;
  }
  await navigation.revealOpened(uri, column, selection, intent);
}

/** Full-line editor offsets for a 1-based inclusive `#L` range. */
export function lineSelection(
  source: string,
  lines: NativeLineRange,
): { at: number; to: number } | undefined {
  const coordinates = new SourceCoordinates(source);
  if (lines.endLine > coordinates.editor.lines) {
    return undefined;
  }
  return {
    at: coordinates.editor.line(lines.startLine).from,
    to: coordinates.editor.line(lines.endLine).to,
  };
}
