import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";
export const config = Schema.object({
  display: Schema.union(["visible", "hidden", "source"]).default("visible"),
  listPreviewCount: Schema.number()
    .min(1)
    .max(50)
    .default(3)
    .description(
      "How many list chips to show before a disclosure control. Applies to tags, aliases, cssclasses, and other lists.",
    ),
});
export default defineManifest({
  id: "properties",
  title: "Properties",
  description: "Edit YAML properties as typed fields, lists and ordered rows.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "editing", "commands"],
  config,
  contributes: {
    menus: [
      { command: "addProperty", location: "editor/title", group: "navigation" },
    ],
    commands: [
      {
        id: "addProperty",
        title: "Add File Property",
        icon: "$(symbol-property)",
        editorCommand: "markdown:add-metadata-property",
        key: "ctrl+;",
        mac: "cmd+;",
      },
      {
        id: "addAlias",
        title: "Add Alias",
        editorCommand: "markdown:add-alias",
      },
      {
        id: "clearProperties",
        title: "Clear File Properties",
        editorCommand: "markdown:clear-metadata-properties",
      },
      {
        id: "toggleFoldProperties",
        title: "Toggle Fold Properties",
        editorCommand: "editor:toggle-fold-properties",
      },
    ],
  },
});
