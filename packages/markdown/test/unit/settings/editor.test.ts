import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { config } from "../../../src/plugins/editor/manifest";
import {
  editorSettings,
  settingsExtensions,
} from "../../../src/plugins/editor/settings";
import { readSettings } from "../../../src/host/settings";
import type { SettingsReader } from "../../../src/host/settings";
import { createRenderer } from "../../../src/markdown/html";
import { contributions } from "../../../scripts/contributions";

/** The CSS custom properties the settings' editor theme declares. */
function fontDeclarations(extensions: Extension): Record<string, string> {
  const rules = EditorState.create({ extensions })
    .facet(EditorView.styleModule)
    .map((module) => module.getRules())
    .join("\n");
  return Object.fromEntries(
    [...rules.matchAll(/(--[a-z-]+):\s*([^;}]+)/g)].map((match) => [
      match[1]!,
      match[2]!.trim(),
    ]),
  );
}

test("editor settings have application defaults and reconfigure without changing text or selection", () => {
  assert.deepEqual(config.parse({}), {
    defaultMode: "livePreview",
    // Off by default: text fills the editor like VS Code's text editor.
    readableLineLength: false,
    // Auto: reclaims Cursor's text-editor switch only when running in Cursor.
    reclaimTextEditor: "auto",
    // Off: in-place workbench→text (Claude) stays native unless opted in.
    reclaimInPlaceTextEditor: false,
    // Auto: materialize TextDocuments early so Cursor can open our custom editor.
    warmTextDocument: "auto",
    strictLineBreaks: false,
    rightToLeft: false,
    dragScrollSpeed: 4,
    useTabs: true,
    tabSize: 4,
    // The note's own size: Obsidian's default body size, not editor.fontSize.
    fontSize: 16,
    // Its line height: Obsidian's 1.5, a multiple of the size.
    lineHeight: 1.5,
    // Native editor font settings for Markdown; empty until the host reads them.
    fontFamily: "",
    fontFamilyExplicit: false,
    defaultFontFamily: "",
    fontWeight: "normal",
    letterSpacing: 0,
    fontLigatures: false,
    fontVariations: false,
    cursorStyle: "line",
    cursorBlinking: "blink",
    cursorSmoothCaretAnimation: "off",
    cursorWidth: 0,
  });
  // VS Code's defaults: ligatures off, no variations; Obsidian's body size.
  assert.deepEqual(fontDeclarations(settingsExtensions({})), {
    "--text-size": "16px",
    "--text-weight": "normal",
    "--line-height": "1.5",
    "--text-features": '"liga" off, "calt" off',
    "--text-variations": "normal",
  });
  const compartment = new Compartment();
  let state = EditorState.create({
    doc: "one\ntwo",
    selection: { anchor: 2 },
    extensions: compartment.of(settingsExtensions({})),
  });
  assert.deepEqual(state.facet(EditorView.editorAttributes).at(-1), {
    dir: "ltr",
  });
  assert.deepEqual(
    EditorState.create({
      extensions: settingsExtensions({ readableLineLength: true }),
    })
      .facet(EditorView.editorAttributes)
      .at(-1),
    { dir: "ltr", class: "is-readable-line-width" },
  );
  const previous = state;
  state = state.update({
    effects: compartment.reconfigure(
      settingsExtensions({
        rightToLeft: true,
        readableLineLength: false,
        strictLineBreaks: true,
        dragScrollSpeed: 7,
      }),
    ),
  }).state;
  assert.equal(state.doc, previous.doc);
  assert.equal(state.selection, previous.selection);
  assert.equal(state.facet(editorSettings).strictLineBreaks, true);
  assert.equal(state.facet(editorSettings).dragScrollSpeed, 7);
  assert.deepEqual(state.facet(EditorView.editorAttributes).at(-1), {
    dir: "rtl",
  });
});

