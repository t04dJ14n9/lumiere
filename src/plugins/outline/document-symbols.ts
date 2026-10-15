import * as vscode from "vscode";
import { metadata } from "../../markdown/metadata";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import { outlineSymbols, type OutlineSymbolNode } from "./symbols";

const SELECTOR: vscode.DocumentSelector = [
  { language: "markdown", scheme: "file" },
  { language: "markdown", scheme: "untitled" },
];

/**
 * Registers heading symbols for the Markdown Workbench custom editor so
 * Go to Symbol and the native Outline view list nested titles. Returns
 * nothing while a plain text editor is active for the same note, so the
 * built-in Markdown provider is not doubled.
 *
 * Unit tests load a vscode stub without `languages`; registration is a no-op
 * there and the real Extension Host registers normally.
 */
export function registerDocumentSymbols(): { dispose(): void } {
  if (
    typeof vscode.languages?.registerDocumentSymbolProvider !== "function"
  ) {
    return { dispose() {} };
  }
  return vscode.languages.registerDocumentSymbolProvider(SELECTOR, {
    provideDocumentSymbols(document) {
      if (!workbenchEditorIsActive(document.uri)) {
        return [];
      }
      return outlineSymbols(metadata(document.getText()).headings).map((node) =>
        toDocumentSymbol(document, node),
      );
    },
  });
}

function workbenchEditorIsActive(uri: vscode.Uri): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return (
    input instanceof vscode.TabInputCustom &&
    input.viewType === MARKDOWN_EDITOR.viewType &&
    input.uri.toString() === uri.toString()
  );
}

function toDocumentSymbol(
  document: vscode.TextDocument,
  node: OutlineSymbolNode,
): vscode.DocumentSymbol {
  const range = new vscode.Range(
    document.positionAt(node.start),
    document.positionAt(Math.max(node.end, node.selectionEnd)),
  );
  let selectionRange = new vscode.Range(
    document.positionAt(node.selectionStart),
    document.positionAt(node.selectionEnd),
  );
  if (!range.contains(selectionRange)) {
    selectionRange = range;
  }
  const symbol = new vscode.DocumentSymbol(
    node.name,
    "",
    vscode.SymbolKind.String,
    range,
    selectionRange,
  );
  symbol.children = node.children.map((child) =>
    toDocumentSymbol(document, child),
  );
  return symbol;
}
