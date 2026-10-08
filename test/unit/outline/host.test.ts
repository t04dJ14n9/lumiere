import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { outlineHost } from "../../../src/plugins/outline/host";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import { fakeDocument } from "../../support/vscode-fake";
import {
  fakeViews,
  memoryVaults,
  render,
  uriOf,
  wait,
  workbenchWith,
} from "../views/fakes";

// VS Code reports no change of active editor for an editor that opens already
// active, so the view must also refresh when an editor opens.
test("the Note Outline shows the headings of the first editor opened", async () => {
  const fake = fakeViews();
  const { vaults } = memoryVaults({ "A.md": "# Title\n\n## Part\n" });
  let active: EditorPanel | undefined = undefined;
  const editors: Editors = {
    all: () => (active ? [active] : []),
    active: () => active,
    capture: async () => {
      throw new Error("unused");
    },
    restore: async () => {},
  };
  const root = Context.create();
  root.provide("workbench", workbenchWith(fake.views));
  root.provide("vaults", vaults);
  root.provide("editors", editors);
  root.plugin(outlineHost);
  await root.settled();
  await wait(350);
  const view = fake.trees.get("markdownWorkbench.outline")!;
  assert.equal(view.message, "No headings.");

  active = {
    id: "panel",
    document: fakeDocument({ uri: uriOf("A.md") }),
  } as EditorPanel;
  root.emit("editor/opened", active);
  await wait(350);
  assert.equal(view.message, undefined);
  assert.deepEqual(await render(view.source), [["Title", ["Part"]]]);
  await root.dispose();
});