test("caret settings come from native Markdown configuration and survive settings reconfiguration", async () => {
  const markdown: Record<string, unknown> = {
    "editor.cursorStyle": "block-outline",
    "editor.cursorBlinking": "expand",
    "editor.cursorSmoothCaretAnimation": "explicit",
    "editor.cursorWidth": 4,
  };
  const reader: SettingsReader = {
    get: <T>(_key: string, fallback?: T) => fallback,
  };
  const native: SettingsReader = {
    get: <T>(key: string) => markdown[key] as T,
  };
  const settings = readSettings(reader, native).editor!;
  assert.deepEqual(
    [
      settings.cursorStyle,
      settings.cursorBlinking,
      settings.cursorSmoothCaretAnimation,
      settings.cursorWidth,
    ],
    ["block-outline", "expand", "explicit", 4],
  );
  const compartment = new Compartment();
  const state = EditorState.create({
    doc: "abc",
    selection: { anchor: 1 },
    extensions: compartment.of(settingsExtensions({})),
  });
  const updated = state.update({
    effects: compartment.reconfigure(settingsExtensions(settings)),
  }).state;
  assert.equal(updated.doc, state.doc);
  assert.equal(updated.selection, state.selection);
  assert.equal(updated.facet(editorSettings).cursorWidth, 4);
  assert.equal(updated.facet(editorSettings).cursorBlinking, "expand");
  const generated = await contributions();
  for (const key of Object.keys(generated.configuration.properties)) {
    assert.ok(!key.startsWith("lumiere.markdown.editor.cursor"), key);
  }
});
test("resource settings use manifest aliases and validate all editor fields", () => {
  const values: Record<string, unknown> = {
    "files.newNoteFolder": "notes",
    "files.attachmentFolder": "./media",
    "editor.rightToLeft": true,
    "editor.dragScrollSpeed": 2.5,
    "editor.defaultMode": "source",
    "plugins.vim.enabled": true,
  };
  const reader: SettingsReader = {
    get: <T>(key: string, fallback?: T) =>
      key in values ? (values[key] as T) : fallback,
  };
  const result = readSettings(reader);
  assert.equal(result.features?.links?.config.newNoteFolder, "notes");
  assert.equal(result.features?.links?.config.attachmentFolder, "./media");
  assert.equal(result.features?.vim?.enabled, true);
  assert.equal(result.editor?.rightToLeft, true);
  assert.equal(result.editor?.dragScrollSpeed, 2.5);
  assert.equal(result.mode, "source");
  assert.equal(result.features?.lineNumbers?.enabled, true);
  assert.equal(result.features?.inlineTitle?.enabled, false);
  assert.equal(result.features?.lineNumbers?.config.style, "on");
  values["editor.rightToLeft"] = "yes";
  assert.throws(() => readSettings(reader));
});
test("strict line breaks are per-render and do not leak to later requests", () => {
  const renderer = createRenderer();
  assert.match(renderer.renderMarkdown("one\ntwo"), /<br>/);
  assert.doesNotMatch(
    renderer.renderMarkdown("one\ntwo", { strictLineBreaks: true }),
    /<br>/,
  );
  assert.match(renderer.renderMarkdown("one\ntwo"), /<br>/);
});
test("required settings, title actions, native context menus and unbound verify commands are generated", async () => {
  const generated = await contributions();
  const properties = generated.configuration.properties as Record<
    string,
    { default: unknown; scope: string }
  >;
  for (const [key, value] of Object.entries({
    "editor.readableLineLength": false,
    "editor.strictLineBreaks": false,
    "editor.rightToLeft": false,
    "editor.dragScrollSpeed": 4,
    "files.attachmentFolder": "",
    "files.newNoteFolder": "",
    "links.useWikilinks": true,
    "plugins.lineNumbers.enabled": true,
    // Off by default: line 1 starts at the top, as in the text editor.
    "plugins.inlineTitle.enabled": false,
    "plugins.diagrams.enabled": true,
    "plugins.vim.enabled": false,
  })) {
    assert.deepEqual(
      [
        properties[`lumiere.markdown.${key}`]?.default,
        properties[`lumiere.markdown.${key}`]?.scope,
      ],
      [value, "resource"],
      key,
    );
  }
  assert.deepEqual(
    generated.menus["editor/title"].map((menu) => menu.command).sort(),
    [
      "lumiere.markdown.addProperty",
      "lumiere.markdown.jumpBack",
      "lumiere.markdown.jumpForward",
      "lumiere.markdown.openAsText",
      "lumiere.markdown.titleActions",
    ],
  );
  assert.ok(
    generated.menus["webview/context"].some(
      (menu) => menu.submenu === "lumiere.markdown.menu.format",
    ),
  );
  assert.ok(
    generated.menus["lumiere.markdown.menu.format"]?.some(
      (menu) =>
        menu.command === "lumiere.markdown.toggleBold" &&
        menu.when.includes("markdownContent"),
    ),
  );
  for (const id of [
    "toggleStrikethrough",
    "toggleHighlight",
    "toggleCode",
    "toggleComment",
    "toggleChecklist",
    "cycleListChecklist",
    "quickSwitcher",
  ]) {
    assert.ok(
      !generated.keybindings.some(
        (binding) => binding.command === `lumiere.markdown.${id}`,
      ),
      id,
    );
  }
});

