import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  App,
  Component,
  createDiv,
  createEl,
  createFragment,
  createPluginRequire,
  createSpan,
  debounce,
  Editor,
  Events,
  getAllTags,
  installDomHelpers,
  MarkdownRenderChild,
  MarkdownRenderer,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  normalizePath,
  obsidianModule,
  parseFrontMatterAliases,
  parseFrontMatterTags,
  parseYaml,
  Platform,
  Plugin,
  PluginSettingTab,
  resolveSubpath,
  Setting,
  stringifyYaml,
  TFile,
  TFolder,
} from "../../../src/plugins/obsidianCompat/obsidian-module";

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
    coordsAtPos: () => ({ top: 10, left: 20, bottom: 30 }),
  } as unknown as EditorView;
}

test("Component lifecycle loads children once and cleans up callbacks, events, DOM listeners and intervals on unload", () => {
  installDomHelpers();
  const order: string[] = [];
  const emitter = new Events();
  const parent = new Component();
  const child = new MarkdownRenderChild(createDiv("child-el"));

  parent.onload = () => {
    order.push("parent:load");
  };
  parent.onunload = () => order.push("parent:unload");
  child.onload = () => {
    order.push("child:load");
  };
  child.onunload = () => order.push("child:unload");

  parent.load();
  parent.load(); // idempotent second call
  parent.addChild(child);
  assert.deepEqual(order, ["parent:load", "child:load"]);

  let eventCalls = 0;
  parent.registerEvent(
    emitter.on("ping", () => {
      eventCalls += 1;
    }),
  );
  emitter.trigger("ping");
  assert.equal(eventCalls, 1);

  const btn = createEl("button", { text: "Click" });
  let domClicks = 0;
  parent.registerDomEvent(btn, "click", () => {
    domClicks += 1;
  });
  btn.dispatchEvent(new Event("click"));
  assert.equal(domClicks, 1);

  let cleanedUp = false;
  parent.register(() => {
    cleanedUp = true;
  });
  const timerId = parent.registerInterval(
    setInterval(() => {}, 60_000) as unknown as number,
  );
  assert.ok(timerId);

  parent.unload();
  emitter.trigger("ping");
  btn.dispatchEvent(new Event("click"));

  assert.equal(eventCalls, 1);
  assert.equal(domClicks, 1);
  assert.equal(cleanedUp, true);
  assert.deepEqual(order, [
    "parent:load",
    "child:load",
    "child:unload",
    "parent:unload",
  ]);
});

test("Editor CM6 bridge supports cursor, selection, line, range, offset and transaction operations", () => {
  const cm = fakeCmView("Alpha line\nBeta line\nGamma line");
  const editor = new Editor(cm);

  assert.equal(editor.cm, cm);
  assert.equal(editor.lineCount(), 3);
  assert.equal(editor.lastLine(), 2);
  assert.equal(editor.getLine(1), "Beta line");

  editor.setLine(1, "Beta updated");
  assert.equal(editor.getLine(1), "Beta updated");

  editor.setCursor({ line: 2, ch: 5 });
  assert.deepEqual(editor.getCursor(), { line: 2, ch: 5 });

  const offset = editor.posToOffset({ line: 1, ch: 5 });
  assert.deepEqual(editor.offsetToPos(offset), { line: 1, ch: 5 });

  assert.equal(
    editor.getRange({ line: 0, ch: 0 }, { line: 0, ch: 5 }),
    "Alpha",
  );
  editor.replaceRange("Omega", { line: 0, ch: 0 }, { line: 0, ch: 5 });
  assert.equal(editor.getLine(0), "Omega line");

  editor.setSelection({ line: 0, ch: 6 }, { line: 0, ch: 10 });
  assert.equal(editor.somethingSelected(), true);
  assert.equal(editor.getSelection(), "line");

  editor.replaceSelection("row");
  assert.equal(editor.getLine(0), "Omega row");

  editor.transaction({
    changes: [
      {
        from: { line: 2, ch: 0 },
        to: { line: 2, ch: 5 },
        text: "Delta",
      },
    ],
  });
  assert.equal(editor.getLine(2), "Delta line");
});

