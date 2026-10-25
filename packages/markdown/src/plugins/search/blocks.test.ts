import assert from "node:assert/strict";
import test from "node:test";
import { bindSearchBlock, paintSearchMatchesForTest } from "./blocks";
import { resolveSearchOpen } from "./open";
import { protocol } from "./protocol";

class FakeNode {
  textContent = "";
  className = "";
  href = "";
  type = "";
  disabled = false;
  tabIndex = 0;
  onclick: ((event: FakeMouseEvent) => void) | null = null;
  onkeydown: ((event: FakeKeyEvent) => void) | null = null;
  children: FakeNode[] = [];
  attrs = new Map<string, string>();
  readonly classList = {
    add: (...names: string[]) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const name of names) {
        set.add(name);
      }
      this.className = [...set].join(" ");
    },
    contains: (name: string) =>
      this.className.split(/\s+/).filter(Boolean).includes(name),
  };
  constructor(readonly ownerDocument: FakeDocument) {}
  replaceChildren(...nodes: Array<FakeNode | FakeText>) {
    this.children = [];
    this.append(...nodes);
  }
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
    if (selector.startsWith(".")) {
      return this.findClass(selector.slice(1));
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

test("file title links call open with path and support Cmd+Alt side open", () => {
  const doc = new FakeDocument();
  const list = doc.createElement("ul");
  const opened: { path: string; offset?: number; side?: boolean }[] = [];
  paintSearchMatchesForTest(
    list as unknown as HTMLElement,
    [
      {
        path: "notes/Project.md",
        href: "Project.md",
      },
    ],
    (target) => opened.push(target),
  );
  const item = list.querySelector(".search-result-file-title");
  assert.ok(item);
  const link = item.children[0];
  assert.ok(link);
  link.onclick?.({
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(opened, [{ path: "notes/Project.md" }]);
  opened.length = 0;
  link.onclick?.({
    preventDefault() {},
    stopPropagation() {},
    ctrlKey: true,
    altKey: true,
  });
  assert.deepEqual(opened, [{ path: "notes/Project.md", side: true }]);
});

test("bindSearchBlock mounts Obsidian internal-query classes, header and results", () => {
  const doc = new FakeDocument();
  const element = doc.createElement("pre");
  let measured = 0;
  const opened: { path: string; offset?: number; side?: boolean }[] = [];
  const dispose = bindSearchBlock({
    fence: {
      element: element as unknown as HTMLElement,
      language: "query",
      source: "tag:#project status:done\n",
    },
    pass: {
      measure() {
        measured++;
      },
    } as never,
    client: {
      watch(query, _source, onUpdate) {
        assert.equal(query, "tag:#project status:done\n");
        onUpdate({
          loading: false,
          results: [
            {
              path: "projects/Launch.md",
              href: "projects/Launch.md",
              matches: [
                {
                  text: "#project launch",
                  offset: 24,
                  mark: { from: 0, to: 8 },
                },
              ],
            },
          ],
          unreadable: 0,
        });
        return () => {};
      },
    },
    source: "file:///vault/Search.md",
    open: (target) => opened.push(target),
  });
  assert.ok(element.classList.contains("embedded-search"));
  assert.ok(element.classList.contains("internal-query"));
  const header = element.querySelector(".internal-query-header");
  assert.ok(header);
  const title = element.querySelector(".internal-query-header-title");
  assert.equal(title?.textContent, "tag:#project status:done");
  const container = element.querySelector(".search-result-container");
  assert.ok(container);
  assert.equal(measured, 1);
  const fileItem = container.querySelector(".search-result-file-title");
  assert.ok(fileItem);
  fileItem.children[0]?.onclick?.({
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(opened, [{ path: "projects/Launch.md" }]);
  dispose();
});
