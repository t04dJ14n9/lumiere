import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Compartment, EditorState } from "@codemirror/state";
import type { Extension, TransactionSpec } from "@codemirror/state";
import { Context } from "../../../src/kernel";
import { FEATURE_ORDER } from "../../../src/plugins/plugin-order";
import { features } from "../../../src/plugins/catalog";
import { gitBlameWebview } from "../../../src/plugins/gitBlame/webview";
import { blameDecorations } from "../../../src/plugins/gitBlame/blameWidget";
import { blameField } from "../../../src/plugins/gitBlame/state";
import { gitGutterWebview } from "../../../src/plugins/gitGutter/webview";
import { hunkField } from "../../../src/plugins/gitGutter/hunks";

const blame = {
  commit: "a".repeat(40),
  shortCommit: "aaaaaaa",
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 1700000000,
  subject: "Hello",
};

test("gitBlame is registered after gutter/inline, chrome only, and default-on", () => {
  const order: readonly string[] = FEATURE_ORDER;
  assert.ok(order.indexOf("gitBlame") > order.indexOf("gitInline"));
  assert.ok(order.indexOf("gitInline") > order.indexOf("gitGutter"));
  const manifest = features.find(({ id }) => id === "gitBlame");
  assert.ok(manifest);
  assert.equal(manifest.defaultEnabled, true);
  assert.equal(manifest.title, "Current-line authorship");
  assert.deepEqual(manifest.capabilities, ["editorChrome"]);
  assert.deepEqual(manifest.surfaces, ["host", "webview"]);
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const properties = pkg.contributes.configuration.properties;
  assert.equal(
    properties["markdownWorkshop.plugins.gitBlame.enabled"].default,
    true,
  );
  assert.equal(
    properties["markdownWorkbench.plugins.gitBlame.enabled"],
    undefined,
  );
});

function composition() {
  const root = Context.create();
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
      state = state.update(spec).state;
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
    assert.equal(f.view.state.field(blameField)?.line, 1);
    const decorations = f.view.state.field(blameDecorations);
    assert.equal(decorations.size, 1);
    assert.match(decorations.iter().value?.spec.widget.text, /^You,/);
    if (gutter) {
      assert.equal(gutter.state, "active");
      assert.equal(f.view.state.field(hunkField).hunks.length, 1);
      await gutter.dispose();
      assert.equal(f.view.state.field(hunkField, false), undefined);
      assert.equal(f.view.state.field(blameDecorations).size, 1);
      assert.equal(fiber.state, "active");
    }
    await fiber.dispose();
    assert.equal(f.view.state.field(blameField, false), undefined);
    assert.equal(f.view.state.field(blameDecorations, false), undefined);
    assert.equal(f.extensions.size, 0);
  });
}
