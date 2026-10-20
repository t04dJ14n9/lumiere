import test from "node:test";
import assert from "node:assert/strict";
import { calloutsWebview } from "../../../src/plugins/callouts/webview";
import { blockRenderers } from "../../../src/plugins/livePreview/registry";
import { fixture } from "../features/fixture";

test("callout content and Edit select the source before typing replaces it", async (t) => {
  class Element extends EventTarget {
    readonly children: Element[] = [];
    readonly events: string[] = [];
    className = "";
    classList = { add() {} };
    ownerDocument = doc;
    contains(node: Element): boolean {
      return (
        node === this || this.children.some((child) => child.contains(node))
      );
    }
    closest() {
      return null;
    }
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
  class MouseEvent extends Event {
    button = 0;
    clientX = 0;
    clientY = 0;
  }
  const doc = Object.assign(new EventTarget(), {
    defaultView: new EventTarget(),
    createElement: () => new Element(),
    getSelection: () => null,
  });
  for (const [name, value] of Object.entries({
    document: doc,
    Element,
    Node: Element,
    MouseEvent,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (previous) {
        Object.defineProperty(globalThis, name, previous);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    });
  }
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
  Object.assign(f.view, {
    posAtDOM: (_node: Node, offset = 0) => offset,
    domAtPos: (offset: number) => ({ node: {}, offset }),
    focus() {},
    requestMeasure() {},
  });
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
  assert.ok(shell.events.includes("mousedown"));
  shell.dispatchEvent(new MouseEvent("mousedown"));
  const release = new MouseEvent("mouseup");
  Object.defineProperty(release, "target", { value: shell });
  doc.dispatchEvent(release);
  assert.equal(
    f.view.state.sliceDoc(
      f.view.state.selection.main.from,
      f.view.state.selection.main.to,
    ),
    source,
  );
  f.view.dispatch({ selection: { anchor: f.view.state.doc.length } });
  shell.children[0]!.dispatchEvent(new Event("click"));
  assert.equal(
    f.view.state.sliceDoc(
      f.view.state.selection.main.from,
      f.view.state.selection.main.to,
    ),
    source,
  );
  f.view.dispatch(f.view.state.replaceSelection("xyz"));
  assert.equal(f.view.state.doc.toString(), "xyz\n\nafter");
});
