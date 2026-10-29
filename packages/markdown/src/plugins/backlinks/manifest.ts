import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";
import { contributionId } from "../../shared/setting-schema";

const VIEW_ID = contributionId("backlinks");
const EXTRA_CONTEXT_CONTEXT = `${VIEW_ID}.extraContext`;
const SORT_ALPHABETICAL_CONTEXT = `${VIEW_ID}.sortAlphabetical`;
const SORT_ALPHABETICAL_REVERSE_CONTEXT = `${VIEW_ID}.sortAlphabeticalReverse`;
const SORT_MODIFIED_CONTEXT = `${VIEW_ID}.sortByModifiedTime`;
const SORT_MODIFIED_REVERSE_CONTEXT = `${VIEW_ID}.sortByModifiedTimeReverse`;

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
  extraContext: Schema.boolean()
    .default(false)
    .description(
      "Show the lines above and below each backlink match (Obsidian “Show more context”). Off by default.",
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
  capabilities: ["vaultIndex", "views", "statusBar", "navigation", "commands"],
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
      {
        id: "backlinks.enableExtraContext",
        title: "Show More Context",
        palette: false,
      },
      {
        id: "backlinks.disableExtraContext",
        title: "✓ Show More Context",
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
      {
        command: "backlinks.enableExtraContext",
        location: "view/title",
        when: `view == ${VIEW_ID} && !${EXTRA_CONTEXT_CONTEXT}`,
        group: "backlinks@1",
      },
      {
        command: "backlinks.disableExtraContext",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${EXTRA_CONTEXT_CONTEXT}`,
        group: "backlinks@1",
      },
    ],
    views: [
      {
        id: "backlinks",
        name: "Backlinks",
        scope: "workbench",
        visibility: "collapsed",
      },
    ],
  },
} as const);