test("manual and parity inventories include every generated command, submenu and setting", async () => {
  const { readFileSync } = await import("node:fs");
  const generated = await contributions();
  const manual = readFileSync("docs/MANUAL_TEST_PLAN.md", "utf8");
  const parity = readFileSync("docs/PARITY.md", "utf8");
  for (const id of [
    ...generated.commands.map((command) => command.command),
    ...generated.submenus.map((submenu) => submenu.id),
    ...Object.keys(generated.configuration.properties),
  ]) {
    assert.ok(manual.includes(id), `manual: ${id}`);
    assert.ok(parity.includes(id), `parity: ${id}`);
  }
  assert.equal(
    generated.menus.commandPalette.find(
      (menu) => menu.command === "lumiere.markdown.consumeVimHostShortcut",
    )?.when,
    "false",
  );
});
test("line numbers follow the native editor.lineNumbers setting, which is not contributed again", async () => {
  const reader: SettingsReader = {
    get: <T>(_key: string, fallback?: T) => fallback,
  };
  for (const style of ["on", "off", "relative", "interval"]) {
    const native: SettingsReader = {
      get: <T>(key: string) =>
        (key === "editor.lineNumbers" ? style : undefined) as T,
    };
    assert.equal(
      readSettings(reader, native).features?.lineNumbers?.config.style,
      style,
    );
  }
  const generated = await contributions();
  assert.ok(
    !Object.keys(generated.configuration.properties).some((key) =>
      key.startsWith("lumiere.markdown.lineNumbers."),
    ),
  );
});

test("agent commands copy a reference or open a reference the user already copied", async () => {
  const generated = await contributions();
  const settings = Object.keys(generated.configuration.properties);
  assert.ok(settings.includes("lumiere.markdown.plugins.agentBridge.enabled"));
  assert.equal(
    settings.some((key) => key.includes("copyForAgent")),
    false,
  );
  const commands = generated.commands.map((command) => command.command);
  assert.ok(commands.includes("lumiere.markdown.copyLinkForAgent"));
  // A bare copyForAgent command would look like it starts an agent. The wiki
  // command copies text and does not open a chat.
  assert.equal(commands.includes("lumiere.markdown.copyForAgent"), false);
  assert.deepEqual(
    generated.commands
      .filter((command) => /agent/i.test(command.command))
      .map((command) => command.title),
    [
      "Copy Link for Agent",
      "Open Copied Agent Reference",
      "Copy Wiki Reference for Agent",
    ],
  );
  assert.equal(
    settings.some((key) => key.includes("askAgent")),
    false,
  );
  assert.equal(
    generated.keybindings.some((binding) =>
      binding.command.endsWith(".copyForAgent"),
    ),
    false,
  );
  for (const menus of Object.values(generated.menus)) {
    assert.equal(
      menus.some(
        (menu) =>
          menu.command?.endsWith(".copyForAgent") &&
          menu.command !== "lumiere.markdown.wiki.copyForAgent",
      ),
      false,
    );
  }
});

