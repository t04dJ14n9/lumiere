/**
 * Ctrl+G → Go to Line in Live Preview / Source (BH-033).
 *
 * VS Code's `workbench.action.gotoLine` needs a text editor. Lumière is a
 * custom editor, so the stock chord shows "Open a text editor first…". Own
 * Ctrl+G (same as the PDF viewer) and jump via vaults.open at the line start.
 */

import type { Context } from "@workshop/core";
import { SourceCoordinates } from "../../shared/document/coordinates";
import { contributionId } from "../../shared/setting-schema";
import type { Editors } from "./api";

export const GO_TO_LINE_COMMAND = contributionId("goToLine");

/**
 * A line number typed by the reader ("7", " 7 "), clamped to the document;
 * `undefined` for anything else.
 */
export function parseLineInput(
  text: string,
  lineCount: number,
): number | undefined {
  const trimmed = text.trim();
  if (!/^\d{1,9}$/u.test(trimmed) || lineCount < 1) {
    return undefined;
  }
  return Math.min(Math.max(1, Number.parseInt(trimmed, 10)), lineCount);
}

/** Source offset of the first character on `line` (1-based). */
export function lineStartOffset(source: string, line: number): number {
  const coordinates = new SourceCoordinates(source);
  const lines = coordinates.editor.lines;
  if (lines < 1) {
    return 0;
  }
  const target = Math.min(Math.max(1, line), lines);
  return coordinates.toSource(coordinates.editor.line(target).from);
}

/** Register Go to Line… on the host (palette + Ctrl+G). */
export function registerGoToLine(ctx: Context, editors: Editors): void {
  ctx.effect(() =>
    ctx.hostCommands.register(GO_TO_LINE_COMMAND, (line?: unknown) =>
      goToLine(ctx, editors, line),
    ),
  );
}

async function goToLine(
  ctx: Context,
  editors: Editors,
  line: unknown,
): Promise<void> {
  const panel = editors.active();
  const vaults = ctx.vaults;
  if (!panel || !vaults) {
    return;
  }
  const document = panel.document;
  const version = document.version;
  const source = document.getText();
  const coordinates = new SourceCoordinates(source);
  const lineCount = coordinates.editor.lines;
  if (lineCount < 1) {
    return;
  }

  let target: number | undefined;
  if (typeof line === "number" && Number.isSafeInteger(line)) {
    target = Math.min(Math.max(1, line), lineCount);
  } else {
    let current = 1;
    try {
      const selection = await ctx.selections.capture(panel.id);
      if (selection?.startLine) {
        current = selection.startLine;
      }
    } catch {
      // Keep line 1 when capture fails (webview not ready).
    }
    const text = await ctx.dialogs.input({
      prompt: `Type a line number between 1 and ${lineCount}`,
      value: String(current),
      validate: (value) =>
        parseLineInput(value, lineCount) === undefined
          ? `Type a line number between 1 and ${lineCount}`
          : undefined,
    });
    if (text === undefined) {
      return;
    }
    target = parseLineInput(text, lineCount);
  }

  if (
    target === undefined ||
    editors.active() !== panel ||
    document.version !== version
  ) {
    return;
  }
  const offset = coordinates.toSource(coordinates.editor.line(target).from);
  await vaults.open(document.uri, { offset });
}
