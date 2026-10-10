import { Schema } from "../../kernel";
import { fontFields, fontNativeKeys, fontSize, lineHeight } from "./font";
import { caretFields, caretNativeKeys } from "./caret-settings";
export const config = Schema.object({
  defaultMode: Schema.union(["livePreview", "source"]).default("livePreview"),
  readableLineLength: Schema.boolean().default(false),
  /** Reopen notes Cursor's Preview | Markdown switch sends to the text editor. */
  reclaimTextEditor: Schema.union(["auto", "on", "off"]).default("auto"),
  strictLineBreaks: Schema.boolean().default(false),
  rightToLeft: Schema.boolean().default(false),
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
  capabilities: ["editorProvider", "commands"],
  contributes: {
    commands: [
      { id: "titleActions", title: "Note Actions", icon: "$(zap)" },
      { id: "selectionActions", title: "Selection Actions" },
      {
        id: "useForMarkdownInWorkspace",
        title: "Use Markdown Workbench for Markdown in This Workspace",
        scope: "workbench",
      },
    ],
    menus: [
      {
        command: "titleActions",
        location: "editor/title",
        when: "markdownWorkbench.hasTitleActions",
        group: "navigation",
      },
      {
        command: "selectionActions",
        location: "webview/context",
        when: "webviewSection == 'markdownContent' && markdownWorkbench.hasSelection && markdownWorkbench.hasSelectionActions",
        group: "agent",
      },
    ],
  },
} as const);
