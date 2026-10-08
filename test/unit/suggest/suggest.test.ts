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
import { Context } from "../../../src/kernel";
import { suggestHost } from "../../../src/plugins/suggest/host";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";
import type { PanelShell } from "../../../src/shared/runtime";
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
  const root = Context.create();
  let links = true;
  root.provide("rpc", pair.host);
  root.provide("vault", index());
  root.provide(
    "workbench",
    fakeWorkbench({
      config: () => ({
        preset: "obsidian",
        mode: "livePreview",
        features: { links: { enabled: links, config: {} } },
      }),
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
