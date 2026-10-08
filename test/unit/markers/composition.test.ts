import test from "node:test";
import assert from "node:assert/strict";
import { collab } from "@codemirror/collab";
import { EditorState } from "@codemirror/state";
import { markersWebview } from "../../../src/plugins/markers/webview";
import { markerState } from "../../../src/plugins/markers/view-state";
import { fixture } from "../features/fixture";
import { features } from "../../../src/plugins/catalog";
import {
  visiblePosition,
  blockIndex,
} from "../../../src/plugins/livePreview/blocks";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { blockRenderers } from "../../../src/plugins/livePreview/registry";
import { WidgetType } from "@codemirror/view";

test("core markers compose with every feature and dispose and re-enable without retained fields", async () => {
  const f = fixture();
  const stop = f.registry.register("document", collab());
  const settings = Object.fromEntries(
    features.map((feature) => [
      feature.id,
      {
        enabled: true,
        config: (feature.config?.parse({}) ?? {}) as Record<string, unknown>,
      },
    ]),
  );
  await f.configure(settings);
  let fiber = f.root.plugin(markersWebview);
  await f.root.settled();
  assert.equal(fiber.state, "active", String(fiber.error));
  assert.deepEqual(f.view.state.field(markerState), []);
  const owners = f.registry.ordered().map((entry) => entry.owner);
  await fiber.dispose();
  assert.equal(f.view.state.field(markerState, false), undefined);
  assert.ok(!f.registry.ordered().some((entry) => entry.owner === "markers"));
  fiber = f.root.plugin(markersWebview);
  await f.root.settled();
  assert.equal(fiber.state, "active");
  assert.deepEqual(
    f.registry.ordered().map((entry) => entry.owner),
    owners,
  );
  await f.root.dispose();
  await stop();
});
test("marker placement moves out of replaced blocks and follows source reveal", () => {
  class Empty extends WidgetType {
    toDOM(): HTMLElement {
      throw new Error("not mounted in this unit");
    }
  }
  const doc = "```js\nx\n```\n\nbody";
  let state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [
      documentTree,
      blockIndex,
      blockRenderers.of({
        kind: "code",
        editing: "reveal",
        match: (node) => node.name === "FencedCode",
        widget: () => new Empty(),
      }),
    ],
  });
  assert.deepEqual(visiblePosition(state, 6), { position: 11, block: true });
  state = state.update({ selection: { anchor: 6 } }).state;
  assert.deepEqual(visiblePosition(state, 6), { position: 6, block: false });
});
