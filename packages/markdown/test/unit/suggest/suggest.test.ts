import { provideHostServices } from "../../../src/shared/host";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";
import { linkSuggestion } from "../../../src/plugins/links/suggestions";
import { tagSuggestion } from "../../../src/plugins/tags/suggestions";
import {
  allowsSuggestions,
  completionEdit,
} from "../../../src/plugins/suggest/completion";
import { suggestions } from "../../../src/plugins/suggest/sources";
import { protocol } from "../../../src/plugins/suggest/protocol";
import { metadata } from "../../../src/markdown/metadata";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import { createRoot } from "@workshop/core";
import { suggestHost } from "../../../src/plugins/suggest/host";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";
import type { PanelShell } from "../../../src/shared/host";
import { rpcPair } from "../../support/rpc-pair";

function context(doc: string) {
  return { state: EditorState.create({ doc }), pos: doc.length };
}
test("link and tag sources recognize partial links, headings, local and global blocks", () => {
  assert.deepEqual(linkSuggestion(context("[[Note#^ab")), {
    kind: "block",
    query: "ab",
    note: "Note",
    from: 8,
    closeLink: true,
  });
  assert.deepEqual(linkSuggestion(context("[[^^body")), {
    kind: "block",
    query: "body",
    from: 2,
    closeLink: true,
  });
  assert.equal(linkSuggestion(context("[[#Heading"))?.kind, "heading");
  assert.equal(linkSuggestion(context("[[File|alias")), undefined);
  assert.equal(linkSuggestion(context("[[Done]]")), undefined);
  assert.equal(tagSuggestion(context("# Heading")), undefined);
  assert.equal(tagSuggestion(context("word#no")), undefined);
  assert.deepEqual(tagSuggestion(context("text #proj/")), {
    kind: "tag",
    query: "proj/",
    from: 6,
    closeLink: false,
  });
});
test("completion preserves suffix text and reuses auto-paired brackets", () => {
  for (const doc of ["[[No tail", "[[No]] tail"]) {
    const state = EditorState.create({ doc });
    const transaction = state.update(
      completionEdit(state, { from: 2, to: 4 }, "Note", true),
    );
    assert.equal(transaction.state.doc.toString(), "[[Note]] tail");
    assert.equal(transaction.state.selection.main.head, 8);
  }
  const state = EditorState.create({ doc: "#pro" });
  assert.equal(
    state
      .update(completionEdit(state, { from: 1, to: 4 }, "project", false))
      .state.doc.toString(),
    "#project",
  );
});
test("completion excludes literal code and frontmatter", () => {
  for (const doc of ["`[[No`", "```\n[[No\n```", "---\nkey: '[[No'\n---"]) {
    const state = EditorState.create({
      doc,
      extensions: markdownLanguageSupport(),
    });
    assert.equal(allowsSuggestions(state, doc.indexOf("No") + 2), false, doc);
  }
  assert.equal(allowsSuggestions(context("[[No").state, 4), true);
});
function index() {
  const vault = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  for (const [path, text, excluded] of [
    ["Home.md", "[[Missing]] #Project #project", false],
    [
      "Note.md",
      "---\naliases: [Alias]\n---\n# Heading\n\nA body ^block\n\n#Project",
      false,
    ],
    ["Hidden.md", "#secret\n\nSecret ^hidden", true],
    ["image.png", "", false],
  ] as const) {
    vault.upsertFile({
      path,
      uri: `file:///vault/${path}`,
      size: text.length,
      mtime: 0,
      excluded,
    });
    vault.setMetadata(path, metadata(text));
  }
  return vault;
}
test("indexed suggestions include aliases, unresolved texts and attachments but no excluded files", () => {
  const vault = index();
  const items = suggestions(vault, "Home.md", { kind: "link", query: "" });
  assert.ok(items.some((item) => item.insert === "Note|Alias"));
  assert.ok(items.some((item) => item.insert === "Missing"));
  assert.ok(items.some((item) => item.insert === "image.png"));
  assert.ok(!items.some((item) => item.label === "Hidden"));
  assert.deepEqual(
    suggestions(vault, "Home.md", {
      kind: "heading",
      query: "Head",
      note: "Note",
    }).map((item) => item.insert),
    ["Heading"],
  );
  assert.deepEqual(
    suggestions(vault, "Home.md", { kind: "block", query: "body" }).map(
      (item) => item.insert,
    ),
    ["Note#^block"],
  );
  assert.deepEqual(
    suggestions(vault, "Note.md", { kind: "block", query: "", note: "" }).map(
      (item) => item.insert,
    ),
    ["block"],
  );
  assert.deepEqual(suggestions(vault, "Home.md", { kind: "tag", query: "" }), [
    { label: "Project", insert: "Project", detail: "3 occurrences" },
  ]);
});
test("suggestion RPC rejects extra fields and oversized results", () => {
  assert.throws(() =>
    protocol.requests.query.params.parse({
      kind: "link",
      query: "",
      source: "/outside",
    }),
  );
  assert.throws(() =>
    protocol.requests.query.result.parse(
      Array(51).fill({ label: "a", insert: "a", detail: "" }),
    ),
  );
});
test("suggest host enforces source feature switches and disposes RPC handlers", async () => {
  const pair = rpcPair();
  const root = createRoot();
  let links = true;
  root.provide("rpc", pair.host);
  root.provide("vault", index());
  provideHostServices(
    root,
    fakeHost({
      settings: {
        forNote: () => ({
          preset: "obsidian",
          mode: "livePreview",
          features: { links: { enabled: links, config: {} } },
        }),
      },
    }),
  );
  root.plugin(suggestHost, {
    panel: {
      document: fakeDocument({ uri: "file:///vault/Home.md" }),
    } as PanelShell,
  });
  await root.settled();
  assert.ok(
    (await pair.client.call(protocol, "query", { kind: "link", query: "" }))
      .length,
  );
  links = false;
  assert.deepEqual(
    await pair.client.call(protocol, "query", { kind: "link", query: "" }),
    [],
  );
  await root.dispose();
  await assert.rejects(
    pair.client.call(protocol, "query", { kind: "link", query: "" }),
    { code: "PluginDisabled" },
  );
  await pair.dispose();
});

