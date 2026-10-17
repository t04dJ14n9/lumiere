import assert from "node:assert/strict";
import test from "node:test";
import {
  ticketList,
  ticketsPlugin,
  todoMarkers,
  type VSCode,
} from "../../fixtures/sample-plugin/src/plugin";
import { protocol as codeBlocks } from "../../../src/plugins/codeBlocks/protocol";
import { fixture, uri } from "./fixture";

test("the sample marks every TODO in source offsets that count CR characters", () => {
  const markers = todoMarkers("TODO one\r\ntwo TODO\r\nTODOS", 7);
  assert.deepEqual(
    markers.map((marker) => [marker.from, marker.to, marker.documentVersion]),
    [
      [0, 4, 7],
      [14, 18, 7],
    ],
  );
  assert.equal(markers[1]?.tooltip, "TODO on line 2. Click for details.");
  assert.equal(markers[1]?.actionId, "describe");
});

test("the sample renders tickets blocks as ticket links", () => {
  assert.deepEqual(ticketList("42\n  7 \nnot a number"), {
    markdown: "- [Ticket 42](ticket:42)\n- [Ticket 7](ticket:7)",
  });
  assert.deepEqual(ticketList(""), { markdown: "*No tickets.*" });
});

function fakeVsCode(text: string) {
  const opened: string[] = [];
  const messages: string[] = [];
  const code = {
    Uri: { parse: (value: string) => uri(value) },
    env: {
      openExternal: async (target: { toString(): string }) => {
        opened.push(target.toString());
        return true;
      },
    },
    window: {
      showInformationMessage: async (message: string) => {
        messages.push(message);
        return undefined;
      },
    },
    workspace: {
      openTextDocument: async () => ({ getText: () => text, version: 1 }),
      onDidChangeTextDocument: () => ({ dispose() {} }),
      getConfiguration: () => ({
        get: (_key: string, fallback: string) =>
          fallback === "" ? "https://tickets.example/" : fallback,
      }),
    },
  } as unknown as VSCode;
  return { code, opened, messages };
}

test("the sample runs through the real API: markers, link claim, processor and command", async () => {
  const f = await fixture();
  f.platform.installed = (id) => id === "mwsample.tickets";
  const fake = fakeVsCode(f.panel.document.getText());
  const handle = f.api.plugin(ticketsPlugin(fake.code));
  await handle.settled();
  assert.equal(handle.state.state, "active");
  assert.ok(
    f.api.getPluginCatalog().some((entry) => entry.id === "mwsample.tickets"),
  );

  assert.equal(
    await f.root.bail("links/open", {
      href: "ticket:42",
      source: f.panel.document.uri,
      editorId: "panel",
      wiki: false,
      side: false,
    }),
    true,
  );
  assert.deepEqual(fake.opened, ["https://tickets.example/42"]);
  assert.equal(
    f.root.bail("links/open", {
      href: "https://example.com",
      source: f.panel.document.uri,
      editorId: "panel",
      wiki: false,
      side: false,
    }),
    undefined,
  );

  const { epoch, revision } = await f.pair.client.call(
    codeBlocks,
    "current",
    {},
  );
  assert.deepEqual(
    await f.pair.client.call(codeBlocks, "render", {
      language: "tickets",
      source: "42",
      uri: f.panel.document.uri,
      sourceLine: 0,
      epoch,
      revision,
    }),
    { markdown: "- [Ticket 42](ticket:42)" },
  );
  assert.ok(f.commands.has("mwsample.tickets.refresh"));
  await f.commands.get("mwsample.tickets.refresh")?.();

  handle.dispose();
  await handle.settled();
  assert.equal(f.commands.has("mwsample.tickets.refresh"), false);
  await f.dispose();
});
