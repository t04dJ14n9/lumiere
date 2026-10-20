import { Schema } from "@workshop/core";
import { MARKDOWN_EDITOR, whenActive } from "../../shared/editor-provider";
import { defineManifest } from "../../shared/manifest";
import {
  NESTED_CONTEXT,
  SORT_FREQUENCY_CONTEXT,
  VIEW_ID,
} from "./tree";

export const config = Schema.object({
  viewSort: Schema.union(["name", "frequency"])
    .default("frequency")
    .description(
      "Order of the Tags view: `frequency` (most used first, as in Obsidian) or `name` (A to Z).",
    ),
  viewNested: Schema.boolean()
    .default(true)
    .description(
      "Show nested tags (`#a/b`) under their parent in the Tags view, rather than as a flat list.",
    ),
});

export default defineManifest({
  id: "tags",
  title: "Tags",
  description:
    "Render tags, find notes with matching hierarchical tags, and list the vault's tags in the Tags view.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["syntax", "rendering", "vaultIndex", "views", "commands"],
  config,
  contributes: {
    commands: [
      {
        id: "tags.sortByFrequency",
        // Shown while Frequency is active; click switches to Name.
        title: "✓ Sort by Frequency",
        palette: false,
      },
      {
        id: "tags.sortByName",
        // Shown while Name is active; click switches to Frequency.
        title: "✓ Sort by Name",
        palette: false,
      },
      {
        id: "tags.enableNested",
        title: "Show Nested Tags",
        palette: false,
      },
      {
        id: "tags.disableNested",
        title: "✓ Show Nested Tags",
        palette: false,
      },
    ],
    menus: [
      {
        command: "tags.sortByFrequency",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_FREQUENCY_CONTEXT}`,
        group: "tagsSort@1",
      },
      {
        command: "tags.sortByName",
        location: "view/title",
        when: `view == ${VIEW_ID} && !${SORT_FREQUENCY_CONTEXT}`,
        group: "tagsSort@1",
      },
      {
        command: "tags.enableNested",
        location: "view/title",
        when: `view == ${VIEW_ID} && !${NESTED_CONTEXT}`,
        group: "tagsNest@1",
      },
      {
        command: "tags.disableNested",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${NESTED_CONTEXT}`,
        group: "tagsNest@1",
      },
    ],
    views: [
      {
        id: "tags",
        name: "Tags",
        scope: "workbench",
        when: whenActive(MARKDOWN_EDITOR),
      },
    ],
  },
} as const);
