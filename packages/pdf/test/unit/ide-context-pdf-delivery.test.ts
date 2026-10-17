import test from "node:test";
import assert from "node:assert/strict";
import { sendIdeContext } from "../../src/extension/plugins/ideContext/delivery";
import {
  DEFAULT_CAPS,
  type IdeContextPacket,
} from "@workshop/agents/ide-context";
import { MemoryTempFs } from "@workshop/agents/testing";
import { AGENT_COMMANDS } from "../../src/shared/agent-target";

function pdfPacket(): IdeContextPacket {
  return {
    version: 1,
    collectedAt: "2026-10-16T00:00:00.000Z",
    product: "pdfWorkshop",
    pdf: { uri: "file:///a.pdf", selection: { kind: "none" } },
    active: { uri: "file:///a.pdf" },
    tabs: { visible: [], open: [], truncated: false },
    diagnostics: { uri: "file:///a.pdf", items: [], truncated: false },
    warnings: [],
    caps: DEFAULT_CAPS,
  };
}

const both = new Set([
  AGENT_COMMANDS.claudeCodeOpen,
  AGENT_COMMANDS.codexOpen,
  AGENT_COMMANDS.codexAddFile,
]);

test("PDF both agents → picker (never silent open)", async () => {
  let picker = false;
  const executed: string[] = [];
  await sendIdeContext(pdfPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => {
      picker = true;
      return "clipboard";
    },
  });
  assert.equal(picker, true);
  assert.deepEqual(executed, []);
});

test("PDF picker Claude → Claude only", async () => {
  const executed: string[] = [];
  await sendIdeContext(pdfPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => "claudeCode",
  });
  assert.ok(executed.includes(AGENT_COMMANDS.claudeCodeOpen));
  assert.equal(executed.includes(AGENT_COMMANDS.codexAddFile), false);
});

test("PDF picker Codex → Codex only", async () => {
  const executed: string[] = [];
  await sendIdeContext(pdfPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => "codex",
    tempFs: new MemoryTempFs(),
    tempDir: "/tmp/agent-ide-context",
    now: () => 1_000_000,
    sessionId: "pdf1",
    codexRetryDelaysMs: [0],
  });
  assert.ok(executed.includes(AGENT_COMMANDS.codexAddFile));
  assert.equal(executed.includes(AGENT_COMMANDS.claudeCodeOpen), false);
});

