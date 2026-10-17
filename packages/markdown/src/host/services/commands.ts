import * as vscode from "vscode";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import type { HostCommands } from "../../shared/host";
import { warmMarkdownDocument } from "../document-warm";
import { textBypass } from "../reclaim";
import { toDisposer } from "./documents";

/** Commands whose first argument is a URI, which plugins pass as a string. */
const URI_COMMANDS = new Set([
  "vscode.open",
  "vscode.openWith",
  "markdown.showPreview",
  "markdown.showPreviewToSide",
  "chatgpt.addFileToThread",
]);

export function createHostCommands(): HostCommands {
  return {
    register: (id, run) => toDisposer(vscode.commands.registerCommand(id, run)),
    async execute(id, ...args) {
      const nativeArgs = commandArguments(id, args);
      if (
        id === "vscode.openWith" &&
        nativeArgs[1] === MARKDOWN_EDITOR.viewType
      ) {
        await warmMarkdownDocument(nativeArgs[0] as vscode.Uri);
      }
      return vscode.commands.executeCommand(id, ...nativeArgs);
    },
  };
}

function commandArguments(id: string, args: unknown[]): unknown[] {
  if (!URI_COMMANDS.has(id) || typeof args[0] !== "string") {
    return args;
  }
  if (id === "vscode.openWith" && args[1] === "default") {
    // Opened as text on purpose: the reclaim must not undo it.
    textBypass.allow(args[0]);
  }
  const next = [...args];
  next[0] = vscode.Uri.parse(args[0]);
  return next;
}
