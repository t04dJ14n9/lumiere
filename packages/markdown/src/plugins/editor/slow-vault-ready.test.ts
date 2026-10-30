import test from "node:test";
import assert from "node:assert/strict";
import { fakeDocument, fakeHost } from "../../../test/support/vscode-fake";
import type { PanelShell } from "../../shared/host";
import { Endpoint } from "../../shared/rpc/endpoint";
import type { Documents, DocumentSession } from "../document/api";
import { createPanel } from "./panel";
import { protocol } from "./protocol";

const NOTE_URI = "file:///remote-ceph-workspace/notes/guide.md";
const NOTE_TEXT = "# Guide\n\nSee [[notes/other]]";

test("createPanel ready resolves promptly when panel plugins settle without a vault ready-budget wait", async () => {
  let hostReceive = (_value: unknown) => {};
  let clientReceive = (_value: unknown) => {};
  const client = new Endpoint(
    {
      send: (value) => hostReceive(value),
      listen: (receive) => {
        clientReceive = receive;
        return () => {};
      },
    },
    {
      after(ms, callback) {
        const timer = setTimeout(callback, ms);
        return () => clearTimeout(timer);
      },
    },
  );
  const shell: PanelShell = {
    id: "panel-ceph",
    column: undefined,
    document: fakeDocument({ uri: NOTE_URI, getText: () => NOTE_TEXT }),
    cspSource: "test",
    trusted: true,
    transport: {
      send: (value) => clientReceive(value),
      listen: (receive) => {
        hostReceive = receive;
        return () => {};
      },
    },
    active: () => true,
    reveal() {},
    dispose() {},
    setHTML() {},
    asset: (path) => path,
    resource: (target) => target,
    onDispose: () => () => {},
    onState: () => () => {},
  };
  const documents: Documents = {
    session: (doc) =>
      ({
        uri: doc.uri,
        text: doc.getText(),
        version: doc.version,
        attach: () => () => {},
      }) as unknown as DocumentSession,
    release() {},
  };
  const host = fakeHost({
    settings: { forNote: () => ({ preset: "obsidian", mode: "source" }) },
  });

  const panel = createPanel(shell, documents, host, {
    onClose() {},
    onState() {},
    configure(context) {
      // Mimic vaultHost after the cold-open fix: forDocument returns immediately
      // (seed + background index), so settled() is not gated on ~500 ms.
      context.plugin({
        name: "vault-ImmediateSeed",
        async apply() {
          await Promise.resolve();
        },
      });
    },
  });

  const startedAt = performance.now();
  const init = await client.call(protocol, "ready", {});
  const elapsedMs = performance.now() - startedAt;

  assert.ok(
    elapsedMs < 100,
    `expected < 100 ms, took ${Math.round(elapsedMs)} ms`,
  );
  assert.equal(init.text, NOTE_TEXT);
  assert.equal(init.source, NOTE_URI);

  await client.dispose();
  await panel.dispose();
});
