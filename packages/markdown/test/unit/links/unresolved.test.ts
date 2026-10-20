import { provideHostServices } from "../../../src/shared/host";
import { fakeHost } from "../../support/vscode-fake";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createRoot } from "@workshop/core";
import { metadata } from "../../../src/markdown/metadata";
import { linksHost } from "../../../src/plugins/links/host";
import { protocol } from "../../../src/plugins/links/protocol";
import { unresolvedKey } from "../../../src/plugins/links/target";
import {
  unresolvedLinks,
  wikiLinkRenderer,
} from "../../../src/plugins/links/webview";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { inlineDecorations } from "../../../src/plugins/livePreview/inline";
import { inlineRenderers } from "../../../src/plugins/livePreview/registry";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import { Endpoint } from "../../../src/shared/rpc/endpoint";
import type { PanelShell } from "../../../src/shared/host";

test("an unresolved key is the link path as written, lower-cased, without subpath or alias", () => {
  assert.equal(unresolvedKey("New Note"), "new note");
  assert.equal(unresolvedKey("Folder/Note#Heading"), "folder/note");
  assert.equal(unresolvedKey("Note#^block|alias"), "note");
  assert.equal(unresolvedKey("#Heading"), "");
});

/** The classes of every wikilink mark, with the cursor at `cursor`. */
function wikiLinkClasses(doc: string, cursor: number, unresolved: string[]) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [
      documentTree,
      inlineRenderers.of(wikiLinkRenderer),
      unresolvedLinks.init(() => new Set(unresolved)),
    ],
  });
  const classes: Record<string, string> = {};
  inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
    0,
    doc.length,
    (_from, _to, value) => {
      const href = value.spec.attributes?.["data-href"];
      if (href) {
        classes[href] = value.spec.class;
      }
    },
  );
  return classes;
}

test("rendered wikilinks to missing notes are styled unresolved; revealed ones are not", () => {
  const doc = "[[Missing]] [[Here|alias]] [[missing#Part]] [[#Top]]\n\nend";
  assert.deepEqual(wikiLinkClasses(doc, doc.length, ["missing"]), {
    Missing: "md-link md-link-rendered is-unresolved",
    Here: "md-link md-link-rendered",
    "missing#Part": "md-link md-link-rendered is-unresolved",
    "#Top": "md-link md-link-rendered",
  });
  assert.equal(
    wikiLinkClasses(doc, 3, ["missing"]).Missing,
    "md-link",
    "a revealed link shows its source, without unresolved styling",
  );
});

function connectedEndpoints() {
  let toClient: (value: unknown) => void = () => {};
  let toHost: (value: unknown) => void = () => {};
  const scope = { after: () => () => {} };
  const host = new Endpoint(
    {
      send: (value) => toClient(value),
      listen(listener) {
        toHost = listener;
        return () => {};
      },
    },
    scope,
  );
  const client = new Endpoint(
    {
      send: (value) => toHost(value),
      listen(listener) {
        toClient = listener;
        return () => {};
      },
    },
    scope,
  );
  return { host, client };
}

test("the links host sends the note's unresolved set, then only its changes", async () => {
  const index = new MemoryVaultIndex({
    root: "memory:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  const entry = (path: string) => ({
    uri: `memory:///vault/${encodeURI(path)}`,
    path,
    mtime: 1,
    size: 1,
  });
  index.replaceFiles([entry("A.md"), entry("B.md")]);
  index.setMetadata("A.md", metadata("[[B]] [[Missing]] [[missing#x]] [[C]]"));
  index.notifyResolved();

  const { host, client } = connectedEndpoints();
  const root = createRoot();
  root.provide("rpc", host);
  root.provide("vault", index);
  provideHostServices(root, fakeHost());
  root.provide("resources", {
    load: async () => {
      throw new Error("Unused");
    },
  });
  const panel = {
    document: { uri: "memory:///vault/A.md" },
    active: () => true,
  } as PanelShell;
  root.plugin(linksHost, { panel });
  await root.settled();

  const updates: string[][] = [];
  client.on(protocol, "unresolvedChanged", (paths) => {
    updates.push(paths);
  });
  assert.deepEqual(await client.call(protocol, "unresolved", {}), [
    "c",
    "missing",
  ]);

  index.upsertFile(entry("Missing.md"));
  index.notifyResolved();
  index.notifyResolved();
  index.setMetadata("A.md", metadata("[[B]] [[Missing]] [[D]]"));
  index.notifyResolved();
  await new Promise((resolve) => setTimeout(resolve, 10));
  // Both changes happened in one task: the set is state, so only the
  // latest one is sent.
  assert.deepEqual(updates, [["d"]]);

  await root.dispose();
  host.dispose();
  client.dispose();
});

test("rendered Markdown links to missing notes are styled unresolved; revealed ones are not", () => {
  const doc = "See [Missing](Missing.md) and [Here](Here.md).\n\nend";
  const classes = (cursor: number) => {
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [
        documentTree,
        unresolvedLinks.init(() => new Set(["missing"])),
      ],
    });
    const byHref: Record<string, string> = {};
    inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
      0,
      doc.length,
      (_from, _to, value) => {
        const href = value.spec.attributes?.["data-href"];
        if (href && value.spec.class?.includes("md-link")) {
          byHref[href] = value.spec.class;
        }
      },
    );
    return byHref;
  };
  assert.deepEqual(classes(doc.length), {
    "Missing.md": "md-link md-link-rendered is-unresolved",
    "Here.md": "md-link md-link-rendered",
  });
  // Caret inside the Missing link reveals source — no unresolved class.
  const revealed = classes(doc.indexOf("Missing]"));
  assert.equal(revealed["Missing.md"], "md-link");
});
