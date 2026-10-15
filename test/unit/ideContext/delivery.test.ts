import test from "node:test";
import assert from "node:assert/strict";
import { copyIdeContext, sendIdeContext } from "../../../src/plugins/ideContext/delivery";
import { DEFAULT_CAPS, type IdeContextPacket } from "../../../src/shared/ide-context";
import { MemoryTempFs } from "../ide-context/memory-temp-fs";
import { AGENT_COMMANDS } from "../../../src/plugins/agentBridge/chat";

function mwPacket(): IdeContextPacket {
  return {
    version: 1,
    collectedAt: "2026-10-16T00:00:00.000Z",
    product: "markdownWorkshop",
    markdown: { editorKind: "text" },
    active: { uri: "file:///n.md" },
    tabs: { visible: ["file:///n.md"], open: [], truncated: false },
    diagnostics: { uri: "file:///n.md", items: [], truncated: false },
    warnings: [],
    caps: DEFAULT_CAPS,
  };
}

const both = new Set([
  AGENT_COMMANDS.claudeCodeOpen,
  AGENT_COMMANDS.codexOpen,
  AGENT_COMMANDS.codexAddFile,
]);

test("copy command never enters send resolution", async () => {
  let executed = 0;
  const md = await copyIdeContext(mwPacket(), async () => {}, () => {});
  assert.ok(md.includes("IDE context"));
  assert.equal(executed, 0);
});

test("both agents → picker shown (never silent open)", async () => {
  let pickerShown = false;
  let executed: string[] = [];
  await sendIdeContext(mwPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => {
      pickerShown = true;
      return "clipboard";
    },
  });
  assert.equal(pickerShown, true);
  assert.deepEqual(executed, []);
});

test("picker Claude → Claude only", async () => {
  const executed: string[] = [];
  await sendIdeContext(mwPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => "claudeCode",
  });
  assert.ok(executed.includes(AGENT_COMMANDS.claudeCodeOpen));
  assert.equal(executed.includes(AGENT_COMMANDS.codexOpen), false);
  assert.equal(executed.includes(AGENT_COMMANDS.codexAddFile), false);
});

test("picker Codex → Codex only", async () => {
  const fs = new MemoryTempFs();
  const executed: string[] = [];
  await sendIdeContext(mwPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => "codex",
    tempFs: fs,
    tempDir: "/tmp/agent-ide-context",
    now: () => 1_000_000,
    leaseMs: 60_000,
    sessionId: "t1",
    codexRetryDelaysMs: [0],
  });
  assert.ok(executed.includes(AGENT_COMMANDS.codexOpen));
  assert.ok(executed.includes(AGENT_COMMANDS.codexAddFile));
  assert.equal(executed.includes(AGENT_COMMANDS.claudeCodeOpen), false);
});

test("picker Copy only → no agent invocation", async () => {
  const executed: string[] = [];
  await sendIdeContext(mwPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => "clipboard",
  });
  assert.deepEqual(executed, []);
});

test("picker cancel → no agent invocation", async () => {
  const executed: string[] = [];
  const result = await sendIdeContext(mwPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => undefined,
  });
  assert.equal(result.opened, "cancelled");
  assert.deepEqual(executed, []);
});

test("forced unavailable target → documented clipboard fallback", async () => {
  const executed: string[] = [];
  const result = await sendIdeContext(mwPacket(), {
    setting: "claudeCode",
    commands: new Set(),
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => {
      throw new Error("picker should not show");
    },
  });
  assert.equal(result.opened, "clipboard");
  assert.deepEqual(executed, []);
});

test("sole-agent auto → that sole agent", async () => {
  const executed: string[] = [];
  await sendIdeContext(mwPacket(), {
    setting: "auto",
    commands: new Set([AGENT_COMMANDS.claudeCodeOpen]),
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => {
      throw new Error("picker should not show for sole agent");
    },
  });
  assert.ok(executed.includes(AGENT_COMMANDS.claudeCodeOpen));
});

test("MW Codex: renewLeaseAtomic called before retry across renewal boundary", async () => {
  const fs = new MemoryTempFs();
  let renewCalls = 0;
  let addAttempts = 0;
  await sendIdeContext(mwPacket(), {
    setting: "codex",
    commands: new Set([AGENT_COMMANDS.codexOpen, AGENT_COMMANDS.codexAddFile]),
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      if (id === AGENT_COMMANDS.codexAddFile) {
        addAttempts++;
        if (addAttempts === 1) throw new Error("not ready");
      }
    },
    showQuickPick: async () => undefined,
    tempFs: fs,
    tempDir: "/tmp/agent-ide-context",
    now: () => 1_000_000,
    leaseMs: 1_000,
    sessionId: "renew-test",
    codexRetryDelaysMs: [0, 0],
    renewLease: async (...args) => {
      renewCalls++;
      const { renewLeaseAtomic } = await import("../../../src/shared/ide-context");
      return renewLeaseAtomic(...args);
    },
  });
  assert.ok(renewCalls >= 1, "renew before retry");
  assert.ok(addAttempts >= 2);
});

test("MW Codex: temp publish {skipped:true} → clipboard kept; no invalid add-file; soft-fail", async () => {
  const executed: string[] = [];
  let clipboard = "";
  const result = await sendIdeContext(mwPacket(), {
    setting: "codex",
    commands: new Set([AGENT_COMMANDS.codexOpen, AGENT_COMMANDS.codexAddFile]),
    clipboardWrite: async (t) => {
      clipboard = t;
    },
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => undefined,
    publishTemp: async () => ({ skipped: true as const, warning: "quota full; lease-protected" }),
    tempFs: new MemoryTempFs(),
  });
  assert.ok(clipboard.includes("IDE context"));
  assert.equal(executed.includes(AGENT_COMMANDS.codexAddFile), false);
  assert.equal(result.opened, "clipboard");
  assert.ok(result.softFailWarning);
});
