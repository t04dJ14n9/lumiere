import { defineManifest } from "../../shared/manifest";
import { MARKDOWN_EDITOR, whenActive } from "../../shared/editor-provider";
import { Schema } from "@workshop/core";
import { FOLLOW_CURSOR_CONTEXT, VIEW_ID } from "./commands";

export const config = Schema.object({
  followCursor: Schema.boolean()
    .default(true)
    .description(
      "Select and reveal the current heading in Markdown Outline as the cursor moves, without taking focus.",
    ),
});

export default defineManifest({
  id: "outline",
  title: "Outline",
  description:
    "Markdown Outline with expansion actions and optional cursor following. Go to Heading (Ctrl+Shift+O) searches the active Workshop note's headings.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["views", "navigation", "commands", "keybindings"],
  config,
  contributes: {
    commands: [
      {
        id: "outline.expandAll",
        title: "Expand All",
        icon: "$(expand-all)",
        palette: false,
      },
      {
        id: "outline.enableFollowCursor",
        title: "Follow Cursor",
        palette: false,
      },
      {
        id: "outline.disableFollowCursor",
        // Extension commands have no native checked-state contribution.
        // Paired titles keep the checkmark visible in both native and rendered menus.
        title: "✓ Follow Cursor",
        palette: false,
      },
      {
        id: "outline.toggle",
        title: "Toggle Markdown Outline",
        icon: "$(list-tree)",
        palette: true,
        scope: "workbench",
      },
      {
        id: "outline.goToHeading",
        title: "Go to Heading…",
        palette: true,
        key: "ctrl+shift+o",
        mac: "cmd+shift+o",
      },
    ],
    keybindings: [
      {
        id: "outline.toggle",
        key: "ctrl+alt+o",
        // Match PDF Workshop: Control+Command+O on macOS.
        // Editor-scoped so the same keys do not steal PDF Workshop's outline toggle.
        mac: "ctrl+cmd+o",
      },
    ],
    menus: [
      {
        command: "outline.expandAll",
        location: "view/title",
        when: `view == ${VIEW_ID}`,
        group: "navigation@1",
      },
      {
        command: "outline.enableFollowCursor",
        location: "view/title",
        when: `view == ${VIEW_ID} && !${FOLLOW_CURSOR_CONTEXT}`,
        group: "outline@1",
      },
      {
        command: "outline.disableFollowCursor",
        location: "view/title",
        when: `view == ${VIEW_ID} && ${FOLLOW_CURSOR_CONTEXT}`,
        group: "outline@1",
      },
    ],
    views: [
      {
        id: "outline",
        name: "Markdown Outline",
        scope: "workbench",
        when: whenActive(MARKDOWN_EDITOR),
      },
    ],
  },
} as const);
