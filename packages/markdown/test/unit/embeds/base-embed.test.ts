import test from "node:test";
import assert from "node:assert/strict";
import { renderBaseEmbed } from "../../../src/plugins/embeds/base-embed";
import {
  resourceKind,
  NoteResources,
} from "../../../src/plugins/resources/note-resources";
import { embedEstimatedHeight } from "../../../src/plugins/embeds/estimated-height";
import type { Resource } from "../../../src/plugins/resources/api";
import type { BaseNoteEntry } from "../../../src/markdown/bases";

class FakeElement {
  textContent = "";
  className = "";
  href = "";
  type = "";
  checked = false;
  disabled = false;
  colSpan = 1;
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  private readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, Array<(ev: unknown) => void>>();

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

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDoc,
  ) {}

  replaceChildren(...nodes: FakeElement[]): void {
    this.children = [...nodes];
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  addEventListener(type: string, handler: (ev: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  click(): void {
    for (const handler of this.listeners.get("click") ?? []) {
      handler({
        preventDefault() {},
        stopPropagation() {},
      });
    }
  }

  findAll(predicate: (el: FakeElement) => boolean): FakeElement[] {
    const out: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      if (predicate(node)) {
        out.push(node);
      }
      for (const child of node.children) {
        visit(child);
      }
    };
    visit(this);
    return out;
  }

  findFirst(predicate: (el: FakeElement) => boolean): FakeElement | undefined {
    return this.findAll(predicate)[0];
  }
}

class FakeDoc {
  createElement(tag: string): FakeElement {
    return new FakeElement(tag.toLowerCase(), this);
  }
}

const ENTRIES: BaseNoteEntry[] = [
  {
    path: "Tasks/Task A.md",
    basename: "Task A",
    extension: "md",
    mtime: 1700000000000,
    size: 200,
    frontmatter: { status: "done", estimate: 3, done: true },
    tags: ["#project"],
    links: [],
    embeds: [],
    backlinks: [],
  },
  {
    path: "Tasks/Task B.md",
    basename: "Task B",
    extension: "md",
    mtime: 1700000005000,
    size: 250,
    frontmatter: { status: "active", estimate: 8, done: false },
    tags: ["#project"],
    links: [],
    embeds: [],
    backlinks: [],
  },
];

const BASE_YAML = `
filters: file.hasTag("project")
properties:
  status:
    displayName: Status
  estimate:
    displayName: Estimate
views:
  - type: table
    name: All Tasks
    order:
      - file.name
      - status
      - estimate
      - done
    sort:
      - property: file.name
        direction: ASC
    summaries:
      estimate: Sum
  - type: cards
    name: Active Cards
    filters: 'status == "active"'
    order:
      - file.name
      - status
  - type: list
    name: Done List
    filters: 'status == "done"'
    order:
      - file.name
      - status
`;

function makeBaseResource(text = BASE_YAML): Resource {
  return {
    kind: "base",
    source: "vscode-remote://host/vault/MyBase.base",
    url: "https://webview/MyBase.base",
    text,
    entries: ENTRIES,
  };
}

test("classifies .base files as base resources and reserves estimated height", () => {
  assert.equal(resourceKind("MyBase.base"), "base");
  assert.equal(resourceKind("folder/Projects.BASE"), "base");
  assert.ok(embedEstimatedHeight("![[MyBase.base]]") > 200);
  assert.ok(embedEstimatedHeight("![[MyBase.base#Active Cards]]") > 200);
});

test("renders default first view for ![[MyBase.base]] with clickable note links and sorting", () => {
  const doc = new FakeDoc();
  const host = doc.createElement("span");
  const opened: Array<{ target: string; wiki: boolean }> = [];
  renderBaseEmbed(host as unknown as HTMLElement, {
    target: "MyBase.base",
    wiki: true,
    resource: makeBaseResource(),
    open: (target, wiki) => opened.push({ target, wiki }),
  });

  assert.equal(host.classList.contains("bases-embed"), true);
  const viewEl = host.findFirst((el) => el.classList.contains("bases-view"));
  assert.equal(viewEl?.dataset.viewType, "table");
  assert.equal(viewEl?.dataset.viewName, "All Tasks");

  const rows = host.findAll(
    (el) => el.classList.contains("bases-tr") && Boolean(el.dataset.path),
  );
  assert.deepEqual(
    rows.map((r) => r.dataset.path),
    ["Tasks/Task A.md", "Tasks/Task B.md"],
  );

  const firstLink = rows[0]!.findFirst((el) =>
    el.classList.contains("internal-link"),
  );
  assert.equal(firstLink?.textContent, "Task A");
  firstLink?.click();
  assert.deepEqual(opened, [{ target: "Tasks/Task A.md", wiki: true }]);

  const summaryVal = host.findFirst((el) =>
    el.classList.contains("bases-summary-value"),
  );
  assert.equal(summaryVal?.textContent, "11");

  const nameHeader = host.findFirst(
    (el) =>
      el.classList.contains("bases-table-header") &&
      el.dataset.property === "file.name",
  );
  nameHeader?.click();
  const sortedRows = host.findAll(
    (el) => el.classList.contains("bases-tr") && Boolean(el.dataset.path),
  );
  assert.deepEqual(
    sortedRows.map((r) => r.dataset.path),
    ["Tasks/Task B.md", "Tasks/Task A.md"],
  );
});

test("renders named view when ![[MyBase.base#View Name]] is given and allows switching views", () => {
  const doc = new FakeDoc();
  const host = doc.createElement("span");
  renderBaseEmbed(host as unknown as HTMLElement, {
    target: "MyBase.base#Active Cards",
    wiki: true,
    resource: makeBaseResource(),
    open: () => {},
  });

  const viewEl = host.findFirst((el) => el.classList.contains("bases-view"));
  assert.equal(viewEl?.dataset.viewType, "cards");
  assert.equal(viewEl?.dataset.viewName, "Active Cards");

  const cards = host.findAll((el) => el.classList.contains("bases-cards-item"));
  assert.equal(cards.length, 1);
  assert.equal(cards[0]!.dataset.path, "Tasks/Task B.md");

  const listTab = host.findFirst(
    (el) =>
      el.classList.contains("bases-view-tab") &&
      el.dataset.viewName === "Done List",
  );
  listTab?.click();

  const switchedView = host.findFirst((el) =>
    el.classList.contains("bases-view"),
  );
  assert.equal(switchedView?.dataset.viewType, "list");
  const items = host.findAll((el) => el.classList.contains("bases-list-item"));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.dataset.path, "Tasks/Task A.md");
});

