import { Schema } from "@workshop/core";
import { fontFields, fontNativeKeys, fontSize, lineHeight } from "./font";
import { caretFields, caretNativeKeys } from "./caret-settings";
export const config = Schema.object({
  defaultMode: Schema.union(["livePreview", "source"]).default("livePreview"),
  readableLineLength: Schema.boolean().default(false),
  /** Reopen notes Cursor's Preview | Markdown switch sends to the text editor. */
  reclaimTextEditor: Schema.union(["auto", "on", "off"]).default("auto"),
  /** Open TextDocuments early so Cursor can resolve our custom editor for agent-edited notes. */
  warmTextDocument: Schema.union(["auto", "on", "off"]).default("auto"),
  strictLineBreaks: Schema.boolean().default(false),
  rightToLeft: Schema.boolean().default(false),
  dragScrollSpeed: Schema.number()
    .min(1)
    .max(10)
    .default(4)
    .description(
      "Speed multiplier for text-selection auto-scroll near the editor edges (1–10). Default: 4; 1 restores CodeMirror's original speed. Applies immediately in Live Preview and Source mode.",
    ),
  useTabs: Schema.boolean().default(true),
  tabSize: new Schema<number>(
    (value) => {
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 16
      ) {
        throw new Error("Tab size must be an integer from 1 to 16");
      }
      return value;
    },
    { type: "integer", minimum: 1, maximum: 16 },
  ).default(4),
  fontSize,
  lineHeight,
  // VS Code's font and caret settings for Markdown files (native, not ours).
  ...fontFields,
  ...caretFields,
});
import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "editor",
  title: "Editor",
  description: "Editor core service.",
  kind: "core",
  config,
  nativeConfigKeys: { ...fontNativeKeys, ...caretNativeKeys },
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["editorProvider", "commands", "keybindings", "navigation"],
  contributes: {
    commands: [
      { id: "jumpBack", title: "Go Back in Note", icon: "$(arrow-left)" },
      {
        id: "jumpForward",
        title: "Go Forward in Note",
        icon: "$(arrow-right)",
      },
      { id: "titleActions", title: "Note Actions", icon: "$(zap)" },
      { id: "selectionActions", title: "Selection Actions" },
      {
        id: "useForMarkdownInWorkspace",
        title: "Use Lumière for Markdown in This Workspace",
        scope: "workbench",
      },
      {
        id: "toggleTextEditor",
        title: "Toggle Text Editor",
        scope: "workbench",
        when: "activeCustomEditorId == 'lumiere.markdown.editor' || (editorLangId == 'markdown' && !activeCustomEditorId)",
      },
    ],
    keybindings: [
      // Lumière focused: Ctrl/Cmd+E → default text editor.
      {
        id: "toggleTextEditor",
        key: "ctrl+e",
        mac: "cmd+e",
        scope: "editor",
      },
      // Built-in Markdown text editor focused: Ctrl/Cmd+E → Lumière.
      // workbench scope so the binding is not gated on activeCustomEditorId /
      // editorFocus (those keys are false while the text editor has focus).
      {
        id: "toggleTextEditor",
        key: "ctrl+e",
        mac: "cmd+e",
        scope: "workbench",
        when: "editorLangId == 'markdown' && editorTextFocus && !activeCustomEditorId",
      },
    ],
    menus: [
      {
        command: "jumpBack",
        location: "editor/title",
        when: "lumiere.markdown.canJumpBack",
        group: "navigation@1",
      },
      {
        command: "jumpForward",
        location: "editor/title",
        when: "lumiere.markdown.canJumpForward",
        group: "navigation@2",
      },
      {
        command: "titleActions",
        location: "editor/title",
        when: "lumiere.markdown.hasTitleActions",
        group: "navigation",
      },
      {
        command: "selectionActions",
        location: "webview/context",
        when: "webviewSection == 'markdownContent' && lumiere.markdown.hasSelection && lumiere.markdown.hasSelectionActions",
        group: "agent",
      },
    ],
  },
} as const);
