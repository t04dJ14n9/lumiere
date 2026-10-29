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
    folders: {},
  });
  assert.deepEqual(parseUiChange({ sidebar: "no", theme: "purple" }), {});
  assert.deepEqual(parseUiChange([true]), {});
  assert.deepEqual(
    parseUiChange({ folders: { "/v": ["a", 2, "a/b"], "/w": "a" } }),
    { folders: { "/v": ["a", "a/b"] } },
    "each vault's folder paths; anything else is dropped",
  );
  assert.deepEqual(parseUiChange({ folders: ["a"] }), {});
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

test("the window keeps clear of the iPad's status bar, home indicator and keyboard", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(
    new URL("../../src/shell/styles.css", import.meta.url),
    "utf8",
  );
  const root = /#root\s*\{([^}]*)\}/g;
  const rules = [...css.matchAll(root)].map((match) => match[1]).join("\n");
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.match(rules, new RegExp(`env\\(safe-area-inset-${side}\\)`));
  }
  assert.match(rules, /box-sizing:\s*border-box/);
});

test("a wide window shows the panels it saved, as columns", async () => {
  const { shownPanels, togglePanel } = await import("../../src/shell/panels");
  const saved = { sidebar: true, outline: false };
  assert.deepEqual(shownPanels(false, "outline", saved), saved);
  assert.deepEqual(togglePanel("outline", false, undefined, saved), {
    save: { outline: true },
  });
  assert.deepEqual(togglePanel("sidebar", false, undefined, saved), {
    save: { sidebar: false },
  });
});

test("a narrow window floats one panel at a time and saves nothing", async () => {
  const { shownPanels, togglePanel } = await import("../../src/shell/panels");
  const saved = { sidebar: true, outline: true };
  assert.deepEqual(shownPanels(true, undefined, saved), {
    sidebar: false,
    outline: false,
  });
  assert.deepEqual(shownPanels(true, "outline", saved), {
    sidebar: false,
    outline: true,
  });
  // Showing one puts the other away; toggling the shown one hides it.
  assert.deepEqual(togglePanel("outline", true, "sidebar", saved), {
    floating: "outline",
  });
  assert.deepEqual(togglePanel("outline", true, "outline", saved), {
    floating: undefined,
  });
});

test("a native menu's command is one the window knows, or nothing", async () => {
  const { parseAppCommand } = await import("../../src/shell/backend");
  assert.equal(parseAppCommand("toggle-outline"), "toggle-outline");
  assert.equal(parseAppCommand("page-menu"), "page-menu");
  for (const other of ["toggle-everything", "", 3, null, undefined]) {
    assert.equal(parseAppCommand(other), undefined, String(other));
  }
});

test("a floating card's long list scrolls inside the card", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(
    new URL("../../src/shell/styles.css", import.meta.url),
    "utf8",
  );
  const rule = /\.floating-panel \.tree-panel\s*\{([^}]*)\}/.exec(css)?.[1];
  assert.ok(rule, "the floating lists' rule");
  // A flex item keeps its content's height unless it may shrink below it.
  assert.match(rule, /min-height:\s*0/);
  assert.match(rule, /flex:\s*0 1 auto/);
});

test("the glass reaches over the notes by the bar's overlap, with room below it", async () => {
  const { insetFor } = await import("../../src/shell/chrome-inset");
  // The bar floats over bodies that run to the top: line 1 sits below it.
  assert.equal(insetFor(76.4, 0), 82);
  // The bar sits above the bodies, as on the desktop: nothing over the note.
  assert.equal(insetFor(40, 40), 0);
  assert.equal(insetFor(40, 48), 0);
});

test("with Liquid Glass the note runs up behind the status bar, and the glass keeps clear of it", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(
    new URL("../../src/shell/styles.css", import.meta.url),
    "utf8",
  );
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `${selector} is styled`);
    return css.slice(start, css.indexOf("}", start));
  };
  assert.match(rule(".liquid-glass #root"), /padding-top:\s*0/);
  assert.match(
    rule(".liquid-glass .tab-strip"),
    /top:\s*calc\(env\(safe-area-inset-top\)/,
  );
  assert.match(rule(".liquid-glass .tab-bodies"), /inset:\s*0/);
  // Only the capsules take taps; the note between them stays reachable.
  assert.match(rule(".liquid-glass .tab-strip"), /pointer-events:\s*none/);
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
