import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "formatting",
  title: "Formatting",
  description: "Markdown editing commands.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["editing", "commands"],
  contributes: {
    menus: [
      "toggleBold",
      "toggleItalics",
      "toggleStrikethrough",
      "toggleHighlight",
      "toggleCode",
      "insertLink",
    ].map((command) => ({
      command,
      location: "webview/context" as const,
      when: "webviewSection == 'markdownContent'",
      group: "formatting",
    })),
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
      // Obsidian 1.14's coloured highlights (`==🔵text==`).
      ...(["Red", "Orange", "Yellow", "Green", "Blue", "Purple"] as const).map(
        (colour) => ({
          id: `toggleHighlight${colour}`,
          title: `Toggle ${colour} Highlight`,
          editorCommand: `editor:toggle-highlight-${colour.toLowerCase()}`,
        }),
      ),
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
        // B3: restore Insert Link when cursorBridge is off or there is no selection.
        when: "!(markdownWorkshop.isCursorHost && markdownWorkshop.hasSelection && markdownWorkshop.plugin.cursorBridge)",
      },
      {
        id: "insertHorizontalRule",
        title: "Insert Horizontal Rule",
        editorCommand: "editor:insert-horizontal-rule",
      },
      {
        id: "insertCodeBlock",
        title: "Insert Code Block",
        editorCommand: "editor:insert-codeblock",
      },
      {
        id: "insertTag",
        title: "Insert Tag",
        editorCommand: "editor:insert-tag",
      },
      {
        id: "clearFormatting",
        title: "Clear Formatting",
        editorCommand: "editor:clear-formatting",
      },
      {
        id: "deleteParagraph",
        title: "Delete Paragraph",
        editorCommand: "editor:delete-paragraph",
      },
      {
        id: "addCursorAbove",
        title: "Add Cursor Above",
        editorCommand: "editor:add-cursor-above",
      },
      {
        id: "addCursorBelow",
        title: "Add Cursor Below",
        editorCommand: "editor:add-cursor-below",
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
