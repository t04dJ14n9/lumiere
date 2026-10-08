import { Schema } from "../../kernel";
import { defineManifest } from "../../shared/manifest";
export const config = Schema.object({
  display: Schema.union(["visible", "hidden", "source"]).default("visible"),
});
export default defineManifest({
  id: "properties",
  title: "Properties",
  description: "Edit YAML properties as typed fields, lists and ordered rows.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
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
    ],
  },
});
