import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { sketchFromSvg, sketchToSvg } from "@workshop/ink/format";
import { sketchHost } from "../../../src/plugins/sketch/host";
import { CAN_DRAW } from "../../../src/plugins/sketch/manifest";
import { protocol } from "../../../src/plugins/sketch/protocol";
import type {
  EditorPanel,
  ViewSnapshot,
} from "../../../src/plugins/editor/api";
import { provideHostServices, type TextEdit } from "../../../src/shared/host";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";
import { rpcPair } from "../../support/rpc-pair";
import { drawing, fakeInk, memoryFiles, uriOf, vaultOf } from "./support";

const SKETCH = "Attachments/2026-10-22 14.03.sketch.svg";

function start(ink: ReturnType<typeof fakeInk>["ink"]) {
  const pair = rpcPair();
  const disk = memoryFiles({ [uriOf(SKETCH)]: sketchToSvg(drawing([])) });
  const contexts = new Map<string, unknown>();
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const applied: TextEdit[][] = [];
  const document = fakeDocument({
    uri: uriOf("Plan.md"),
    getText: () => "Plan",
  });
  const panel = {
    id: "p1",
    document,
    rpc: pair.host,
  } as unknown as EditorPanel;
  const root = createRoot();
  provideHostServices(
    root,
    fakeHost({
      hostCommands: {
        register: (id, run) => {
          commands.set(id, run);
          return () => {
            commands.delete(id);
          };
        },
        execute: async (id, key, value) => {
          if (id === "setContext") {
            contexts.set(String(key), value);
          }
        },
      },
      hostDocuments: {
        apply: async (_document, edits) => {
          applied.push([...edits]);
          return true;
        },
      },
      workspace: { files: { ...memoryFiles().api, ...disk.api } as never },
      settings: {
        forNote: () => ({
          features: {
            links: {
              enabled: true,
              config: { attachmentFolder: "Attachments", useWikilinks: true },
            },
          },
        }),
      } as never,
    }),
  );
  root.provide("ink", ink);
  root.provide("vaults", vaultOf(["Plan.md", SKETCH]).vaults as never);
  root.provide("editors", {
    all: () => [panel],
    active: () => panel,
    capture: async () => ({ state: { head: 4 } }) as unknown as ViewSnapshot,
    restore: async () => {},
  });
  return { pair, disk, contexts, commands, applied, root };
}

test("where it can draw, the host shows Insert Sketch and answers each note's page", async () => {
  const { ink, requests } = fakeInk(drawing(), undefined);
  const { pair, disk, contexts, commands, applied, root } = start(ink);
  let told = false;
  pair.client.on(protocol, "ready", () => {
    told = true;
  });

  root.plugin(sketchHost);
  await root.settled();

  assert.equal(contexts.get(CAN_DRAW), true);
  assert.equal(told, true, "a page opened first is told it can draw");
  assert.equal(await pair.client.call(protocol, "available", {}), true);

  assert.equal(
    await pair.client.call(protocol, "edit", {
      target: "2026-10-22 14.03.sketch.svg",
      syntax: "wikilink",
    }),
    true,
  );
  assert.equal(sketchFromSvg(disk.files.get(uriOf(SKETCH))!).strokes.length, 1);

  await commands.get("lumiere.markdown.insertSketch")!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests.length, 2);
  assert.deepEqual(applied, [], "cancelled: the note is unchanged");

  await root.dispose();
  assert.equal(contexts.get(CAN_DRAW), false);
  assert.equal(commands.size, 0);
  await assert.rejects(pair.client.call(protocol, "available", {}), {
    code: "PluginDisabled",
  });
  await pair.dispose();
});

test("without a canvas the host half waits: no menu item, no command, no answers", async () => {
  const { pair, contexts, commands } = start(fakeInk().ink);
  const root = createRoot();
  const panel = { id: "p1", rpc: pair.host } as unknown as EditorPanel;
  provideHostServices(
    root,
    fakeHost({
      hostCommands: {
        register: (id, run) => {
          commands.set(id, run);
          return () => {
            commands.delete(id);
          };
        },
        execute: async (id, key, value) => {
          contexts.set(String(key), value);
        },
      },
    }),
  );
  root.provide("vaults", vaultOf([]).vaults as never);
  root.provide("editors", {
    all: () => [panel],
    active: () => panel,
    capture: async () => ({}) as ViewSnapshot,
    restore: async () => {},
  });

  root.plugin(sketchHost);
  await root.settled();

  assert.equal(contexts.has(CAN_DRAW), false);
  assert.equal(commands.size, 0);
  await assert.rejects(pair.client.call(protocol, "available", {}), {
    code: "PluginDisabled",
  });
  await root.dispose();
  await pair.dispose();
});
