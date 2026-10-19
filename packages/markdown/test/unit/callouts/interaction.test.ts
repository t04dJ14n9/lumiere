import test from "node:test";
import assert from "node:assert/strict";
import { calloutsWebview } from "../../../src/plugins/callouts/webview";
import { blockRenderers } from "../../../src/plugins/livePreview/registry";
import { fixture } from "../features/fixture";

test("callout content has no click-to-edit listener, while Edit still reveals the source", async (t) => {
  class Element extends EventTarget {
    readonly children: Element[] = [];
    readonly events: string[] = [];
    className = "";
    classList = { add() {} };
    append(...children: Element[]) {
      this.children.push(...children);
    }
    setAttribute() {}
    override addEventListener(
      ...args: Parameters<EventTarget["addEventListener"]>
    ) {
      this.events.push(args[0]);
      super.addEventListener(...args);
    }
  }
  const doc = Object.assign(new EventTarget(), {
    defaultView: new EventTarget(),
    createElement: () => new Element(),
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    value: doc,
    configurable: true,
  });
  t.after(() => {
    if (previous) {
      Object.defineProperty(globalThis, "document", previous);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
  });
  const f = fixture();
  t.after(() => f.root.dispose());
  f.root.plugin(calloutsWebview);
  await f.root.settled();
  const source = "> [!warning]- Folded\n> Body";
  f.view.dispatch({
    changes: {
      from: 0,
      to: f.view.state.doc.length,
      insert: `${source}\n\nafter`,
    },
    selection: { anchor: source.length + 2 },
  });
  Object.assign(f.view.dom, { ownerDocument: doc });
  Object.assign(f.view, { posAtDOM: () => 0, focus() {}, requestMeasure() {} });
  const renderer = f.view.state
    .facet(blockRenderers)
    .find((item) => item.kind === "callout");
  assert.ok(renderer);
  const widget = renderer.widget({
    from: 0,
    to: source.length,
    source,
    kind: "callout",
  });
  const shell = widget.toDOM(f.view) as unknown as Element;
  t.after(() => widget.destroy(shell as unknown as HTMLElement));
  assert.ok(
    !shell.events.includes("mousedown"),
    "title, body and padding cannot arm source editing",
  );
  const selection = f.view.state.selection;
  shell.dispatchEvent(new Event("click"));
  assert.ok(f.view.state.selection.eq(selection));
  shell.children[0]!.dispatchEvent(new Event("click"));
  assert.equal(
    f.view.state.sliceDoc(
      f.view.state.selection.main.from,
      f.view.state.selection.main.to,
    ),
    source,
  );
});
