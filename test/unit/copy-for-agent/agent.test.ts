import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { copyForAgentHost } from "../../../src/plugins/copyForAgent/host";
import { protocol } from "../../../src/plugins/copyForAgent/protocol";
import {
  agentReferenceText,
  workspaceRelativePath,
} from "../../../src/plugins/copyForAgent/reference";
import { fixture } from "./fixture";

test("selection capture returns frozen original CRLF offsets and excludes a trailing column-zero line", async () => {
  const f = fixture();
  const selection = await f.selections.capture("panel");
  assert.ok(selection);
  assert.ok(Object.isFrozen(selection));
  assert.deepEqual(
    [
      selection.from,
      selection.to,
      selection.startLine,
      selection.endLine,
      selection.text,
    ],
    [0, 10, 1, 2, "one\ntwo\n"],
  );
  assert.equal(f.agent.reference(selection).text, "@Note.md#1-2");
  assert.throws(() => f.agent.reference({ ...selection }), {
    code: "InvalidArgument",
  });
  f.state.version++;
  assert.throws(() => f.agent.reference(selection), { code: "StaleSelection" });
  await f.pair.dispose();
});
test("selection capture rejects concurrent source changes and invented selected text", async () => {
  const f = fixture();
  f.beforeCapture(() => {
    f.state.version++;
  });
  await assert.rejects(f.selections.capture("panel"), {
    code: "StaleSelection",
  });
  f.beforeCapture(() => {});
  f.state.forged = true;
  await assert.rejects(f.selections.capture("panel"), {
    code: "StaleSelection",
  });
  f.state.closed = true;
  await assert.rejects(f.selections.capture("panel"), {
    code: "EditorNotFound",
  });
  await f.pair.dispose();
});
test("references use the workspace-relative path in one local folder, else the full URI", () => {
  assert.equal(
    workspaceRelativePath("file:///vault/folder/A%20B.md", ["file:///vault"]),
    "folder/A B.md",
  );
  assert.equal(
    agentReferenceText(
      "file:///vault/folder/A%20B.md",
      ["file:///vault"],
      2,
      2,
    ),
    "@folder/A B.md#2",
  );
  assert.equal(
    agentReferenceText("file:///vault2/A.md", ["file:///vault"], 1, 3),
    "@file:///vault2/A.md#1-3",
  );
  assert.equal(
    agentReferenceText(
      "file:///vault/A.md",
      ["file:///vault", "file:///other"],
      4,
      4,
    ),
    "@file:///vault/A.md#4",
  );
  assert.equal(
    agentReferenceText(
      "vscode-remote://ssh-remote+host/A.md",
      ["vscode-remote://ssh-remote+host/"],
      1,
      1,
    ),
    "@vscode-remote://ssh-remote+host/A.md#1",
  );
  // The ported LLM Wiki formatter rejects paths that escape the workspace.
  assert.throws(() =>
    agentReferenceText("file:///vault/a%0Ab.md", ["file:///vault"], 1, 2),
  );
  assert.throws(() =>
    agentReferenceText("file:///vault/A.md", ["file:///vault"], 3, 2),
  );
});
test("API copy refuses dirty notes; interactive choices copy text, cancel or save and recapture", async () => {
  const f = fixture();
  f.state.dirty = true;
  await assert.rejects(f.agent.copy("panel"), { code: "DocumentDirty" });
  assert.deepEqual(f.copied, []);
  assert.equal(await f.agent.copy("panel", { interactive: true }), false);
  f.state.choice = "Copy Text Only";
  assert.equal(await f.agent.copy("panel", { interactive: true }), true);
  assert.equal(f.copied.pop(), "one\ntwo\n");
  f.state.choice = "Save and Copy";
  f.beforeSave(() => {
    f.state.from = 4;
    f.state.to = 7;
  });
  assert.equal(await f.agent.copy("panel", { interactive: true }), true);
  assert.equal(f.copied.pop(), "@Note.md#2\n\n> two");
  assert.equal(f.state.dirty, false);
  await f.pair.dispose();
});
test("Copy for Agent host removes disabled handlers and restores them on enable", async () => {
  const f = fixture();
  const root = Context.create();
  root.provide("editors", f.editors);
  root.provide("selections", f.selections);
  root.provide("workbench", f.workbench);
  root.plugin(copyForAgentHost);
  await root.settled();
  assert.equal(await f.pair.client.call(protocol, "copy", {}), true);
  f.state.enabled = false;
  f.changeConfig();
  await assert.rejects(f.pair.client.call(protocol, "copy", {}), {
    code: "PluginDisabled",
  });
  f.state.enabled = true;
  f.changeConfig();
  assert.equal(await f.pair.client.call(protocol, "copy", {}), true);
  await root.dispose();
  await assert.rejects(f.pair.client.call(protocol, "copy", {}), {
    code: "PluginDisabled",
  });
  await f.pair.dispose();
});
