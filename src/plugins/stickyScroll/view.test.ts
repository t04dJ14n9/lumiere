import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { headingIndex } from "./model";
import { StickyScrollView, stickyMaxLines } from "./view";

class Element {
  className = "";
  textContent = "";
  title = "";
  type = "";
  hidden = false;
  removed = false;
  children: Element[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, (event?: unknown) => void>();
  style = {
    top: "",
    left: "",
    width: "",
    values: new Map<string, string>(),
    setProperty(key: string, value: string) {
      this.values.set(key, value);
    },
  };
  constructor(readonly ownerDocument: { createElement(): Element }) {}
  append(element: Element) {
    this.children.push(element);
  }
  replaceChildren(...elements: Element[]) {
    this.children = elements;
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  addEventListener(event: string, listener: (event?: unknown) => void) {
    this.listeners.set(event, listener);
  }
  remove() {
    this.removed = true;
  }
}

function fixture() {
  const document = { createElement: (): Element => new Element(document) };
  const dom = document.createElement();
  const pending = new Map<
    object,
    {
      read(): unknown;
      write(value: unknown): void;
    }
  >();
  const source =
    "# Root\n\nroot body\n## <script>Child</script>\n\nchild body\n# Next\n\nnext body";
  const wheel: number[][] = [];
  const view = {
    state: EditorState.create({
      doc: source,
      extensions: [headingIndex, stickyMaxLines.of(5)],
    }),
    dom: Object.assign(dom, {
      getBoundingClientRect: () => ({ top: 10, left: 5 }),
    }),
    scrollDOM: {
      getBoundingClientRect: () => ({ top: 42, left: 5, right: 805 }),
      clientTop: 0,
      clientWidth: 800,
      clientHeight: 600,
      scrollBy: (x: number, y: number) => wheel.push([x, y]),
    },
    contentDOM: {
      getBoundingClientRect: () => ({ left: 70, right: 770 }),
    },
    defaultLineHeight: 24,
    documentTop: 42,
    visibleFrom: 0,
    lineBlockAtHeight() {
      return { from: view.visibleFrom };
    },
    requestMeasure(request: {
      key: object;
      read(): unknown;
      write(value: unknown): void;
    }) {
      pending.set(request.key, request);
    },
  };
  const jumps: number[] = [];
  const chrome = new StickyScrollView(
    view as unknown as EditorView,
    (position) => jumps.push(position),
  );
  const flush = () => {
    const requests = [...pending.values()];
    pending.clear();
    for (const request of requests) {
      request.write(request.read());
    }
  };
  const scrollTo = (text: string) => {
    view.visibleFrom = view.state.doc.toString().indexOf(text);
    chrome.schedule();
    flush();
  };
  return { view, chrome, dom: dom.children[0]!, jumps, flush, scrollTo, wheel };
}

test("overlay is empty at the top, pins ancestors while scrolling and replaces the next section", () => {
  const f = fixture();
  f.flush();
  assert.equal(f.dom.hidden, true);
  f.scrollTo("root body");
  assert.equal(f.dom.hidden, false);
  assert.deepEqual(
    f.dom.children.map((button) => button.textContent),
    ["Root"],
  );
  const root = f.dom.children[0];
  f.scrollTo("root body");
  assert.equal(
    f.dom.children[0],
    root,
    "ordinary scroll preserves keyboard focus",
  );
  f.scrollTo("child body");
  assert.deepEqual(
    f.dom.children.map((button) => button.textContent),
    ["Root", "Child"],
  );
  assert.equal(f.chrome.height, 48);
  assert.equal(f.dom.style.top, "32px", "find panels remain above the overlay");
  assert.equal(f.dom.style.width, "800px");
  assert.equal(f.dom.style.values.get("--sticky-inset"), "65px");
  f.scrollTo("# Next");
  assert.equal(f.dom.hidden, true);
  f.scrollTo("next body");
  assert.deepEqual(
    f.dom.children.map((button) => button.textContent),
    ["Next"],
  );
});

test("plain heading buttons navigate and the row budget adapts to a small pane", () => {
  const f = fixture();
  f.scrollTo("child body");
  const button = f.dom.children[1]!;
  assert.equal(button.type, "button");
  button.listeners.get("click")!();
  assert.deepEqual(f.jumps, [f.view.state.doc.toString().indexOf("##")]);
  f.view.scrollDOM.clientHeight = 100;
  f.chrome.schedule();
  f.flush();
  assert.deepEqual(
    f.dom.children.map((button) => button.textContent),
    ["Child"],
  );
  assert.equal(f.chrome.height, 24);
});

test("document changes hide stale buttons until measurement and teardown cancels pending reads", () => {
  const f = fixture();
  f.scrollTo("child body");
  f.view.state = f.view.state.update({
    changes: {
      from: 0,
      to: f.view.state.doc.length,
      insert: "plain",
    },
  }).state;
  f.chrome.update({ docChanged: true } as ViewUpdate);
  assert.equal(f.dom.hidden, true);
  assert.equal(f.chrome.height, 0);
  f.chrome.destroy();
  // Disposal removes the state field before an already queued measurement runs.
  f.view.state = EditorState.create({ doc: "plain" });
  assert.doesNotThrow(f.flush);
  assert.equal(f.dom.removed, true);
});

test("wheel input over pinned rows scrolls the note with pixel, line and page units", () => {
  const f = fixture();
  f.scrollTo("root body");
  let prevented = 0;
  const event = {
    deltaX: 1,
    deltaY: 2,
    deltaMode: 0,
    ctrlKey: false,
    preventDefault: () => prevented++,
  };
  for (const deltaMode of [0, 1, 2]) {
    f.dom.listeners.get("wheel")!({ ...event, deltaMode });
  }
  assert.deepEqual(f.wheel, [
    [1, 2],
    [24, 48],
    [600, 1200],
  ]);
  f.dom.listeners.get("wheel")!({ ...event, ctrlKey: true });
  assert.equal(prevented, 3, "Ctrl+wheel keeps the browser's zoom gesture");
  assert.equal(f.wheel.length, 3);
});
