import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import type {
  HostDocument,
  PanelShell,
  Workshop,
} from "../../../src/shared/runtime";
import type { Okf } from "../../../src/plugins/okfCore/api";
import { NoteResources } from "../../../src/plugins/resources/note-resources";
import type { Vault, Vaults } from "../../../src/plugins/vault/api";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import { rpcPair } from "../../support/rpc-pair";
import { sourcesPropertyHost } from "../../../src/plugins/sourcesProperty/host";
import { protocol } from "../../../src/plugins/sourcesProperty/protocol";

test("Sources opens a PDF after containing the target, not the note-source allowlist", async () => {
  const root = "vscode-remote://host/vault";
  const documentUri = `${root}/bundle/concept/topic.md`;
  const pdfUri = `${root}/bundle/raw/paper.pdf`;
  const text = `---\nsources:\n  - resource: /raw/paper.pdf#page=3\n---\n`;
  const index = new MemoryVaultIndex({
    root,
    folderNote: "",
    linkFormat: "shortest",
  });
  index.replaceFiles(
    ["bundle/index.md", "bundle/concept/topic.md", "bundle/raw/paper.pdf"].map(
      (path) => ({
        uri: `${root}/${path}`,
        path,
        mtime: 1,
        size: 1,
      }),
    ),
  );
  const vault = {
    index,
    settled: async () => {},
    pathOf: (uri: string) =>
      index.files().find((file) => file.uri === uri)?.path,
  } as Vault;
  const opens: Array<{ uri: string; options?: { fragment?: string } }> = [];
  const resources = new NoteResources({
    source: documentUri,
    vault: index,
    files: {
      async stat() {
        return { mtime: 1, symbolicLink: false };
      },
      async read() {
        return new Uint8Array();
      },
    },
    resourceUrl: (uri) => uri,
  });
  // Reproduces the pre-fix failure: authorizing the PDF target throws.
  await assert.rejects(resources.authorize(pdfUri), /Unknown note source/);

  const { host, client, dispose } = rpcPair();
  const ctx = Context.create();
  ctx.provide("rpc", host);
  ctx.provide("resources", resources);
  ctx.provide("okf", {
    live: true,
    bundles: () => [
      {
        id: "bundle",
        name: "bundle",
        root: "bundle",
        vaultRoot: root,
      },
    ],
    scope: () => ({ ambiguous: false, choices: [] }),
  } as Okf);
  ctx.provide("vaults", {
    locate: async (uri: string) =>
      uri === documentUri
        ? { vault, path: "bundle/concept/topic.md" }
        : undefined,
    open: async (uri: string, options?: { fragment?: string }) => {
      opens.push(options === undefined ? { uri } : { uri, options });
    },
    text: async () => "",
  } as unknown as Vaults);
  ctx.provide("workshop", {
    clipboard: {
      async read() {
        return "";
      },
      async write() {},
    },
    async execute() {},
  } as unknown as Workshop);
  const panel = {
    document: {
      uri: documentUri,
      getText: () => text,
    } as HostDocument,
  } as PanelShell;
  ctx.plugin(sourcesPropertyHost, { panel });
  await ctx.settled();

  const result = await client.call(protocol, "open", {
    resource: "/raw/paper.pdf#page=3",
  });
  assert.deepEqual(result, { opened: true });
  assert.deepEqual(opens, [{ uri: pdfUri, options: { fragment: "page=3" } }]);

  await ctx.dispose();
  await dispose();
});
