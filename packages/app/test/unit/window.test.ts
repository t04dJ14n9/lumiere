// The window's pure parts: keys, the saved layout and theme, and Settings' layout.
import test from "node:test";
import assert from "node:assert/strict";
import type { SettingItem } from "@workshop/host-node/settings";
import { shortcutCommand } from "../../src/shell/commands";
import {
  colorThemeItem,
  controlFor,
  descriptionParts,
  enumLabel,
  groupSettings,
} from "../../src/shell/settings-view";
import { DARK, LIGHT, paletteFor } from "../../src/shell/theme";
import {
  DEFAULT_UI_STATE,
  parseUiChange,
  readUiState,
} from "../../src/shared/ui-state";

const press = (
  code: string,
  keys: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {},
) => ({
  code,
  metaKey: keys.meta ?? false,
  ctrlKey: keys.ctrl ?? false,
  altKey: keys.alt ?? false,
  shiftKey: keys.shift ?? false,
});

test("VS Code's keys: ⌘, Settings, ⌘B sidebar, ⌥⌘B outline, ⌘O Open Folder", () => {
  assert.equal(
    shortcutCommand(press("Comma", { meta: true }), true),
    "open-settings",
  );
  assert.equal(
    shortcutCommand(press("KeyB", { meta: true }), true),
    "toggle-sidebar",
  );
  assert.equal(
    shortcutCommand(press("KeyB", { meta: true, alt: true }), true),
    "toggle-outline",
  );
  assert.equal(
    shortcutCommand(press("KeyO", { meta: true }), true),
    "open-vault",
  );
  assert.equal(
    shortcutCommand(press("KeyW", { meta: true }), true),
    "close-tab",
  );
  // ⇧⌘W is the menu's Close Window, not the window's.
  assert.equal(
    shortcutCommand(press("KeyW", { meta: true, shift: true }), true),
    undefined,
  );
  // Ctrl on Windows and Linux, ⌘ on macOS, and nothing else.
  assert.equal(
    shortcutCommand(press("Comma", { ctrl: true }), false),
    "open-settings",
  );
  assert.equal(
    shortcutCommand(press("Comma", { ctrl: true }), true),
    undefined,
  );
  assert.equal(
    shortcutCommand(press("Comma", { meta: true }), false),
    undefined,
  );
  assert.equal(
    shortcutCommand(press("KeyB", { meta: true, shift: true }), true),
    undefined,
  );
  assert.equal(
    shortcutCommand(press("Comma", { meta: true, alt: true }), true),
    undefined,
  );
  assert.equal(shortcutCommand(press("KeyK", { meta: true }), true), undefined);
});

test("tab keys: ⌃⇥ the last tab, ⌘⇧] / ⌘⇧[ and ⌥⌘→ / ⌥⌘← next and previous", () => {
  assert.equal(shortcutCommand(press("Tab", { ctrl: true }), true), "last-tab");
  assert.equal(
    shortcutCommand(press("Tab", { ctrl: true }), false),
    "last-tab",
  );
  assert.equal(
    shortcutCommand(press("BracketRight", { meta: true, shift: true }), true),
    "next-tab",
  );
  assert.equal(
    shortcutCommand(press("BracketLeft", { meta: true, shift: true }), true),
    "previous-tab",
  );
  assert.equal(
    shortcutCommand(press("ArrowRight", { meta: true, alt: true }), true),
    "next-tab",
  );
  assert.equal(
    shortcutCommand(press("ArrowLeft", { meta: true, alt: true }), true),
    "previous-tab",
  );
  assert.equal(
    shortcutCommand(press("PageDown", { ctrl: true }), false),
    "next-tab",
  );
  // ⌘⇥ is macOS's app switcher; ⌘→ moves the caret.
  assert.equal(shortcutCommand(press("Tab", { meta: true }), true), undefined);
  assert.equal(
    shortcutCommand(press("ArrowRight", { meta: true }), true),
    undefined,
  );
});

test("the saved layout keeps only known fields of the right type", () => {
  assert.deepEqual(readUiState(undefined), DEFAULT_UI_STATE);
  assert.deepEqual(readUiState({ outline: false, theme: "dark", extra: 1 }), {
    sidebar: true,
    outline: false,
    theme: "dark",
  });
  assert.deepEqual(parseUiChange({ sidebar: "no", theme: "purple" }), {});
  assert.deepEqual(parseUiChange([true]), {});
});

test("Color Theme: the system's, or always light, or always dark", () => {
  assert.equal(paletteFor("system", true), DARK);
  assert.equal(paletteFor("system", false), LIGHT);
  assert.equal(paletteFor("dark", false), DARK);
  assert.equal(paletteFor("light", true), LIGHT);
  const item = colorThemeItem("dark");
  assert.equal(item.modified, true);
  assert.equal(enumLabel(item.schema, 0), "Follow System");
  assert.equal(colorThemeItem("system").modified, false);
});

