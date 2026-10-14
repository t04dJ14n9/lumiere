import { defineManifest } from "../../shared/manifest";
import { MARKDOWN_EDITOR, whenActive } from "../../shared/editor-provider";
import { Schema } from "../../kernel";
import { FOLLOW_CURSOR_CONTEXT, VIEW_ID } from "./commands";

export const config = Schema.object({
  followCursor: Schema.boolean()
    .default(true)
    .description(
      "Select and reveal the current heading in Note Outline as the cursor moves, without taking focus.",
    ),
});

export default defineManifest({
  id: "outline",
  title: "Outline",
  description:
    "Outline view of the active note's headings, with expansion actions and optional cursor following. VS Code's own Outline covers the text editor.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["views", "navigation", "commands"],
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
        name: "Note Outline",
        scope: "workbench",
        when: whenActive(MARKDOWN_EDITOR),
      },
    ],
  },
} as const);
