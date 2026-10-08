import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "formatting",
  title: "Formatting",
  description: "Markdown editing commands.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  contributes: {
    commands: [
      {
        id: "toggleBold",
        title: "Toggle Bold",
        editorCommand: "editor:toggle-bold",
        key: "ctrl+b",
        mac: "cmd+b",
      },
      {
        id: "toggleItalics",
        title: "Toggle Italics",
        editorCommand: "editor:toggle-italics",
        key: "ctrl+i",
        mac: "cmd+i",
      },
      {
        id: "toggleStrikethrough",
        title: "Toggle Strikethrough",
        editorCommand: "editor:toggle-strikethrough",
      },
      {
        id: "toggleHighlight",
        title: "Toggle Highlight",
        editorCommand: "editor:toggle-highlight",
      },
      {
        id: "toggleCode",
        title: "Toggle Inline Code",
        editorCommand: "editor:toggle-code",
      },
      {
        id: "toggleComment",
        title: "Toggle Comment",
        editorCommand: "editor:toggle-comments",
      },
      {
        id: "insertLink",
        title: "Insert Link",
        editorCommand: "editor:insert-link",
        key: "ctrl+k",
        mac: "cmd+k",
      },
      {
        id: "insertHorizontalRule",
        title: "Insert Horizontal Rule",
        editorCommand: "editor:insert-horizontal-rule",
      },
      {
        id: "toggleBulletList",
        title: "Toggle Bullet List",
        editorCommand: "editor:toggle-bullet-list",
      },
      {
        id: "toggleNumberedList",
        title: "Toggle Numbered List",
        editorCommand: "editor:toggle-numbered-list",
      },
      {
        id: "toggleBlockquote",
        title: "Toggle Blockquote",
        editorCommand: "editor:toggle-blockquote",
      },
      {
        id: "swapLineUp",
        title: "Swap Line Up",
        editorCommand: "editor:swap-line-up",
      },
      {
        id: "swapLineDown",
        title: "Swap Line Down",
        editorCommand: "editor:swap-line-down",
      },
      {
        id: "setHeading0",
        title: "Set Heading 0",
        editorCommand: "editor:set-heading-0",
      },
      {
        id: "setHeading1",
        title: "Set Heading 1",
        editorCommand: "editor:set-heading-1",
      },
      {
        id: "setHeading2",
        title: "Set Heading 2",
        editorCommand: "editor:set-heading-2",
      },
      {
        id: "setHeading3",
        title: "Set Heading 3",
        editorCommand: "editor:set-heading-3",
      },
      {
        id: "setHeading4",
        title: "Set Heading 4",
        editorCommand: "editor:set-heading-4",
      },
      {
        id: "setHeading5",
        title: "Set Heading 5",
        editorCommand: "editor:set-heading-5",
      },
      {
        id: "setHeading6",
        title: "Set Heading 6",
        editorCommand: "editor:set-heading-6",
      },
    ],
  },
} as const);
