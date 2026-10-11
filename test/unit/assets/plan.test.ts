import assert from "node:assert/strict";
import test from "node:test";
import { portableAssetLink } from "../../../src/plugins/assets/link";
import {
  keepBothName,
  planAssetImport,
} from "../../../src/plugins/assets/plan";
import { importAsset } from "../../../src/plugins/assets/run";
import type { WorkspaceFiles } from "../../../src/shared/workspace-files";

test("a collision waits for a choice and keep-both suffixes the name", () => {
  const waiting = planAssetImport({
    assetsPath: "assets",
    bundle: "knowledge",
    originalName: "Fig.PNG",
    existingNames: ["fig.png"],
    directoryExists: true,
  });
  assert.equal(waiting.kind, "choose");
  const kept = planAssetImport({
    assetsPath: "assets",
    bundle: "knowledge",
    originalName: "Fig.PNG",
    existingNames: ["fig.png"],
    directoryExists: true,
    choice: "keep-both",
  });
  assert.deepEqual(kept, {
    kind: "ready",
    relativePath: "assets/Fig-2.PNG",
    mkdir: false,
  });
  assert.equal(keepBothName("fig.png", ["fig.png", "fig-2.png"]), "fig-3.png");
});

test("assets inside the bundle are refused", () => {
  const plan = planAssetImport({
    assetsPath: "knowledge/assets",
    bundle: "knowledge",
    originalName: "fig.png",
    existingNames: [],
    directoryExists: false,
  });
  assert.equal(plan.kind, "refuse");
});

test("the portable link is relative and an image is embedded", () => {
  assert.equal(
    portableAssetLink("knowledge/concept/rag.md", "assets/fig.png"),
    "![fig](../../assets/fig.png)",
  );
  assert.equal(
    portableAssetLink("notes/a.md", "assets/my file.pdf"),
    "[my file](../assets/my%20file.pdf)",
  );
});

test("import creates the assets folder only after a keep-both choice", async () => {
  const made: string[] = [];
  const copied: string[] = [];
  const files: WorkspaceFiles = {
    async readText() {
      return undefined;
    },
    async writeText() {},
    async list(uri) {
      return uri.endsWith("/assets") ? ["fig.png"] : undefined;
    },
    async mkdir(uri) {
      made.push(uri);
    },
    async copy(from, to) {
      copied.push(`${from}->${to}`);
    },
    async move() {},
    async remove() {},
    async isSymbolicLink() {
      return false;
    },
    async pickFile() {
      return undefined;
    },
  };
  let asked = false;
  await importAsset({
    files,
    sourceUri: "file:///tmp/fig.png",
    rootUri: "file:///proj",
    assetsPath: "assets",
    bundle: "knowledge",
    notePath: "knowledge/concept/rag.md",
    noteText: "# RAG\n",
    document: {
      id: "1",
      uri: "file:///proj/knowledge/concept/rag.md",
      version: 1,
      isDirty: false,
      isUntitled: false,
      eol: "\n",
      getText: () => "# RAG\n",
      save: async () => true,
    },
    ask: async () => {
      asked = true;
      return "Keep both";
    },
    apply: async () => true,
    clipboardWrite: async () => {},
    inform() {},
    error(message) {
      throw new Error(message);
    },
  });
  assert.equal(asked, true);
  assert.equal(made.length, 0);
  assert.match(copied[0] ?? "", /fig-2\.png$/);
});