test("shows an error when a requested #View Name does not exist", () => {
  const doc = new FakeDoc();
  const host = doc.createElement("span");
  renderBaseEmbed(host as unknown as HTMLElement, {
    target: "MyBase.base#Missing View",
    wiki: true,
    resource: makeBaseResource(),
    open: () => {},
  });
  const errEl = host.findFirst((el) => el.classList.contains("bases-error"));
  assert.ok(errEl?.textContent.includes('Unknown view "Missing View"'));
});

test("loads .base text and vault note entries via NoteResources", async () => {
  const resources = new NoteResources({
    source: "vscode-remote://host/vault/Home.md",
    vault: {
      root: "vscode-remote://host/vault",
      resolveLink: () => ({
        path: "MyBase.base",
        basename: "MyBase",
        extension: "base",
        mtime: 100,
        size: 50,
        uri: "vscode-remote://host/vault/MyBase.base",
      }),
      files: () => [
        {
          path: "Home.md",
          basename: "Home",
          extension: "md",
          mtime: 100,
          size: 40,
          uri: "vscode-remote://host/vault/Home.md",
        },
      ],
      metadata: () => ({
        frontmatter: { status: "done", tags: ["project"] },
        tags: [],
        links: [],
        embeds: [],
        headings: [],
        blocks: [],
        footnotes: [],
        footnoteRefs: [],
      }),
      backlinks: () => [],
    } as never,
    host: {
      workspace: {
        stat: async () => ({ mtime: 100, size: 50, symbolicLink: false }),
      } as never,
      hostDocuments: {
        open: async () => ({ getText: () => BASE_YAML }),
      } as never,
    },
    resourceUrl: (uri) => uri,
  });

  const loaded = await resources.load("MyBase.base", undefined, "wikilink");
  assert.equal(loaded.kind, "base");
  assert.equal(loaded.text, BASE_YAML);
  assert.equal(loaded.entries?.length, 1);
  assert.deepEqual(loaded.entries?.[0]?.tags, ["#project"]);
  assert.equal(loaded.thisEntry?.path, "Home.md");
});