const setting = (
  key: string,
  category: string,
  schema: SettingItem["schema"],
): SettingItem => ({
  key,
  category,
  label: { prefix: category, name: key },
  description: "",
  schema,
  value: schema.default,
  modified: false,
});

test("each setting gets VS Code's control for its schema", () => {
  assert.equal(controlFor({ type: "boolean" }), "boolean");
  assert.equal(controlFor({ enum: ["a", "b"] }), "enum");
  assert.equal(controlFor({ type: "string", enum: ["a"] }), "enum");
  assert.equal(controlFor({ type: "integer" }), "integer");
  assert.equal(controlFor({ type: ["number", "null"] }), "number");
  assert.equal(controlFor({ type: "array" }), "json");
  assert.equal(controlFor({}), "json");
  assert.equal(enumLabel({ enum: ["byModifiedTime"] }, 0), "byModifiedTime");
});

test("groups: Appearance, Editor, Files and Vault first, plugins by name, General last", () => {
  const groups = groupSettings(
    [
      setting("lumiere.markdown.plugins.vim.enabled", "Vim", {
        type: "boolean",
      }),
      setting("lumiere.markdown.debug.trace", "General", { type: "boolean" }),
      setting("lumiere.markdown.editor.fontSize", "Editor", { type: "number" }),
      setting("lumiere.markdown.backlinks.sortOrder", "Backlinks", {
        enum: ["a"],
      }),
      colorThemeItem("system"),
    ],
    "",
  );
  assert.deepEqual(
    groups.map((group) => group.category),
    ["Appearance", "Editor", "Backlinks", "Vim", "General"],
  );
  assert.deepEqual(
    groupSettings(
      [
        setting("lumiere.markdown.plugins.vim.enabled", "Vim", {
          type: "boolean",
        }),
      ],
      "editor",
    ),
    [],
  );
});

test("a description's `code` is told apart from its text", () => {
  assert.deepEqual(descriptionParts("Replaces `editor.fontSize` for notes."), [
    { code: false, text: "Replaces " },
    { code: true, text: "editor.fontSize" },
    { code: false, text: " for notes." },
  ]);
});

test("Command Palette shortcuts (⇧⌘P, Ctrl+Shift+P, F1) and filtering", async () => {
  assert.equal(
    shortcutCommand(press("KeyP", { meta: true, shift: true }), true),
    "command-palette",
  );
  assert.equal(
    shortcutCommand(press("KeyP", { ctrl: true, shift: true }), false),
    "command-palette",
  );
  assert.equal(shortcutCommand(press("F1"), true), "command-palette");
  assert.equal(shortcutCommand(press("F1"), false), "command-palette");

  const { filterPaletteItems } =
    await import("../../src/shell/components/CommandPalette");
  const items = [
    { id: "1", title: "Toggle Bold", category: "Lumière" },
    { id: "2", title: "Open Settings", category: "Preferences" },
    { id: "3", title: "Color Theme: Dark", category: "Preferences" },
  ];
  assert.deepEqual(
    filterPaletteItems(items, "lum bold").map((item) => item.id),
    ["1"],
  );
  assert.deepEqual(
    filterPaletteItems(items, "pref dark").map((item) => item.id),
    ["3"],
  );
  assert.deepEqual(filterPaletteItems(items, "   ").length, 3);
});

test("forwardFrameKeydown forwards unhandled iframe shortcuts and leaves editor-handled ones alone", async () => {
  const { forwardFrameKeydown } = await import("../../src/shell/commands");
  const dispatched: KeyboardEvent[] = [];
  const fakeWindow = {
    dispatchEvent(event: Event): boolean {
      const kb = event as KeyboardEvent;
      dispatched.push(kb);
      if (kb.code === "Comma" && kb.metaKey) {
        kb.preventDefault();
      }
      return !kb.defaultPrevented;
    },
  };

  const makeKeydown = (
    key: string,
    code: string,
    metaKey = true,
  ): KeyboardEvent =>
    Object.assign(new Event("keydown", { cancelable: true }), {
      key,
      code,
      metaKey,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }) as unknown as KeyboardEvent;

  // An unhandled shell shortcut inside the iframe is forwarded and prevented.
  const unhandled = makeKeydown(",", "Comma");
  assert.equal(forwardFrameKeydown(unhandled, fakeWindow), true);
  assert.equal(unhandled.defaultPrevented, true);
  assert.equal(dispatched.length, 1);

  // A key already handled by the editor (e.g. ⌘B Bold) is not forwarded.
  const handledByEditor = makeKeydown("b", "KeyB");
  handledByEditor.preventDefault();
  assert.equal(forwardFrameKeydown(handledByEditor, fakeWindow), false);
  assert.equal(dispatched.length, 1);
});
