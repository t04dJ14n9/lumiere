import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";
import {
  SORT_ALPHABETICAL_CONTEXT,
  SORT_ALPHABETICAL_REVERSE_CONTEXT,
  SORT_MODIFIED_CONTEXT,
  SORT_MODIFIED_REVERSE_CONTEXT,
  VIEW_ID,
} from "./tree";

export const config = Schema.object({
  sortOrder: Schema.union([
    "alphabetical",
    "alphabeticalReverse",
    "byModifiedTime",
    "byModifiedTimeReverse",
  ])
    .default("alphabetical")
    .description(
      "Order of Linked and Unlinked mentions in the Backlinks view (Obsidian sortOrder). Created-time sorts are omitted: the vault index has mtime only.",
    ),
});

export default defineManifest({
  id: "backlinks",
  title: "Backlinks",
  description:
    "Backlinks view and status bar count for the active note, with unlinked mentions.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["host"],
  capabilities: ["vaultIndex", "views", "statusBar", "navigation"],
  config,
  contributes: {
    commands: [
      {
        id: "backlinks.sortByAlphabetical",
        title: "✓ File name (A to Z)",
        palette: false,
      },
      {
        id: "backlinks.sortByAlphabeticalReverse",
        title: "✓ File name (Z to A)",
        palette: false,
      },
      {
        id: "backlinks.sortByModifiedTime",
        title: "✓ Modified time (new to old)",
        palette: false,
      },
      {
        id: "backlinks.sortByModifiedTimeReverse",
        title: "✓ Modified time (old to new)",
        palette: false,
      },
    ],
    menus: [
      {
        command: "backlinks.sortByAlphabetical",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_ALPHABETICAL_CONTEXT}`,
        group: "backlinksSort@1",
      },
      {
        command: "backlinks.sortByAlphabeticalReverse",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_ALPHABETICAL_REVERSE_CONTEXT}`,
        group: "backlinksSort@1",
      },
      {
        command: "backlinks.sortByModifiedTime",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_MODIFIED_CONTEXT}`,
        group: "backlinksSort@1",
      },
      {
        command: "backlinks.sortByModifiedTimeReverse",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_MODIFIED_REVERSE_CONTEXT}`,
        group: "backlinksSort@1",
      },
    ],
    views: [{ id: "backlinks", name: "Backlinks", scope: "workbench" }],
  },
} as const);
