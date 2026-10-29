import test from "node:test";
import assert from "node:assert/strict";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Extension, TransactionSpec } from "@codemirror/state";
import { createRoot } from "@workshop/core";
import { FEATURE_ORDER } from "../../../src/plugins/plugin-order";
import { features } from "../../../src/plugins/catalog";
import { gitBlameWebview } from "../../../src/plugins/gitBlame/webview";
import { blameGhostField } from "../../../src/plugins/gitBlame/blameWidget";
import { blameField } from "../../../src/plugins/gitBlame/state";
import { gitGutterWebview } from "../../../src/plugins/gitGutter/webview";
import { hunkField } from "../../../src/plugins/gitGutter/hunks";
import { contributedProperties } from "../../support/manifest";

const blame = {
  commit: "a".repeat(40),
  shortCommit: "aaaaaaa",
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 1700000000,
  subject: "Hello",
};

test("gitBlame is registered after gutter/inline, chrome only, and default-off", () => {
  const order: readonly string[] = FEATURE_ORDER;
  assert.ok(order.indexOf("gitBlame") > order.indexOf("gitInline"));
  assert.ok(order.indexOf("gitInline") > order.indexOf("gitGutter"));
  const manifest = features.find(({ id }) => id === "gitBlame");
  assert.ok(manifest);
  assert.equal(manifest.defaultEnabled, false);
  assert.equal(manifest.title, "Current-line authorship");
  assert.deepEqual(manifest.capabilities, ["editorChrome"]);
  assert.deepEqual(manifest.surfaces, ["host", "webview"]);
  const properties = contributedProperties<{ default: unknown }>();
  assert.equal(
    properties["lumiere.markdown.plugins.gitBlame.enabled"]?.default,
    false,
  );
  assert.equal(
    properties["markdownWorkbench.plugins.gitBlame.enabled"],
    undefined,
  );
});

function composition() {
  const root = createRoot();
  const compartment = new Compartment();
  const extensions = new Map<number, Extension>();
  let next = 0;
  let state = EditorState.create({
    doc: "# Note\n\nbody\n",
    extensions: [compartment.of([])],
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      const startState = state;
      state = state.update(spec).state;
      // Fake view: invoke updateListeners so blame's caret-move gate can unlock.
      for (const listener of state.facet(EditorView.updateListener)) {
        listener({ view, state, startState } as never);
      }
    },
  };
  root.provide("editor", {
    view,
    source: "file:///note.md",
    mode: "livePreview",
    extend(extension: Extension) {
      const id = next++;
      extensions.set(id, extension);
      view.dispatch({
        effects: compartment.reconfigure([...extensions.values()]),
      });
      return () => {
        extensions.delete(id);
        view.dispatch({
          effects: compartment.reconfigure([...extensions.values()]),
        });
      };
    },
  } as never);
  root.provide("commands", { register: () => () => {} } as never);
  root.provide("render", {} as never);
  root.provide("rpc", {
    async call(
      protocol: { id: string },
      method: string,
      params: { line?: number },
    ) {
      if (protocol.id === "gitGutter") {
        return { status: "ok", text: "# Note\n\nold\n", label: "HEAD" };
      }
      if (method === "identity") {
        return { userEmail: "ADA@example.com" };
      }
      return {
        status: "ok",
        blame: { ...blame, line: params.line },
        repoGeneration: 9,
      };
    },
    on: () => () => {},
  } as never);
  return { root, view, extensions };
}

for (const withGutter of [false, true]) {
  test(`actual webview registration paints independently of gutter (${withGutter}) and tears down cleanly`, async (t) => {
    const f = composition();
    t.after(() => f.root.dispose());
    const gutter = withGutter
      ? f.root.plugin(gitGutterWebview, { compareTo: "HEAD" })
      : undefined;
    const fiber = f.root.plugin(gitBlameWebview);
    await f.root.settled();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(fiber.state, "active");
    // Open/restored caret must not paint until a real caret move.
    assert.equal(f.view.state.field(blameField), null);
    // Column nudge unlocks the gate; controller debounces 150ms.
    f.view.dispatch({ selection: { anchor: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(f.view.state.field(blameField)?.line, 1);
    assert.match(
      f.view.state.field(blameGhostField)?.text ?? "",
      /^Hello, You \(/,
    );
    if (gutter) {
      assert.equal(gutter.state, "active");
      assert.equal(f.view.state.field(hunkField).hunks.length, 1);
      await gutter.dispose();
      assert.equal(f.view.state.field(hunkField, false), undefined);
      assert.ok(f.view.state.field(blameGhostField));
      assert.equal(fiber.state, "active");
    }
    await fiber.dispose();
    assert.equal(f.view.state.field(blameField, false), undefined);
    assert.equal(f.view.state.field(blameGhostField, false), undefined);
    assert.equal(f.extensions.size, 0);
  });
}

test("an editor update while the plugin stops does not read its stopped services", async (t) => {
  const f = composition();
  t.after(() => f.root.dispose());
  const fiber = f.root.plugin(gitBlameWebview);
  await f.root.settled();
  const stopping = fiber.dispose();
  // Another plugin's transaction can land before gitBlame's own cleanups run.
  assert.doesNotThrow(() => f.view.dispatch({ selection: { anchor: 2 } }));
  await stopping;
  assert.doesNotThrow(() => f.view.dispatch({ selection: { anchor: 3 } }));
});
