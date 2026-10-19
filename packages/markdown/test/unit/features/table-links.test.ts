import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import { cellKeymap } from "../../../src/plugins/tables/cell-editor";
import { fixture } from "./fixture";
import type { LinksService } from "../../../src/plugins/links/api";

test("Mod-Enter follows the active cell's link through Links; the outer focus guard ignores cell focus", async () => {
  const f = fixture();
  await f.configure({ links: { enabled: true, config: {} } });
  let links: LinksService | undefined;
  f.root.plugin({
    name: "cell-link-test",
    inject: { required: ["links"] },
    apply(ctx) {
      links = ctx.links;
    },
  });
  await f.root.settled();
  assert.ok(links);
  const opened: { href: string; wiki: boolean }[] = [];
  f.root.on("link/click", (request) => {
    opened.push(request);
    return true;
  });
  const outerContent = {};
  const cellContent = {};
  const ownerDocument = { activeElement: cellContent };
  Object.assign(f.view, {
    contentDOM: outerContent,
    dom: { ownerDocument },
    composing: false,
  });
  f.view.dispatch({
    changes: { from: 0, to: f.view.state.doc.length, insert: "[[Outer]]" },
    selection: { anchor: 4 },
  });
  const state = EditorState.create({
    doc: "[[Cell#Heading|label]]",
    selection: { anchor: 6 },
    extensions: cellKeymap({
      environment: { links },
    } as Parameters<typeof cellKeymap>[0]),
  });
  const cell = {
    state,
    contentDOM: cellContent,
    dom: { ownerDocument },
    composing: false,
  } as unknown as EditorView;
  const binding = (view: EditorView) =>
    view.state
      .facet(keymap)
      .flat()
      .find((binding) => binding.key === "Mod-Enter")!;
  assert.equal(binding(f.view).run!(f.view), false);
  assert.equal(binding(cell).run!(cell), true);
  assert.deepEqual(opened, [
    { href: "Cell#Heading", wiki: true, side: false, tab: false },
  ]);
  ownerDocument.activeElement = outerContent;
  assert.equal(binding(f.view).run!(f.view), true);
  assert.equal(opened.at(-1)?.href, "Outer");
  await f.root.dispose();
});

test("cells without the optional Links service leave Mod-Enter unhandled", () => {
  const state = EditorState.create({
    extensions: cellKeymap({ environment: {} } as Parameters<
      typeof cellKeymap
    >[0]),
  });
  const binding = state
    .facet(keymap)
    .flat()
    .find((binding) => binding.key === "Mod-Enter")!;
  assert.equal(binding.run!({ state } as EditorView), false);
});
