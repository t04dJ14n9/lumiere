import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";
import {
  EXTRA_CONTEXT_CONTEXT,
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
  extraContext: Schema.boolean()
    .default(false)
    .description(
      "Show the lines above and below each Unlinked mention match (Obsidian “Show more context”). Off by default.",
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
  capabilities: ["vaultIndex", "views", "navigation", "commands"],
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
      {
        id: "outgoingLinks.enableExtraContext",
        title: "Show More Context",
        palette: false,
      },
      {
        id: "outgoingLinks.disableExtraContext",
        title: "✓ Show More Context",
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
      {
        command: "outgoingLinks.enableExtraContext",
        location: "view/title",
        when: `view == ${VIEW_ID} && !${EXTRA_CONTEXT_CONTEXT}`,
        group: "outgoing@1",
      },
      {
        command: "outgoingLinks.disableExtraContext",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${EXTRA_CONTEXT_CONTEXT}`,
        group: "outgoing@1",
      },
    ],
    views: [
      {
        id: "outgoingLinks",
        name: "Outgoing Links",
        scope: "workbench",
        visibility: "collapsed",
      },
    ],
  },
} as const);
