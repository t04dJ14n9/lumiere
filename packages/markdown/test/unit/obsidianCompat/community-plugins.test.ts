import assert from "node:assert/strict";
import test from "node:test";
import {
  EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CommunityPluginLoader } from "../../../src/plugins/obsidianCompat/community-plugins";
import {
  createDiv,
  installDomHelpers,
} from "../../../src/plugins/obsidianCompat/obsidian-module";
import { ObsidianRuntime } from "../../../src/plugins/obsidianCompat/runtime";
import { compatFixture, ROOT_A } from "./fixture";

function fakeCmView(initialDoc: string): EditorView {
  let state = EditorState.create({ doc: initialDoc });
  return {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    focus() {},
    hasFocus: true,
    scrollDOM: { scrollTop: 0, scrollLeft: 0 },
    coordsAtPos: () => ({ top: 0, left: 0, bottom: 16 }),
  } as unknown as EditorView;
}

const SAMPLE_PLUGIN_MAIN_JS = `
const { Plugin, PluginSettingTab, Setting } = require("obsidian");
const { StateField } = require("@codemirror/state");

class SampleSettingTab extends PluginSettingTab {
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Prefix").setDesc("Banner prefix");
  }
}

module.exports = class SamplePlugin extends Plugin {
  async onload() {
    this.eventsLog = [];
    const saved = (await this.loadData()) || { prefix: "[OBS]" };
    this.prefix = saved.prefix;

    this.addStatusBarItem().setText("Sample Ready");
    this.addRibbonIcon("sparkles", "Run Sample", () => {
      this.eventsLog.push("ribbon-clicked");
    });
    this.addSettingTab(new SampleSettingTab(this.app, this));

    const ext = StateField.define({
      create: () => "sample-cm-field",
      update: (v) => v,
    });
    this.registerEditorExtension(ext);

    this.addCommand({
      id: "insert-prefix",
      name: "Insert Prefix",
      editorCallback: (editor) => {
        editor.replaceSelection(this.prefix + " ");
      },
    });

    this.registerMarkdownCodeBlockProcessor("sample-badge", (source, el) => {
      el.createSpan({ cls: "badge-out", text: "BADGE:" + source.trim() });
    });

    this.registerMarkdownPostProcessor((el) => {
      el.setAttr("data-post-processed", "true");
    });

    await this.saveData({ prefix: this.prefix, loaded: true });
  }

  onunload() {
    this.unloaded = true;
  }
};
`;

test("ObsidianRuntime executes CJS community plugin bundles, bridges commands/processors/extensions and cleans up on unload", async () => {
  installDomHelpers();
  const savedData = new Map<string, unknown>([
    ["sample-plugin", { prefix: "[LUMIERE]" }],
  ]);
  const registeredCommands: { id: string; name: string }[] = [];
  const registeredExtensions: Extension[] = [];

  const cm = fakeCmView("Hello world");
  const runtime = new ObsidianRuntime({
    getEditorView: () => cm,
    loadPluginData: async (id) => savedData.get(id) ?? null,
    savePluginData: async (id, data) => {
      savedData.set(id, data);
    },
    registerEditorExtension: (ext) => {
      registeredExtensions.push(ext);
      return () => {
        const idx = registeredExtensions.indexOf(ext);
        if (idx >= 0) {
          registeredExtensions.splice(idx, 1);
        }
      };
    },
    registerCommand: (cmd) => {
      registeredCommands.push({ id: cmd.id, name: cmd.name });
      return () => {
        const idx = registeredCommands.findIndex((c) => c.id === cmd.id);
        if (idx >= 0) {
          registeredCommands.splice(idx, 1);
        }
      };
    },
  });

  await runtime.applyBootstrap({
    vaultRoot: ROOT_A,
    vaultName: "vault-a",
    configDir: ".obsidian",
    activePath: "notes/A.md",
    trusted: true,
    files: [
      {
        path: "notes/A.md",
        mtime: 100,
        size: 11,
        content: "Hello world",
      },
    ],
    plugins: [
      {
        id: "sample-plugin",
        manifest: {
          id: "sample-plugin",
          name: "Sample Plugin",
          version: "1.2.0",
        },
        mainJs: SAMPLE_PLUGIN_MAIN_JS,
        stylesCss: ".badge-out { color: green; }",
        data: { prefix: "[LUMIERE]" },
      },
    ],
  });

  assert.deepEqual(runtime.getLoadedPluginIds(), ["sample-plugin"]);
  assert.equal(registeredExtensions.length, 1);
  assert.deepEqual(savedData.get("sample-plugin"), {
    prefix: "[LUMIERE]",
    loaded: true,
  });

  // Execute registered editor command on CM6 view
  assert.equal(registeredCommands.length, 1);
  assert.equal(registeredCommands[0]?.id, "sample-plugin:insert-prefix");
  const executed = runtime.app.commands.executeCommandById(
    "sample-plugin:insert-prefix",
  );
  assert.equal(executed, true);
  assert.equal(cm.state.doc.toString(), "[LUMIERE] Hello world");

  // Run codeblock processor & post-processor on rendered container
  const codeBlockContainer = createDiv();
  const handled = await runtime.runCodeBlockProcessors(
    "sample-badge",
    "status-ok\n",
    codeBlockContainer,
    "notes/A.md",
  );
  assert.equal(handled, true);
  const renderedBadge = codeBlockContainer.find(".badge-out");
  assert.ok(renderedBadge);
  assert.equal(renderedBadge.getText(), "BADGE:status-ok");

  await runtime.runPostProcessors(codeBlockContainer, "notes/A.md");
  assert.equal(codeBlockContainer.getAttr("data-post-processed"), "true");

  // Unload plugin and verify full cleanup
  runtime.unloadPlugin("sample-plugin");
  assert.deepEqual(runtime.getLoadedPluginIds(), []);
  assert.equal(registeredExtensions.length, 0);
  assert.equal(registeredCommands.length, 0);
  assert.equal(runtime.app.commands.listCommands().length, 0);
});