test("Vault, MetadataCache and FileManager index markdown metadata, resolve links and mutate files", async () => {
  const app = new App();
  app.vault.syncFiles([
    {
      path: "notes/index.md",
      mtime: 100,
      size: 64,
      content: [
        "---",
        "title: Home",
        "tags: [project, roadmap]",
        "aliases: [Start]",
        "---",
        "# Welcome",
        "See [[target#Details|Target Note]] and #inline-tag.",
        "Paragraph block ^blk1",
      ].join("\n"),
    },
    {
      path: "notes/sub/target.md",
      mtime: 200,
      size: 32,
      content: "# Target\n\n## Details\nBody text\n",
    },
  ]);

  assert.equal(app.vault.getMarkdownFiles().length, 2);
  const indexFile = app.vault.getFileByPath("notes/index.md");
  assert.ok(indexFile instanceof TFile);
  assert.ok(app.vault.getFolderByPath("notes/sub") instanceof TFolder);

  const cache = app.metadataCache.getFileCache(indexFile);
  assert.ok(cache);
  assert.equal(cache.frontmatter?.title, "Home");
  assert.deepEqual(parseFrontMatterAliases(cache.frontmatter), ["Start"]);
  assert.deepEqual(parseFrontMatterTags(cache.frontmatter), [
    "#project",
    "#roadmap",
  ]);
  assert.deepEqual(getAllTags(cache), ["#inline-tag", "#project", "#roadmap"]);
  assert.equal(cache.headings?.[0]?.heading, "Welcome");
  assert.ok(cache.blocks?.blk1);

  const dest = app.metadataCache.getFirstLinkpathDest(
    "target#Details",
    "notes/index.md",
  );
  assert.equal(dest?.path, "notes/sub/target.md");
  assert.equal(
    app.metadataCache.fileToLinktext(dest!, "notes/index.md"),
    "target",
  );

  const targetCache = app.metadataCache.getFileCache(dest);
  const subpath = resolveSubpath(targetCache, "#Details");
  assert.equal(subpath?.type, "heading");

  await app.fileManager.processFrontMatter(indexFile, (fm) => {
    fm.status = "active";
  });
  const updatedText = await app.vault.read(indexFile);
  assert.match(updatedText, /status: active/);

  const created = await app.vault.create("notes/new.md", "# Fresh");
  assert.equal(await app.vault.cachedRead(created), "# Fresh");
  await app.vault.rename(created, "notes/renamed.md");
  assert.equal(created.path, "notes/renamed.md");
  await app.vault.delete(created);
  assert.equal(app.vault.getFileByPath("notes/renamed.md"), null);
});

test("Obsidian DOM helpers, Setting, Modal, Notice, Menu, MarkdownRenderer and utilities work idempotently", async () => {
  installDomHelpers();
  installDomHelpers(); // idempotent

  const root = createDiv({ cls: "card primary", attr: { "data-id": 42 } });
  assert.equal(root.hasClass("card"), true);
  assert.equal(root.getAttr("data-id"), "42");

  assert.equal(createSpan({ text: "Standalone" }).getText(), "Standalone");
  const span = root.createSpan({ text: "Initial" });
  span.addClass("badge");
  span.toggleClass("active", true);
  span.setCssProps({ "--accent": "#ff0" });
  span.setCssStyles({ color: "red" });
  assert.equal(span.getText(), "Initial");
  assert.equal(span.hasClass("active"), true);

  const frag = createFragment((f) => {
    f.createEl("strong", { text: "Bold" });
  });
  span.setText(frag);
  assert.equal(span.getText(), "Bold");

  let toggled = false;
  let textVal = "";
  const setting = new Setting(root)
    .setName("Enable feature")
    .setDesc("Toggle feature state")
    .addToggle((toggle) =>
      toggle.setValue(false).onChange((v) => {
        toggled = v;
      }),
    )
    .addText((text) =>
      text
        .setPlaceholder("Enter value")
        .setValue("hello")
        .onChange((v) => {
          textVal = v;
        }),
    );
  assert.equal(setting.components.length, 2);
  (setting.components[0] as unknown as { onClick: () => void }).onClick();
  assert.equal(toggled, true);
  assert.equal(
    (setting.components[1] as unknown as { getValue: () => string }).getValue(),
    "hello",
  );
  void textVal;

  const app = new App();
  const modal = new Modal(app).setTitle("Test Modal").setContent("Hello");
  modal.open();
  assert.equal(modal.titleEl.textContent, "Test Modal");
  modal.close();

  const notice = new Notice("Saved!", 0);
  assert.equal(notice.messageEl.textContent, "Saved!");
  notice.hide();

  const menu = new Menu().addItem((item) =>
    item.setTitle("Action").setIcon("star"),
  );
  assert.equal(menu.items.length, 1);

  const renderTarget = createDiv();
  const comp = new Component();
  comp.load();
  await MarkdownRenderer.render(app, "# Rendered", renderTarget, "a.md", comp);
  assert.match(renderTarget.textContent, /Rendered/);

  assert.equal(normalizePath("\\folder//sub/note.md/"), "folder/sub/note.md");
  const parsed = parseYaml("key: value\ncount: 3") as Record<string, unknown>;
  assert.equal(parsed.key, "value");
  assert.match(stringifyYaml(parsed), /key: value/);
  assert.equal(Platform.isDesktop, true);

  const req = createPluginRequire();
  assert.equal(req("obsidian"), obsidianModule);
  assert.ok(req("@codemirror/view"));
  assert.ok(req("@codemirror/state"));
  assert.ok(Plugin.prototype instanceof Component);
  assert.ok(new PluginSettingTab(app, {}) instanceof obsidianModule.SettingTab);
  assert.ok(app.workspace.getActiveViewOfType(MarkdownView));
  const debounced = debounce(() => {}, 10);
  debounced.cancel();
});