test("note text follows the native editor font settings for Markdown files (not its size, which is lumiere.markdown.editor.fontSize)", async () => {
  // What VS Code returns for a Markdown file, [markdown] overrides included.
  const markdown: Record<string, unknown> = {
    "editor.fontFamily": "Fira Code",
    // Ignored: the note has its own size.
    "editor.fontSize": 30,
    "editor.fontWeight": "300",
    // Ignored: the note has its own line height.
    "editor.lineHeight": 27,
    "editor.letterSpacing": 0.5,
    "editor.fontLigatures": true,
    "editor.fontVariations": false,
    "editor.fontFamily#default": "'Droid Sans Mono', monospace",
  };
  const native: SettingsReader = {
    get: <T>(key: string) => markdown[key] as T,
  };
  const own: SettingsReader = {
    get: <T>(key: string, fallback?: T) =>
      key === "editor.fontSize"
        ? (18 as T)
        : key === "editor.lineHeight"
          ? (1.8 as T)
          : fallback,
  };
  const editor = readSettings(own, native).editor!;
  assert.deepEqual(
    [
      editor.fontFamily,
      editor.fontSize,
      editor.fontWeight,
      editor.lineHeight,
      editor.letterSpacing,
      editor.fontLigatures,
      editor.fontVariations,
    ],
    ["Fira Code", 18, "300", 1.8, 0.5, true, false],
  );
  assert.deepEqual(fontDeclarations(settingsExtensions(editor)), {
    "--text-font": `"Fira Code", 'Droid Sans Mono', monospace`,
    "--code-font": `"Fira Code", 'Droid Sans Mono', monospace`,
    "--text-size": "18px",
    "--text-weight": "300",
    "--line-height": "1.8",
    "--text-letter-spacing": "0.5px",
    "--text-features": '"liga" on, "calt" on',
    "--text-variations": "normal",
  });
  // Without a setting it is Obsidian's 1.5, whatever editor.lineHeight is.
  assert.equal(
    readSettings({ get: <T>(_key: string, fallback?: T) => fallback }, native)
      .editor!.lineHeight,
    1.5,
  );
  // A hand-edited settings.json with a wrong type does not break the editor.
  markdown["editor.fontLigatures"] = 3;
  const wrongSize: SettingsReader = {
    get: <T>(key: string, fallback?: T) =>
      key === "editor.fontSize" ? ("big" as T) : fallback,
  };
  const fallback = readSettings(wrongSize, native).editor!;
  assert.equal(fallback.fontSize, 16);
  assert.equal(fallback.fontLigatures, false);
  const generated: Record<string, unknown> = (await contributions())
    .configuration.properties;
  // Only the size and line height are contributed; the other font fields are native settings.
  assert.deepEqual(
    Object.keys(generated).filter((key) =>
      /\.(font|lineHeight|letterSpacing)/.test(key),
    ),
    ["lumiere.markdown.editor.fontSize", "lumiere.markdown.editor.lineHeight"],
  );
  assert.deepEqual(
    {
      ...(generated["lumiere.markdown.editor.fontSize"] as object),
      description: undefined,
    },
    {
      type: "number",
      minimum: 8,
      maximum: 48,
      default: 16,
      scope: "resource",
      description: undefined,
    },
  );
  assert.deepEqual(
    {
      ...(generated["lumiere.markdown.editor.lineHeight"] as object),
      description: undefined,
    },
    {
      type: "number",
      minimum: 1,
      maximum: 3,
      default: 1.5,
      scope: "resource",
      description: undefined,
    },
  );
});