test("PDF picker Copy only → no agent invocation", async () => {
  const executed: string[] = [];
  await sendIdeContext(pdfPacket(), {
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

test("PDF picker cancel → no agent invocation", async () => {
  const executed: string[] = [];
  const r = await sendIdeContext(pdfPacket(), {
    setting: "auto",
    commands: both,
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => undefined,
  });
  assert.equal(r.opened, "cancelled");
  assert.deepEqual(executed, []);
});

test("PDF forced unavailable target → clipboard fallback", async () => {
  const executed: string[] = [];
  const r = await sendIdeContext(pdfPacket(), {
    setting: "codex",
    commands: new Set(),
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => {
      throw new Error("no");
    },
  });
  assert.equal(r.opened, "clipboard");
  assert.deepEqual(executed, []);
});

test("PDF sole-agent auto → that sole agent", async () => {
  const executed: string[] = [];
  await sendIdeContext(pdfPacket(), {
    setting: "auto",
    commands: new Set([AGENT_COMMANDS.claudeCodeOpen]),
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => {
      throw new Error("no picker");
    },
  });
  assert.ok(executed.includes(AGENT_COMMANDS.claudeCodeOpen));
});

test("PDF Codex: renewLeaseAtomic called before retry across renewal boundary", async () => {
  let renewCalls = 0;
  let addAttempts = 0;
  await sendIdeContext(pdfPacket(), {
    setting: "codex",
    commands: new Set([AGENT_COMMANDS.codexOpen, AGENT_COMMANDS.codexAddFile]),
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      if (id === AGENT_COMMANDS.codexAddFile) {
        addAttempts++;
        if (addAttempts === 1) {
          throw new Error("retry");
        }
      }
    },
    showQuickPick: async () => undefined,
    tempFs: new MemoryTempFs(),
    tempDir: "/tmp/agent-ide-context",
    now: () => 1_000_000,
    leaseMs: 1000,
    sessionId: "pdf-renew",
    codexRetryDelaysMs: [0, 0],
    renewLease: async (...args) => {
      renewCalls++;
      const { renewLeaseAtomic } = await import("@workshop/agents/ide-context");
      return renewLeaseAtomic(...args);
    },
  });
  assert.ok(renewCalls >= 1);
  assert.ok(addAttempts >= 2);
});

test("PDF Codex: on retry renew is after open prep and immediately before add-file", async () => {
  const events: string[] = [];
  let addAttempts = 0;
  await sendIdeContext(pdfPacket(), {
    setting: "codex",
    commands: new Set([AGENT_COMMANDS.codexOpen, AGENT_COMMANDS.codexAddFile]),
    clipboardWrite: async () => {},
    executeCommand: async (id) => {
      if (id === AGENT_COMMANDS.codexOpen) {
        events.push("open");
      }
      if (id === AGENT_COMMANDS.codexAddFile) {
        events.push("addFile");
        addAttempts++;
        if (addAttempts === 1) {
          throw new Error("retry");
        }
      }
    },
    showQuickPick: async () => undefined,
    tempFs: new MemoryTempFs(),
    tempDir: "/tmp/agent-ide-context",
    now: () => 1_000_000,
    leaseMs: 1000,
    sessionId: "pdf-renew-order",
    codexRetryDelaysMs: [0, 5],
    renewLease: async (...args) => {
      events.push("renew");
      const { renewLeaseAtomic } = await import("@workshop/agents/ide-context");
      return renewLeaseAtomic(...args);
    },
  });
  assert.deepEqual(events, ["open", "addFile", "open", "renew", "addFile"]);
  const renewIdx = events.indexOf("renew");
  assert.equal(events[renewIdx - 1], "open", "renew after open prep on retry");
  assert.equal(
    events[renewIdx + 1],
    "addFile",
    "renew immediately before add-file",
  );
});

test("PDF Codex: temp publish {skipped:true} → clipboard kept; no invalid add-file; soft-fail", async () => {
  const executed: string[] = [];
  let clipboard = "";
  const r = await sendIdeContext(pdfPacket(), {
    setting: "codex",
    commands: new Set([AGENT_COMMANDS.codexOpen, AGENT_COMMANDS.codexAddFile]),
    clipboardWrite: async (t) => {
      clipboard = t;
    },
    executeCommand: async (id) => {
      executed.push(id);
    },
    showQuickPick: async () => undefined,
    publishTemp: async () => ({
      skipped: true as const,
      warning: "quota full; lease-protected",
    }),
    tempFs: new MemoryTempFs(),
  });
  assert.ok(clipboard.includes("IDE context"));
  assert.equal(executed.includes(AGENT_COMMANDS.codexAddFile), false);
  assert.equal(r.opened, "clipboard");
  assert.ok(r.softFailWarning);
});

test("Codex attaches Windows temp paths as file URI strings", async () => {
  let attached: unknown;
  await sendIdeContext(pdfPacket(), {
    setting: "codex",
    commands: new Set([AGENT_COMMANDS.codexOpen, AGENT_COMMANDS.codexAddFile]),
    clipboardWrite: async () => {},
    showQuickPick: async () => undefined,
    executeCommand: async (id, ...args) => {
      if (id === AGENT_COMMANDS.codexAddFile) {
        attached = args[0];
      }
    },
    tempFs: new MemoryTempFs(),
    publishTemp: async () => ({
      finalPath:
        "C:\\Users\\test\\AppData\\Local\\Temp\\agent-ide-context\\ide-context-x.json",
    }),
  });
  assert.equal(
    attached,
    "file:///C:/Users/test/AppData/Local/Temp/agent-ide-context/ide-context-x.json",
  );
});
