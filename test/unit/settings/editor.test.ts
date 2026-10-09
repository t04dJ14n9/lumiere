import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, Compartment } from "@codemirror/state";
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

test("only Ask Agent about Selection remains of the agent commands", async () => {
  const generated = await contributions();
  const settings = Object.keys(generated.configuration.properties);
  assert.ok(settings.includes("markdownWorkbench.plugins.askAgent.enabled"));
  assert.equal(
    settings.some((key) => key.includes("copyForAgent")),
    false,
  );
  const commands = generated.commands.map((command) => command.command);
  assert.ok(commands.includes("markdownWorkbench.askAgentAboutSelection"));
  assert.equal(commands.includes("markdownWorkbench.copyForAgent"), false);
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