test("ObsidianRuntime refuses to execute community plugins when workspace is untrusted", async () => {
  const runtime = new ObsidianRuntime();
  await runtime.applyBootstrap({
    vaultRoot: ROOT_A,
    vaultName: "vault-a",
    configDir: ".obsidian",
    activePath: "notes/A.md",
    trusted: false,
    files: [],
    plugins: [
      {
        id: "unsafe",
        manifest: { id: "unsafe", name: "Unsafe", version: "1.0.0" },
        mainJs: "throw new Error('Must never execute in untrusted workspace');",
      },
    ],
  });
  assert.deepEqual(runtime.getLoadedPluginIds(), []);
  await assert.rejects(
    runtime.loadPluginBundle({
      id: "unsafe",
      manifest: { id: "unsafe", name: "Unsafe", version: "1.0.0" },
      mainJs: "module.exports = class {};",
    }),
    /untrusted workspace/,
  );
});

test("CommunityPluginLoader loads enabled bundles, enforces path containment and respects workspace trust", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());

  let trusted = true;
  Object.assign(f.workbench.workspace.vaultCode, {
    answer: () => trusted,
  });

  await f.change(
    `${ROOT_A}/.obsidian/community-plugins.json`,
    JSON.stringify(["valid-plugin", "../escape-plugin", "symlink-plugin"]),
  );
  await f.change(
    `${ROOT_A}/.obsidian/plugins/valid-plugin/manifest.json`,
    JSON.stringify({
      id: "valid-plugin",
      name: "Valid Plugin",
      version: "2.0.0",
    }),
  );
  await f.change(
    `${ROOT_A}/.obsidian/plugins/valid-plugin/main.js`,
    "module.exports = class extends require('obsidian').Plugin { onload() {} };",
  );
  await f.change(
    `${ROOT_A}/.obsidian/plugins/valid-plugin/styles.css`,
    ".valid { display: block; }",
  );
  await f.change(
    `${ROOT_A}/.obsidian/plugins/valid-plugin/data.json`,
    JSON.stringify({ count: 5 }),
  );

  // Mark symlink-plugin as a symlink so authorize rejects it
  f.symlinks.add(`${ROOT_A}/.obsidian/plugins/symlink-plugin`);
  await f.change(
    `${ROOT_A}/.obsidian/plugins/symlink-plugin/manifest.json`,
    JSON.stringify({ id: "symlink-plugin", name: "Symlink", version: "1.0.0" }),
  );
  await f.change(
    `${ROOT_A}/.obsidian/plugins/symlink-plugin/main.js`,
    "module.exports = class {};",
  );

  const loader = new CommunityPluginLoader(f.workbench);

  const loaded = await loader.loadEnabledPlugins(ROOT_A, ".obsidian");
  assert.equal(loaded.trusted, true);
  assert.equal(loaded.plugins.length, 1);
  assert.equal(loaded.plugins[0]?.manifest.id, "valid-plugin");
  assert.equal(loaded.plugins[0]?.stylesCss, ".valid { display: block; }");
  assert.deepEqual(loaded.plugins[0]?.data, { count: 5 });

  await loader.savePluginData(ROOT_A, ".obsidian", "valid-plugin", {
    count: 6,
  });
  assert.deepEqual(
    await loader.loadPluginData(ROOT_A, ".obsidian", "valid-plugin"),
    { count: 6 },
  );

  // Untrusted workspace returns zero plugins and rejects data access
  trusted = false;
  const untrustedLoaded = await loader.loadEnabledPlugins(ROOT_A, ".obsidian");
  assert.equal(untrustedLoaded.trusted, false);
  assert.equal(untrustedLoaded.plugins.length, 0);
  await assert.rejects(
    loader.savePluginData(ROOT_A, ".obsidian", "valid-plugin", { count: 7 }),
    /untrusted vault/,
  );
});
