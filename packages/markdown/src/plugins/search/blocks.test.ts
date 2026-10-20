import assert from "node:assert/strict";
import test from "node:test";
import { paintSearchMatchesForTest } from "./blocks";
import { resolveSearchOpen } from "./open";
import { protocol } from "./protocol";

class FakeNode {
  textContent = "";
  className = "";
  tabIndex = 0;
  onclick: ((event: FakeMouseEvent) => void) | null = null;
  onkeydown: ((event: FakeKeyEvent) => void) | null = null;
  children: FakeNode[] = [];
  attrs = new Map<string, string>();
  constructor(readonly ownerDocument: FakeDocument) {}
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  append(...nodes: Array<FakeNode | FakeText>) {
    for (const node of nodes) {
      this.children.push(node as FakeNode);
    }
  }
  querySelector(selector: string): FakeNode | null {
    if (selector === ".search-result-file-match") {
      return this.findClass("search-result-file-match");
    }
    return null;
  }
  private findClass(name: string): FakeNode | null {
    if (this.className.split(/\s+/).includes(name)) {
      return this;
    }
    for (const child of this.children) {
      if (child instanceof FakeNode) {
        const found = child.findClass(name);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }
}

class FakeText {
  constructor(readonly textContent: string) {}
}

class FakeDocument {
  createElement(_tag: string) {
    return new FakeNode(this);
  }
  createTextNode(text: string) {
    return new FakeText(text);
  }
}

interface FakeMouseEvent {
  preventDefault(): void;
  stopPropagation(): void;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

interface FakeKeyEvent extends FakeMouseEvent {
  key: string;
}

test("resolveSearchOpen maps path to uri and open options", () => {
  const vault = {
    file(path: string) {
      return path === "notes/A.md"
        ? { uri: "file:///vault/notes/A.md" }
        : undefined;
    },
  };
  assert.deepEqual(resolveSearchOpen(vault, { path: "missing.md" }), undefined);
  assert.deepEqual(
    resolveSearchOpen(vault, { path: "notes/A.md", offset: 12 }),
    {
      uri: "file:///vault/notes/A.md",
      options: { offset: 12 },
    },
  );
  assert.deepEqual(
    resolveSearchOpen(vault, { path: "notes/A.md", side: true }),
    {
      uri: "file:///vault/notes/A.md",
      options: { side: true },
    },
  );
});

test("search/open protocol accepts path + offset", () => {
  assert.deepEqual(protocol.requests.open.params.parse({ path: "A.md" }), {
    path: "A.md",
  });
  assert.deepEqual(
    protocol.requests.open.params.parse({
      path: "A.md",
      offset: 4,
      side: true,
    }),
    { path: "A.md", offset: 4, side: true },
  );
  assert.throws(() =>
    protocol.requests.open.params.parse({ path: "A.md", offset: -1 }),
  );
});

test("match rows call open with path and offset; Cmd+Alt sets side", () => {
  const doc = new FakeDocument();
  const list = doc.createElement("ul");
  const opened: { path: string; offset?: number; side?: boolean }[] = [];
  paintSearchMatchesForTest(
    list as unknown as HTMLElement,
    [
      {
        path: "notes/A.md",
        href: "A.md",
        matches: [
          { text: "hello Meeting", offset: 12, mark: { from: 6, to: 13 } },
        ],
      },
    ],
    (target) => opened.push(target),
  );
  const row = list.querySelector(".search-result-file-match");
  assert.ok(row);
  assert.equal(row.getAttribute("data-offset"), "12");
  assert.equal(row.getAttribute("role"), "button");
  row.onclick?.({
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(opened, [{ path: "notes/A.md", offset: 12 }]);
  opened.length = 0;
  row.onclick?.({
    preventDefault() {},
    stopPropagation() {},
    metaKey: true,
    altKey: true,
  });
  assert.deepEqual(opened, [{ path: "notes/A.md", offset: 12, side: true }]);
});
