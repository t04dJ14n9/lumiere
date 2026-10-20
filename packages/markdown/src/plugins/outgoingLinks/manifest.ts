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
      "Order of Links, Not created yet, and Unlinked mentions in the Outgoing links view (Obsidian sortOrder). Created-time sorts are omitted: the vault index has mtime only.",
    ),
});

export default defineManifest({
  id: "outgoingLinks",
  title: "Outgoing links",
  description:
    "Outgoing links view: the notes and files the active note links to, and links not created yet.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["host"],
  capabilities: ["vaultIndex", "views", "navigation"],
  config,
  contributes: {
    commands: [
      {
        id: "outgoingLinks.sortByAlphabetical",
        title: "✓ File name (A to Z)",
        palette: false,
      },
      {
        id: "outgoingLinks.sortByAlphabeticalReverse",
        title: "✓ File name (Z to A)",
        palette: false,
      },
      {
        id: "outgoingLinks.sortByModifiedTime",
        title: "✓ Modified time (new to old)",
        palette: false,
      },
      {
        id: "outgoingLinks.sortByModifiedTimeReverse",
        title: "✓ Modified time (old to new)",
        palette: false,
      },
    ],
    menus: [
      {
        command: "outgoingLinks.sortByAlphabetical",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_ALPHABETICAL_CONTEXT}`,
        group: "outgoingSort@1",
      },
      {
        command: "outgoingLinks.sortByAlphabeticalReverse",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_ALPHABETICAL_REVERSE_CONTEXT}`,
        group: "outgoingSort@1",
      },
      {
        command: "outgoingLinks.sortByModifiedTime",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_MODIFIED_CONTEXT}`,
        group: "outgoingSort@1",
      },
      {
        command: "outgoingLinks.sortByModifiedTimeReverse",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${SORT_MODIFIED_REVERSE_CONTEXT}`,
        group: "outgoingSort@1",
      },
    ],
    views: [
      { id: "outgoingLinks", name: "Outgoing Links", scope: "workbench" },
    ],
  },
} as const);
