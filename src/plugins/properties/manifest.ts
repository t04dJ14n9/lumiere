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
    commands: [
      {
        id: "addProperty",
        title: "Add File Property",
        editorCommand: "markdown:add-metadata-property",
        key: "ctrl+;",
        mac: "cmd+;",
      },
    ],
  },
});
