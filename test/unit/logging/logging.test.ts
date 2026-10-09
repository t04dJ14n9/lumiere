import test from "node:test";
import assert from "node:assert/strict";
import type { Plugin } from "../../../src/kernel";
import { logText } from "../../../src/shared/logging";
import { outputLogger } from "../../../src/host/logging";
import { readSettings } from "../../../src/host/settings";
import {
  registerPanelLogging,
  webviewLogging,
} from "../../../src/plugins/editor/logging";
import { createPanel } from "../../../src/plugins/editor/panel";
import { protocol } from "../../../src/plugins/editor/protocol";
import type { Documents } from "../../../src/plugins/document/api";
import type { PanelShell } from "../../../src/shared/runtime";
import { Context } from "../../../src/kernel";
import { rpcPair } from "../../support/rpc-pair";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";

function recordingChannel() {
  const lines: string[] = [];
  return {
    lines,
    channel: {
      info: (line: string) => lines.push(`info ${line}`),
      warn: (line: string) => lines.push(`warn ${line}`),
      error: (line: string) => lines.push(`error ${line}`),
    },
  };
}

function recordingLogger() {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      debug: (message: string) => lines.push(`debug ${message}`),
      warn: (message: string) => lines.push(`warn ${message}`),
      error: (message: string) => lines.push(`error ${message}`),
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("log details become bounded text", () => {
  assert.equal(logText("plain"), "plain");
  assert.equal(logText(new TypeError("bad")), "TypeError: bad");
  assert.equal(logText({ ms: 3 }), '{"ms":3}');
  assert.equal(logText(undefined), "");
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(logText(circular), "[Unserializable log detail]");
  assert.equal(logText("x".repeat(9000)).length, 8000);
});

test("the output channel shows warnings and errors, and debug only when enabled", () => {
  const { channel, lines } = recordingChannel();
  let debug = false;
  const logger = outputLogger(channel, () => debug);
  logger.warn("slow", { ms: 12 });
  logger.error("failed", new Error("boom"));
  logger.debug("Loaded", { ms: 1 });
  debug = true;
  logger.debug("Loaded", { ms: 2 });
  assert.deepEqual(lines, [
    'warn slow {"ms":12}',
    "error failed Error: boom",
    'info [debug] Loaded {"ms":2}',
  ]);
});

test("the debug.logging setting is read with a default of false", () => {
  const read = (values: Record<string, unknown>) =>
    readSettings({
      get: <T>(key: string, fallback?: T) =>
        (key in values ? values[key] : fallback) as T | undefined,
    }).debugLogging;
  assert.equal(read({}), false);
  assert.equal(read({ "debug.logging": true }), true);
});

test("the webview forwards warnings always and debug only when configured", () => {
  const sent: string[] = [];
  const logging = webviewLogging((record) =>
    sent.push(`${record.level} ${record.message} ${record.details}`),
  );
  logging.logger.debug("hidden");
  logging.logger.warn("visible", { a: 1 });
  logging.logger.error("broken", new Error("x"));
  logging.configure(true);
  logging.logger.debug("shown");
  logging.configure(false);
  logging.logger.debug("hidden again");
  assert.deepEqual(sent, [
    'warn visible {"a":1}',
    "error broken Error: x",
    "debug shown ",
  ]);
});

test("a webview logger survives a transport that cannot send", () => {
  const logging = webviewLogging(() => {
    throw new Error("disposed");
  });
  assert.doesNotThrow(() => logging.logger.error("lost"));
});

test("the host writes forwarded webview logs and re-checks the debug policy", async () => {
  const pair = rpcPair();
  const { logger, lines } = recordingLogger();
  const context = Context.create({ logger });
  let debug = false;
  registerPanelLogging(context, pair.host, () => debug);
  const send = (level: "debug" | "warn" | "error", message: string) =>
    pair.client.notify(protocol, "log", { level, message, details: "" });
  send("warn", "render failed");
  // A webview that claims debug is on cannot flood the channel by itself.
  send("debug", "ignored");
  debug = true;
  send("debug", "accepted");
  await settle();
  assert.deepEqual(lines, [
    "warn [root] [webview] render failed",
    "debug [root] [webview] accepted",
  ]);
  await context.dispose();
  await pair.dispose();
});

test("panel kernels log through the window logger, tagged by panel", async () => {
  const { logger, lines } = recordingLogger();
  const failing: Plugin = {
    name: "failing",
    apply() {
      throw new Error("boom");
    },
  };
  const shell: PanelShell = {
    id: "panel-7",
    column: undefined,
    document: fakeDocument(),
    cspSource: "test",
    trusted: false,
    transport: { send() {}, listen: () => () => {} },
    active: () => true,
    reveal() {},
    dispose() {},
    setHTML() {},
    asset: (path) => path,
    resource: (uri) => uri,
    onDispose: () => () => {},
    onState: () => () => {},
  };
  const documents = {
    session: () => ({}),
    release() {},
  } as unknown as Documents;
  let owned: Context | undefined;
  const panel = createPanel(shell, documents, fakeWorkbench(), {
    onClose() {},
    onState() {},
    configure(context) {
      owned = context;
      context.plugin(failing);
    },
    logger,
  });
  await owned?.settled();
  assert.ok(
    lines.some((line) =>
      line.startsWith("error [panel-7] [failing] Plugin failed"),
    ),
    lines.join("\n"),
  );
  assert.ok(panel.id === "panel-7");
  await owned?.dispose();
});
