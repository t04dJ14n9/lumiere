import test from "node:test";
import assert from "node:assert/strict";
import { resolveIdeContextSendTarget } from "../../../src/shared/ide-context/resolve-target";

function envWith(commands: string[]) {
  return { commands: new Set(commands) };
}

test("auto + both Claude and Codex available → picker (never silent open)", () => {
  assert.equal(
    resolveIdeContextSendTarget(
      "auto",
      envWith([
        "claude-vscode.editor.open",
        "chatgpt.openSidebar",
        "chatgpt.addFileToThread",
      ]),
    ),
    "picker",
  );
});

test("auto + sole Claude → claudeCode", () => {
  assert.equal(
    resolveIdeContextSendTarget("auto", envWith(["claude-vscode.editor.open"])),
    "claudeCode",
  );
});

test("auto + sole Codex → codex", () => {
  assert.equal(
    resolveIdeContextSendTarget(
      "auto",
      envWith(["chatgpt.openSidebar", "chatgpt.addFileToThread"]),
    ),
    "codex",
  );
});

test("forced claudeCode when available → claudeCode; when unavailable → clipboard", () => {
  assert.equal(
    resolveIdeContextSendTarget(
      "claudeCode",
      envWith(["claude-vscode.editor.open"]),
    ),
    "claudeCode",
  );
  assert.equal(
    resolveIdeContextSendTarget("claudeCode", envWith([])),
    "clipboard",
  );
});

test("forced codex when available → codex; when unavailable → clipboard", () => {
  assert.equal(
    resolveIdeContextSendTarget(
      "codex",
      envWith(["chatgpt.openSidebar", "chatgpt.addFileToThread"]),
    ),
    "codex",
  );
  assert.equal(
    resolveIdeContextSendTarget("codex", envWith(["chatgpt.openSidebar"])),
    "clipboard",
  );
});
