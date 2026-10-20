import test from "node:test";
import assert from "node:assert/strict";
import { showMermaidGuard } from "./renderer";

type Stub = {
  className: string;
  attrs: Record<string, string>;
  children: Stub[];
  textContent: string;
  append(...nodes: Stub[]): void;
  replaceChildren(...nodes: Stub[]): void;
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
  createElement?(tag: string): Stub;
};

function el(_tag = "div"): Stub {
  const node: Stub = {
    className: "",
    attrs: {},
    children: [],
    textContent: "",
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
  };
  return node;
}

test("showMermaidGuard builds Obsidian is-guarded chrome with source", () => {
  const doc = {
    createElement(tag: string) {
      return el(tag);
    },
  };
  const host = el("pre");
  host.attrs["aria-label"] = "Mermaid diagram";
  (host as Stub & { ownerDocument: typeof doc }).ownerDocument = doc;

  const wrap = showMermaidGuard(
    host as unknown as HTMLElement,
    new Error("Parse error on line 2"),
    "flowchart LR\nA -->",
  ) as unknown as Stub;

  assert.equal(wrap.className, "mermaid-wrapper is-guarded");
  assert.equal(wrap.attrs.role, "status");
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0], wrap);
  assert.ok(!("aria-label" in host.attrs));

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

  const source = wrap.children[1]!;
  assert.equal(source.className, "mermaid-guard-source");
  const code = source.children[0]!.children[0]!;
  assert.equal(code.className, "language-mermaid");
  assert.equal(code.textContent, "flowchart LR\nA -->");
});
