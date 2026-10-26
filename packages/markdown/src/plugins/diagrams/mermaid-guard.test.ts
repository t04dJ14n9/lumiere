import test from "node:test";
import assert from "node:assert/strict";
import {
  mermaidInternalLinkTarget,
  placeOfMermaidClick,
  showMermaidGuard,
  wireMermaidInternalLinks,
} from "./renderer";
import { createMermaidTrust, MERMAID_TRUST_KEY } from "./trust";

type StubEvent = {
  button?: number;
  key?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
  propagationStopped?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
};

type Stub = {
  className: string;
  attrs: Record<string, string>;
  children: Stub[];
  parentElement?: Stub;
  textContent: string;
  type?: string;
  listeners: Record<string, ((event: StubEvent) => void)[]>;
  append(...nodes: Stub[]): void;
  replaceChildren(...nodes: Stub[]): void;
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  querySelector?(selector: string): Stub | null;
  querySelectorAll?(selector: string): Stub[];
  closest?(selector: string): Stub | null;
  contains?(other: unknown): boolean;
  addEventListener?(
    type: string,
    listener: (event: StubEvent) => void,
    options?: { signal?: AbortSignal },
  ): void;
  createElement?(tag: string): Stub;
};

function el(_tag = "div"): Stub {
  const node: Stub = {
    className: "",
    attrs: {},
    children: [],
    textContent: "",
    listeners: {},
    append(...nodes) {
      for (const child of nodes) {
        child.parentElement = this;
        this.children.push(child);
      }
    },
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    querySelector(selector) {
      return this.querySelectorAll!(selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      const results: Stub[] = [];
      const visit = (current: Stub) => {
        for (const child of current.children) {
          if (matchesSelector(child, selector)) {
            results.push(child);
          }
          visit(child);
        }
      };
      visit(this);
      return results;
    },
    closest(selector) {
      let cur: Stub | undefined = node;
      while (cur) {
        if (matchesSelector(cur, selector)) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    },
    contains(other) {
      if (other === this) {
        return true;
      }
      return this.children.some((child) => child.contains!(other));
    },
    addEventListener(type, listener, options) {
      if (options?.signal?.aborted) {
        return;
      }
      const list = (this.listeners[type] ??= []);
      list.push(listener);
      options?.signal?.addEventListener("abort", () => {
        const index = list.indexOf(listener);
        if (index >= 0) {
          list.splice(index, 1);
        }
      });
    },
  };
  return node;
}

function matchesSelector(node: Stub, selector: string): boolean {
  if (selector.startsWith(".")) {
    const token = selector.slice(1);
    return node.className.split(/\s+/).includes(token);
  }
  return false;
}

function makeEvent(init: Partial<StubEvent> = {}): StubEvent {
  return {
    button: 0,
    ...init,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}

function hostWithDoc() {
  const doc = {
    createElement(tag: string) {
      return el(tag);
    },
  };
  const host = el("pre");
  host.attrs["aria-label"] = "Mermaid diagram";
  (host as Stub & { ownerDocument: typeof doc }).ownerDocument = doc;
  return host as unknown as HTMLElement;
}

test("showMermaidGuard builds Obsidian is-guarded chrome with source", () => {
  const host = hostWithDoc();
  const wrap = showMermaidGuard(
    host,
    new Error("Parse error on line 2"),
    "flowchart LR\nA -->",
  ) as unknown as Stub;

  assert.equal(wrap.className, "mermaid-wrapper is-guarded");
  assert.equal(wrap.attrs.role, "status");
  assert.equal((host as unknown as Stub).children.length, 1);

  const header = wrap.children[0]!;
  assert.equal(header.className, "mermaid-guard-header");
  const text = header.children[0]!;
  assert.equal(text.className, "mermaid-guard-text");
  assert.equal(text.children[0]!.className, "mermaid-guard-title");
  assert.equal(
    text.children[0]!.textContent,
    "Mermaid could not draw this diagram",
  );
  assert.equal(text.children[1]!.className, "mermaid-guard-description");
  assert.match(text.children[1]!.textContent, /Parse error on line 2/);
  // No Allow unless requested (trusted vault, or options omitted).
  assert.equal(
    header.children.find(
      (child) => child.className === "mermaid-guard-actions",
    ),
    undefined,
  );

  const source = wrap.children[1]!;
  assert.equal(source.className, "mermaid-guard-source");
  const code = source.children[0]!.children[0]!;
  assert.equal(code.className, "language-mermaid");
  assert.equal(code.textContent, "flowchart LR\nA -->");
});

test("showMermaidGuard offers Allow until the vault is trusted", () => {
  const host = hostWithDoc();
  let allowed = false;
  const wrap = showMermaidGuard(
    host,
    new Error("Parse error"),
    "flowchart LR\nA --> B",
    {
      showAllow: true,
      onAllow: () => {
        allowed = true;
      },
    },
  ) as unknown as Stub;

  const header = wrap.children[0]!;
  const actions = header.children.find(
    (child) => child.className === "mermaid-guard-actions",
  );
  assert.ok(actions);
  const button = actions!.children[0]!;
  assert.equal(button.textContent, "Allow");
  assert.equal(button.type, "button");
  button.listeners.click![0]!(makeEvent());
  assert.equal(allowed, true);
});

test("mermaid trust persists Allow like Obsidian mermaid-vault-trust", () => {
  const bag = new Map<string, string>();
  const storage = {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
  const trust = createMermaidTrust(storage);
  assert.equal(trust.isTrusted(), false);
  trust.allow();
  assert.equal(trust.isTrusted(), true);
  assert.equal(bag.get(MERMAID_TRUST_KEY), "1");
  assert.equal(createMermaidTrust(storage).isTrusted(), true);
});

test("mermaidInternalLinkTarget resolves label text, data-id, and flowchart id fallback", () => {
  const labeled = el("g");
  labeled.className = "node default internal-link";
  const label = el("g");
  label.className = "label";
  label.textContent = "  Biology  ";
  labeled.append(label);
  assert.equal(
    mermaidInternalLinkTarget(labeled as unknown as Element),
    "Biology",
  );

  const byDataId = el("g");
  byDataId.className = "node default internal-link";
  byDataId.setAttribute("data-id", "Chemistry");
  assert.equal(
    mermaidInternalLinkTarget(byDataId as unknown as Element),
    "Chemistry",
  );

  const byFlowchartId = el("g");
  byFlowchartId.className = "node default internal-link";
  byFlowchartId.setAttribute("id", "mw-1a2b-3c4d-1-flowchart-Physics-0");
  assert.equal(
    mermaidInternalLinkTarget(byFlowchartId as unknown as Element),
    "Physics",
  );
});

test("wireMermaidInternalLinks binds click, modifier keys, keyboard, and abort cleanup", () => {
  const host = el("pre");
  const svg = el("svg");
  const nodeA = el("g");
  nodeA.className = "node default internal-link";
  const labelA = el("g");
  labelA.className = "label";
  labelA.textContent = "Biology";
  nodeA.append(labelA);

  const nodeB = el("g");
  nodeB.className = "node default internal-link";
  nodeB.setAttribute("data-id", "Chemistry");
  svg.append(nodeA, nodeB);
  host.append(svg);

  const opened: { target: string; side: boolean; tab: boolean }[] = [];
  const abort = new AbortController();
  const count = wireMermaidInternalLinks(
    host as unknown as ParentNode,
    (target, place) => opened.push({ target, ...place }),
    abort.signal,
  );
  assert.equal(count, 2);
  assert.equal(nodeA.getAttribute("data-href"), "Biology");
  assert.equal(nodeA.getAttribute("data-wiki"), "true");
  assert.equal(nodeA.getAttribute("role"), "link");
  assert.equal(nodeA.getAttribute("tabindex"), "0");

  const clickPlain = makeEvent({ button: 0 });
  nodeA.listeners.click![0]!(clickPlain);
  assert.equal(clickPlain.defaultPrevented, true);
  assert.equal(clickPlain.propagationStopped, true);
  assert.deepEqual(opened.at(-1), {
    target: "Biology",
    side: false,
    tab: false,
  });

  const clickSide = makeEvent({ button: 0, ctrlKey: true, altKey: true });
  nodeB.listeners.click![0]!(clickSide);
  assert.deepEqual(opened.at(-1), {
    target: "Chemistry",
    side: true,
    tab: false,
  });

  const keyEnter = makeEvent({ key: "Enter" });
  nodeA.listeners.keydown![0]!(keyEnter);
  assert.equal(opened.length, 3);

  assert.deepEqual(placeOfMermaidClick({ metaKey: true, altKey: false }), {
    side: false,
    tab: false,
  });

  abort.abort();
  assert.equal(nodeA.listeners.click?.length ?? 0, 0);
});

test("DiagramRenderer initializes mermaid only when theme or trust changes", async () => {
  const { default: mermaid } = await import("mermaid");
  const { DiagramRenderer } = await import("./renderer");
  const origInit = mermaid.initialize;
  const origRender = mermaid.render;
  let initCalls = 0;
  let renderCalls = 0;
  mermaid.initialize = (() => {
    initCalls++;
  }) as typeof mermaid.initialize;
  mermaid.render = (async (id: string) => {
    renderCalls++;
    return { svg: `<svg id="${id}"></svg>`, bindFunctions: undefined };
  }) as unknown as typeof mermaid.render;

  let trusted = false;
  const renderer = new DiagramRenderer(
    { debug() {}, warn() {}, error() {} },
    {
      isTrusted: () => trusted,
      allow: () => {
        trusted = true;
      },
    },
  );
  try {
    const renderOne = (
      renderer as unknown as {
        renderMermaidSvg: (src: string) => Promise<string>;
      }
    ).renderMermaidSvg.bind(renderer);
    await renderOne("flowchart LR\nA-->B");
    await renderOne("flowchart LR\nC-->D");
    assert.equal(renderCalls, 2);
    assert.equal(initCalls, 1);

    trusted = true;
    await renderOne("flowchart LR\nE-->F");
    assert.equal(initCalls, 2);
    await renderOne("flowchart LR\nG-->H");
    assert.equal(initCalls, 2);
  } finally {
    mermaid.initialize = origInit;
    mermaid.render = origRender;
    renderer.dispose();
  }
});
