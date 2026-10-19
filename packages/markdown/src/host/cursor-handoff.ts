import * as vscode from "vscode";
import { handoffLease } from "./reclaim";
import { warmMarkdownDocument } from "./document-warm";
import { watchCursorEditEnd } from "./cursor-edit-end";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";
import type {
  HandoffSurface,
  NativeDocument,
  NativeEditor,
} from "../plugins/cursorBridge/handoff";

/** Language id Cursor Edit / outline expect for note mirrors. */
const MARKDOWN_LANGUAGE = "markdown";

/** VS Code surface for cursorBridge selection mirror + reclaim lease. */
export function createCursorHandoffSurface(): HandoffSurface {
  return {
    watchEditEnd: watchCursorEditEnd,
    acquireLease(uri) {
      return handoffLease.acquire(uri);
    },
    nativeUri(uri) {
      return vscode.Uri.parse(uri);
    },
    async warm(uri) {
      await warmMarkdownDocument(vscode.Uri.parse(uri));
    },
    async open(uri) {
      const document = await openMarkdownDocument(vscode.Uri.parse(uri));
      return wrapDocument(document);
    },
    async show(document, range) {
      const native = await openMarkdownDocument(vscode.Uri.parse(document.uri));
      const editor = await vscode.window.showTextDocument(native, {
        preview: false,
        preserveFocus: false,
        selection: new vscode.Range(
          new vscode.Position(range.start.line, range.start.character),
          new vscode.Position(range.end.line, range.end.character),
        ),
      });
      return wrapEditor(editor);
    },
    dismiss: dismissMirror,
  };
}

async function dismissMirror(
  uri: string,
  options?: { restore?: boolean },
): Promise<void> {
  const target = vscode.Uri.parse(uri);
  const targetKey = target.toString();
  const restore = options?.restore ?? true;
  const closed = await closeMirrorEditor(targetKey);
  // Closing the note's only view puts Live Preview back in its place, behind
  // any tab the reader moved on to. A mirror the reader closed stays closed.
  if (restore && closed && !hasLumiereTab(targetKey)) {
    await vscode.commands.executeCommand(
      "vscode.openWith",
      target,
      MARKDOWN_EDITOR.viewType,
      {
        viewColumn: closed.viewColumn,
        preview: false,
        preserveFocus: !closed.focused,
        background: !closed.shown,
      },
    );
  }
}

interface ClosedMirror {
  readonly viewColumn: vscode.ViewColumn;
  /** The mirror was its group's active tab. */
  readonly shown: boolean;
  /** …and that group was the active one. */
  readonly focused: boolean;
}

/**
 * Close the mirror's text tab by identity. Do not use closeActiveEditor: when
 * a custom editor has focus, activeTextEditor can still point at the mirror,
 * and closeActiveEditor would close the wrong tab.
 */
async function closeMirrorEditor(
  targetKey: string,
): Promise<ClosedMirror | undefined> {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.toString() === targetKey
      ) {
        const shown = group.activeTab === tab;
        const focused =
          shown && group === vscode.window.tabGroups.activeTabGroup;
        await vscode.window.tabGroups.close(tab);
        return { viewColumn: group.viewColumn, shown, focused };
      }
    }
  }
  return undefined;
}

/**
 * Open the note as a TextDocument with language `markdown`.
 *
 * User `files.associations` may map `*.md` to a custom-editor viewType string
 * (not a language id). That makes mirrors report Plain Text and can leave
 * Cursor’s Edit handler without a usable model. Force the real language id.
 */
async function openMarkdownDocument(
  uri: vscode.Uri,
): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(uri);
  if (document.languageId === MARKDOWN_LANGUAGE) {
    return document;
  }
  try {
    return await vscode.languages.setTextDocumentLanguage(
      document,
      MARKDOWN_LANGUAGE,
    );
  } catch {
    return document;
  }
}

function hasLumiereTab(uri: string): boolean {
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some(
      (tab) =>
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.uri.toString() === uri &&
        tab.input.viewType === MARKDOWN_EDITOR.viewType,
    ),
  );
}

function wrapEditor(editor: vscode.TextEditor): NativeEditor {
  return {
    get document() {
      return wrapDocument(editor.document);
    },
    get selection() {
      return editor.selection;
    },
    isActive: () => vscode.window.activeTextEditor === editor,
  };
}

function wrapDocument(document: vscode.TextDocument): NativeDocument {
  return {
    uri: document.uri.toString(),
    get version() {
      return document.version;
    },
    getText: () => document.getText(),
    positionAt: (offset) => {
      const position = document.positionAt(offset);
      return { line: position.line, character: position.character };
    },
  };
}
