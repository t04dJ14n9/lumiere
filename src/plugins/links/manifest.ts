import { Schema } from "../../kernel";
import { defineManifest } from "../../shared/manifest";
export const config = Schema.object({
  newLinkFormat: Schema.union(["shortest", "relative", "absolute"]).default("shortest"),
  useWikilinks: Schema.boolean().default(true),
  folderNote: Schema.string().default(""),
});
export default defineManifest({
  id: "links",
  title: "Links",
  description: "Follow Markdown links and wikilinks.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  config,
  contributes: { commands: [
    { id: "insertWikilink", title: "Insert Wikilink", editorCommand: "editor:insert-wikilink" },
    { id: "followLink", title: "Follow Link", editorCommand: "editor:follow-link" },
    { id: "openLinkToSide", title: "Open Link to Side", editorCommand: "editor:open-link-in-new-split" },
  ] },
});
