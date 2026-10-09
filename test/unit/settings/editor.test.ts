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
import { contributions } from "../../../scripts/generate-contributions";

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
    strictLineBreaks: false,
    rightToLeft: false,
    useTabs: true,
    tabSize: 4,
    // Native editor font settings for Markdown; empty until the host reads them.
    fontFamily: "",
    fontSize: 0,
    fontWeight: "normal",
    lineHeight: 0,
    letterSpacing: 0,
    fontLigatures: false,
    fontVariations: false,
  });
  // VS Code's defaults: ligatures off, no variations; no size without a host.
  assert.deepEqual(fontDeclarations(settingsExtensions({})), {
    "--text-weight": "normal",
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
      }),
    ),
  }).state;
  assert.equal(state.doc, previous.doc);
  assert.equal(state.selection, previous.selection);
  assert.equal(state.facet(editorSettings).strictLineBreaks, true);
  assert.deepEqual(state.facet(EditorView.editorAttributes).at(-1), {
    dir: "rtl",
  });
});
test("resource settings use manifest aliases and validate all editor fields", () => {
  const values: Record<string, unknown> = {
    "files.newNoteFolder": "notes",
    "files.attachmentFolder": "./media",
    "editor.rightToLeft": true,
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
        properties[`markdownWorkbench.${key}`]?.default,
        properties[`markdownWorkbench.${key}`]?.scope,
      ],
      [value, "resource"],
      key,
    );
  }
  assert.deepEqual(
    generated.menus["editor/title"].map((menu) => menu.command).sort(),
    [
      "markdownWorkbench.addProperty",
      "markdownWorkbench.openAsText",
      "markdownWorkbench.titleActions",
    ],
  );
  assert.ok(
    generated.menus["webview/context"].some(
      (menu) =>
        menu.command === "markdownWorkbench.toggleBold" &&
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
        (binding) => binding.command === `markdownWorkbench.${id}`,
      ),
      id,
    );
  }
});

test("manual and parity inventories include every generated command and setting", async () => {
  const { readFileSync } = await import("node:fs");
  const generated = await contributions();
  const manual = readFileSync("docs/MANUAL_TEST_PLAN.md", "utf8");
  const parity = readFileSync("docs/PARITY.md", "utf8");
  for (const id of [
    ...generated.commands.map((command) => command.command),
    ...Object.keys(generated.configuration.properties),
  ]) {
    assert.ok(manual.includes(id), `manual: ${id}`);
    assert.ok(parity.includes(id), `parity: ${id}`);
  }
  assert.equal(
    generated.menus.commandPalette.find(
      (menu) => menu.command === "markdownWorkbench.consumeVimHostShortcut",
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
      key.startsWith("markdownWorkbench.lineNumbers."),
    ),
  );
});

test("only Copy Link for Agent remains of the agent commands", async () => {
  const generated = await contributions();
  const settings = Object.keys(generated.configuration.properties);
  assert.ok(
    settings.includes("markdownWorkbench.plugins.copyLinkForAgent.enabled"),
  );
  assert.equal(
    settings.some((key) => key.includes("copyForAgent")),
    false,
  );
  const commands = generated.commands.map((command) => command.command);
  assert.ok(commands.includes("markdownWorkbench.copyLinkForAgent"));
  assert.equal(commands.includes("markdownWorkbench.copyForAgent"), false);
  assert.deepEqual(
    generated.commands
      .filter((command) => /agent/i.test(command.command))
      .map((command) => command.title),
    ["Copy Link for Agent"],
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
      menus.some((menu) => menu.command.endsWith(".copyForAgent")),
      false,
    );
  }
});

test("note text follows the native editor font settings for Markdown files, which are not contributed again", async () => {
  const reader: SettingsReader = {
    get: <T>(_key: string, fallback?: T) => fallback,
  };
  // What VS Code returns for a Markdown file, [markdown] overrides included.
  const markdown: Record<string, unknown> = {
    "editor.fontFamily": "Fira Code",
    "editor.fontSize": 18,
    "editor.fontWeight": "300",
    "editor.lineHeight": 27,
    "editor.letterSpacing": 0.5,
    "editor.fontLigatures": true,
    "editor.fontVariations": false,
  };
  const native: SettingsReader = {
    get: <T>(key: string) => markdown[key] as T,
  };
  const editor = readSettings(reader, native).editor!;
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
    ["Fira Code", 18, "300", 27, 0.5, true, false],
  );
  // 27px at 18px is a ratio of 1.5 (whole pixels, as in VS Code).
  assert.deepEqual(fontDeclarations(settingsExtensions(editor)), {
    "--text-font": "Fira Code, monospace",
    "--code-font": "Fira Code, monospace",
    "--text-size": "18px",
    "--text-weight": "300",
    "--line-height": "1.5",
    "--text-letter-spacing": "0.5px",
    "--text-features": '"liga" on, "calt" on',
    "--text-variations": "normal",
  });
  // The default line height is VS Code's automatic one, not 1.5 (Linux).
  assert.equal(
    fontDeclarations(settingsExtensions({ ...editor, lineHeight: 0 }))[
      "--line-height"
    ],
    "1.333333", // round(1.35 × 18) = 24px
  );
  // A hand-edited settings.json with a wrong type does not break the editor.
  markdown["editor.fontSize"] = "big";
  markdown["editor.fontLigatures"] = 3;
  const fallback = readSettings(reader, native).editor!;
  assert.equal(fallback.fontSize, 0);
  assert.equal(fallback.fontLigatures, false);
  const generated = await contributions();
  for (const key of Object.keys(generated.configuration.properties)) {
    assert.ok(!/\.(font|lineHeight|letterSpacing)/.test(key), key);
  }
});