test("suggestion cache invalidates changed metadata and computes link text only for shown results", async () => {
  const { SuggestionIndex } =
    await import("../../../src/plugins/suggest/sources");
  const vault = index();
  for (let n = 0; n < 100; n++) {
    vault.upsertFile({
      path: `Extra${n}.md`,
      uri: `file:///vault/Extra${n}.md`,
      mtime: 0,
      size: 0,
    });
  }
  const cached = new SuggestionIndex(vault);
  const stop = vault.onDidChange((change) => cached.invalidate(change));
  let calls = 0;
  const original = vault.linkText.bind(vault);
  vault.linkText = (file, source) => {
    calls++;
    return original(file, source);
  };
  assert.equal(
    cached.query("Home.md", { kind: "link", query: "Extra" }).length,
    50,
  );
  assert.equal(calls, 50);
  assert.equal(
    cached.query("Home.md", { kind: "heading", query: "", note: "Note" })[0]!
      .label,
    "Heading",
  );
  vault.setMetadata("Note.md", metadata("# Changed"));
  assert.equal(
    cached.query("Home.md", { kind: "heading", query: "", note: "Note" })[0]!
      .label,
    "Changed",
  );
  vault.upsertFile({
    path: "Note.md",
    uri: "file:///vault/Note.md",
    mtime: 1,
    size: 1,
    excluded: true,
  });
  assert.deepEqual(
    cached.query("Home.md", { kind: "heading", query: "", note: "Note" }),
    [],
  );
  await stop();
});

test("Use Wikilinks off materializes Markdown links and replaces the entire partial wiki token", async () => {
  const { SuggestionIndex } =
    await import("../../../src/plugins/suggest/sources");
  const cached = new SuggestionIndex(index());
  const alias = cached.query(
    "Home.md",
    { kind: "link", query: "Alias" },
    false,
  )[0]!;
  assert.equal(alias.insert, "[Alias](Note.md)");
  assert.equal(alias.replaceLink, true);
  const heading = cached.query(
    "Home.md",
    { kind: "heading", note: "Note", query: "Head" },
    false,
  )[0]!;
  assert.equal(heading.insert, "[Heading](Note.md#Heading)");
  const block = cached.query(
    "Home.md",
    { kind: "block", query: "body" },
    false,
  )[0]!;
  assert.equal(block.insert, "[block](Note.md#^block)");
  const state = EditorState.create({ doc: "text [[Note#Head]] tail" });
  const edited = state.update(
    completionEdit(state, { from: 12, to: 16 }, heading.insert, "replace"),
  ).state;
  assert.equal(edited.doc.toString(), "text [Heading](Note.md#Heading) tail");
  assert.equal(
    cached.query("Home.md", { kind: "tag", query: "Project" }, false)[0]!
      .insert,
    "Project",
  );
});
