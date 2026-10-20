import test from "node:test";
import assert from "node:assert/strict";
import { showMermaidGuard } from "./renderer";
import { createMermaidTrust, MERMAID_TRUST_KEY } from "./trust";

type Stub = {
  className: string;
  attrs: Record<string, string>;
  children: Stub[];
  textContent: string;
  type?: string;
  listeners: Record<
    string,
    ((event: { preventDefault(): void; stopPropagation(): void }) => void)[]
  >;
  append(...nodes: Stub[]): void;
  replaceChildren(...nodes: Stub[]): void;
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
  addEventListener?(
    type: string,
    listener: (event: {
      preventDefault(): void;
      stopPropagation(): void;
    }) => void,
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
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener(type, listener) {
      (this.listeners[type] ??= []).push(listener);
    },
  };
  return node;
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
  button.listeners.click![0]!({
    preventDefault() {},
    stopPropagation() {},
  });
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
