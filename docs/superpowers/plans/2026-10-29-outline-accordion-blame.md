# Outline accordion + git blame off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Markdown Outline accordion-by-default (Claude-style single open path via host `expand`/`collapse`, no caret-only full refresh) and turn current-line git blame off by default with a milder GitLens-matching ghost color when enabled.

**Architecture:** Extend `TreeHandle` with `expand`/`collapse`; VS Code adapter uses `reveal(..., { expand: true })` plus element-scoped `onDidChangeTreeData` with an expansion override map (never `refresh()` for caret-only expansion). `OutlineSource` defaults parents collapsed; `OutlineView.followCaret` applies the active path when `expandMode` is `accordion`. New resource setting `outline.expandMode`. Git blame `defaultEnabled: false` and CSS color stack prefers GitLens trailing-line tokens.

**Tech Stack:** TypeScript, VS Code TreeView API, Cordis/Workshop host services, `@workshop/core` Schema, Node test runner (`node:test` via `pnpm exec tsx --test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-29-outline-accordion-blame-design.md`
- Keep native Explorer tree (no custom webview TOC); chevrons stay a host difference
- `lumiere.markdown.plugins.outline.enabled` stays true; view `visibility: "visible"`; `followCursor` stays true
- `expandMode` default `accordion`; `all` restores prior expand-all-parents feel
- Accordion path changes must not call full `tree.refresh()` solely to toggle expansion
- Git blame `defaultEnabled` / contributed default **false**; milder ghost: `var(--vscode-gitlens-trailingLineForegroundColor, #99999959)` ahead of built-in git blame tokens; tooltip keeps normal hover foreground
- Out of scope: custom Claude-styled TOC, sticky-scroll defaults, PDF outline accordion, removing chevrons
- Host GUI after VSIX when code lands; never commit Host GUI PNGs; merge only after Host GUI PASS + CI green

## File map

| File | Responsibility |
| --- | --- |
| `packages/markdown/src/shared/host/workbench.ts` | Add `TreeHandle.expand` / `collapse` |
| `packages/markdown/src/host/services/workbench.ts` | VS Code adapter: expansion override map + expand/collapse |
| `packages/host-node/src/views.ts` | `TreeEvent` expand/collapse variants for embedders |
| `packages/host-node/src/host/trees.ts` | Node `TreeHandle` expand/collapse + snapshot overrides |
| `packages/markdown/test/unit/views/fakes.ts` | Fake `TreeHandle` stubs for expand/collapse |
| `packages/markdown/src/plugins/outline/tree.ts` | Default parents collapsed; `pathTo`; mode-aware initial `expanded` |
| `packages/markdown/src/plugins/outline/view.ts` | Accordion apply in `followCaret`; skip unchanged path |
| `packages/markdown/src/plugins/outline/manifest.ts` | `expandMode` enum setting |
| `packages/markdown/src/plugins/outline/commands.ts` | `EXPAND_MODE_SETTING` constant |
| `packages/markdown/src/plugins/outline/actions.ts` | `expandMode()` settings reader |
| `packages/markdown/src/plugins/outline/host.ts` | Wire expandMode into view + source |
| `packages/markdown/src/plugins/gitBlame/manifest.ts` | `defaultEnabled: false` |
| `packages/markdown/src/plugins/gitBlame/gitBlame.css` | Milder GitLens-first ghost color |
| Root `package.json` | Regenerated via `pnpm contributions` |

---

### Task 1: `TreeHandle.expand` / `collapse` + VS Code + host-node + fakes

**Files:**
- Modify: `packages/markdown/src/shared/host/workbench.ts`
- Modify: `packages/markdown/src/host/services/workbench.ts` (`createTree` ~112–148)
- Modify: `packages/host-node/src/views.ts` (`TreeEvent`)
- Modify: `packages/host-node/src/host/trees.ts`
- Modify: `packages/host-node/test/unit/trees.test.ts`
- Modify: `packages/markdown/test/unit/views/fakes.ts`
- Modify: `packages/host-node/README.md` (one short Limits / trees note)

**Interfaces:**
- Consumes: existing `TreeHandle`, `TreeNode`, VS Code `createTreeView` / `EventEmitter`
- Produces:
  - `TreeHandle.expand(node: TreeNode): Promise<void>`
  - `TreeHandle.collapse(node: TreeNode): Promise<void>`
  - `TreeEvent` may be `{ type: "expand" | "collapse"; viewId: string; id: string }`

- [ ] **Step 1: Extend the contract**

In `workbench.ts`, add to `TreeHandle` after `reveal`:

```ts
  /** Open this node in the tree UI without a full data rebuild. */
  expand(node: TreeNode): Promise<void>;
  /** Close this node in the tree UI without a full data rebuild. */
  collapse(node: TreeNode): Promise<void>;
```

- [ ] **Step 2: Write failing host-node test**

Append to `packages/host-node/test/unit/trees.test.ts`:

```ts
test("expand and collapse emit without a full changed refresh", async () => {
  const { trees, events } = hub();
  const handle = trees.tree("outline", outline());
  events.length = 0;
  await handle.expand({ id: "title", label: "TITLE" });
  await handle.collapse({ id: "title", label: "TITLE" });
  assert.deepEqual(events, [
    { type: "expand", viewId: "outline", id: "title" },
    { type: "collapse", viewId: "outline", id: "title" },
  ]);
  assert.equal(
    events.some((event) => event.type === "changed"),
    false,
  );
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `cd packages/host-node && pnpm exec tsx --test test/unit/trees.test.ts`

Expected: FAIL (`expand` / `collapse` missing on handle, and/or `TreeEvent` type mismatch).

- [ ] **Step 4: Implement host-node + VS Code + fakes**

`packages/host-node/src/views.ts` — extend `TreeEvent`:

```ts
export type TreeEvent =
  | { readonly type: "changed"; readonly viewId: string }
  | {
      readonly type: "reveal";
      readonly viewId: string;
      readonly id: string;
      readonly select: boolean;
    }
  | {
      readonly type: "expand";
      readonly viewId: string;
      readonly id: string;
    }
  | {
      readonly type: "collapse";
      readonly viewId: string;
      readonly id: string;
    };
```

`packages/host-node/src/host/trees.ts` — on `LiveTree` add `expansion = new Map<string, boolean>()`. In `handle()`:

```ts
expand: async (node) => {
  if (live()) {
    tree.expansion.set(node.id, true);
    this.emit({ type: "expand", viewId, id: node.id });
  }
},
collapse: async (node) => {
  if (live()) {
    tree.expansion.set(node.id, false);
    this.emit({ type: "collapse", viewId, id: node.id });
  }
},
```

In `items()` / `toItem` path: when building an item, if `tree.expansion.has(node.id)`, use that boolean for `expanded` instead of `node.expanded` (pass `tree` into `items` or read overrides when pushing). Do **not** emit `changed` from expand/collapse.

VS Code `createTree` in `packages/markdown/src/host/services/workbench.ts`:

```ts
const createTree: WorkbenchViews["tree"] = (viewId, source, options) => {
  const changed = new vscode.EventEmitter<TreeNode | undefined>();
  const expansion = new Map<string, boolean>();
  const view = vscode.window.createTreeView<TreeNode>(viewId, {
    ...options,
    treeDataProvider: {
      onDidChangeTreeData: changed.event,
      getChildren: (node) => (node ? source.children(node) : source.roots()),
      getParent: (node) => source.parent?.(node),
      getTreeItem: (node) => {
        const override = expansion.get(node.id);
        const effective =
          override === undefined ? node : { ...node, expanded: override };
        return treeItem(effective);
      },
    },
  });
  return {
    refresh: () => {
      expansion.clear();
      changed.fire(undefined);
    },
    setMessage: (message) => {
      (view as { message: string | undefined }).message = message;
    },
    reveal: async (node, options) => {
      if (view.visible) {
        await view.reveal(node, { select: true, focus: false, ...options });
      }
    },
    expand: async (node) => {
      if (!view.visible) {
        return;
      }
      expansion.set(node.id, true);
      await view.reveal(node, { expand: true, select: false, focus: false });
    },
    collapse: async (node) => {
      if (!view.visible) {
        return;
      }
      expansion.set(node.id, false);
      // Element-scoped refresh — not changed.fire(undefined).
      changed.fire(node);
    },
    get visible() {
      return view.visible;
    },
    onVisibilityChanged: (listener) =>
      toDisposer(
        view.onDidChangeVisibility((event) => listener(event.visible)),
      ),
    dispose: () => {
      view.dispose();
      changed.dispose();
    },
  };
};
```

`packages/markdown/test/unit/views/fakes.ts` — on the fake tree handle add:

```ts
async expand() {},
async collapse() {},
```

`packages/host-node/README.md` — under Limits (or trees bullet): document that `TreeHandle.expand` / `collapse` emit `expand` / `collapse` events for accordion; embedders that ignore them leave expansion at snapshot `expanded` flags only.

- [ ] **Step 5: Run host-node trees tests — expect PASS**

Same command as Step 3. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/markdown/src/shared/host/workbench.ts \
  packages/markdown/src/host/services/workbench.ts \
  packages/host-node/src/views.ts \
  packages/host-node/src/host/trees.ts \
  packages/host-node/test/unit/trees.test.ts \
  packages/markdown/test/unit/views/fakes.ts \
  packages/host-node/README.md
git commit -m "feat(host): TreeHandle expand/collapse without full tree refresh"
```

---

### Task 2: `OutlineSource` — collapsed defaults, `pathTo`, mode-aware parents

**Files:**
- Modify: `packages/markdown/src/plugins/outline/tree.ts`
- Modify: `packages/markdown/test/unit/outline/tree.test.ts`

**Interfaces:**
- Consumes: existing `OutlineSource`, `TreeNode`
- Produces:
  - `OutlineSource.parentsStartExpanded: boolean` (default `false`)
  - `OutlineSource.pathTo(node: TreeNode): TreeNode[]` — root→…→self

- [ ] **Step 1: Write failing tests**

Append to `tree.test.ts`:

```ts
test("parents start collapsed by default; pathTo lists ancestors then self", () => {
  const text = "# Parent\n## Child\n### Deep\nbody\n## Sibling\n";
  const source = new OutlineSource();
  source.set("memory:///A.md", text);
  const roots = source.roots();
  assert.equal(roots[0]?.expanded, false);
  const deep = source.activeNode(text.indexOf("body"))!;
  assert.equal(deep.label, "Deep");
  assert.deepEqual(
    source.pathTo(deep).map((node) => node.label),
    ["Parent", "Child", "Deep"],
  );
  assert.equal(source.pathTo(deep).at(-1)?.id, deep.id);
});

test("parentsStartExpanded true restores expand-all-parents build", () => {
  const source = new OutlineSource();
  source.parentsStartExpanded = true;
  source.set("memory:///A.md", "# Parent\n## Child\n");
  assert.equal(source.roots()[0]?.expanded, true);
  assert.equal(
    source.children(source.roots()[0]!).some((node) => node.expanded === true),
    false,
    "leaf Child has no expanded flag",
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/markdown && pnpm exec tsx --test test/unit/outline/tree.test.ts`

Expected: FAIL (`pathTo` missing and/or `expanded: true` still emitted).

- [ ] **Step 3: Implement**

In `tree.ts`:

```ts
export class OutlineSource implements TreeSource {
  private uri: string | undefined;
  private outline: OutlineHeading[] = [];
  private coordinates = new SourceCoordinates("");
  private readonly byId = new Map<string, OutlineHeading>();
  /** When true, parents emit `expanded: true` (expandMode `all`). Default false = accordion. */
  parentsStartExpanded = false;

  // ... existing getters/set/index/activeNode/roots/allNodes/children/parent ...

  pathTo(node: TreeNode): TreeNode[] {
    const path: TreeNode[] = [];
    let current: TreeNode | undefined = node;
    while (current) {
      path.unshift(current);
      current = this.parent(current);
    }
    return path;
  }

  private node(heading: OutlineHeading): TreeNode {
    return {
      id: heading.id,
      label: heading.title,
      ...(heading.children.length > 0 && {
        expanded: this.parentsStartExpanded,
      }),
      command: { id: OPEN_COMMAND, args: [this.uri, heading.offset] },
    };
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/markdown/src/plugins/outline/tree.ts \
  packages/markdown/test/unit/outline/tree.test.ts
git commit -m "feat(outline): default collapsed parents and pathTo helper"
```

---

### Task 3: `expandMode` setting + contributions

**Files:**
- Modify: `packages/markdown/src/plugins/outline/manifest.ts`
- Modify: `packages/markdown/src/plugins/outline/commands.ts`
- Modify: `packages/markdown/src/plugins/outline/actions.ts`
- Modify: `packages/markdown/test/unit/contributions.test.ts`
- Modify: root `package.json` (via `pnpm contributions`)
- Modify: `packages/markdown/src/plugins/outline/README.md` (settings bullet)

**Interfaces:**
- Consumes: `Schema.union`, existing outline config / `followsCursor` pattern
- Produces:
  - Setting key `outline.expandMode` → contributed `lumiere.markdown.outline.expandMode`
  - `EXPAND_MODE_SETTING = "outline.expandMode"`
  - `expandMode(settings, resource?): "accordion" | "all"`

- [ ] **Step 1: Write failing contributions assertion**

In `contributions.test.ts`, inside the existing outline followCursor test (or a new adjacent test), assert:

```ts
assert.deepEqual(properties["lumiere.markdown.outline.expandMode"], {
  enum: ["accordion", "all"],
  default: "accordion",
  scope: "resource",
  description:
    "How Markdown Outline expands headings while Follow Cursor is on: accordion keeps only the active path open; all expands every parent (previous behavior).",
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/markdown && pnpm exec tsx --test test/unit/contributions.test.ts`

Expected: FAIL (property missing).

- [ ] **Step 3: Add setting + reader + regenerate package.json**

`manifest.ts` config:

```ts
export const config = Schema.object({
  followCursor: Schema.boolean()
    .default(true)
    .description(
      "Select and reveal the current heading in Markdown Outline as the cursor moves, without taking focus.",
    ),
  expandMode: Schema.union(["accordion", "all"])
    .default("accordion")
    .description(
      "How Markdown Outline expands headings while Follow Cursor is on: accordion keeps only the active path open; all expands every parent (previous behavior).",
    ),
});
```

`commands.ts`:

```ts
export const EXPAND_MODE_SETTING = "outline.expandMode";
```

`actions.ts` — add:

```ts
import { EXPAND_MODE_SETTING, FOLLOW_CURSOR_SETTING, /* ... */ } from "./commands";

export type OutlineExpandMode = "accordion" | "all";

export function expandMode(
  settings: HostSettings,
  resource?: string,
): OutlineExpandMode {
  const configured = settings.access.inspect(
    EXPAND_MODE_SETTING,
    resource,
  ).value;
  const value =
    configured === undefined
      ? settings.get(EXPAND_MODE_SETTING, "accordion")
      : configured;
  return value === "all" ? "all" : "accordion";
}
```

Regenerate:

```bash
pnpm contributions
```

Update outline README settings bullet to list `lumiere.markdown.outline.expandMode` (default `accordion`, resource-scoped).

- [ ] **Step 4: Run — expect PASS**

Same contributions test command. Also: `pnpm contributions --check` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/markdown/src/plugins/outline/manifest.ts \
  packages/markdown/src/plugins/outline/commands.ts \
  packages/markdown/src/plugins/outline/actions.ts \
  packages/markdown/src/plugins/outline/README.md \
  packages/markdown/test/unit/contributions.test.ts \
  package.json
git commit -m "feat(outline): expandMode accordion|all setting (default accordion)"
```

---

### Task 4: Accordion `followCaret` + host wiring + host tests

**Files:**
- Modify: `packages/markdown/src/plugins/outline/view.ts`
- Modify: `packages/markdown/src/plugins/outline/host.ts`
- Modify: `packages/markdown/test/unit/outline/fixture.ts`
- Modify: `packages/markdown/test/unit/outline/host.test.ts`

**Interfaces:**
- Consumes: `TreeHandle.expand` / `collapse`, `OutlineSource.pathTo` / `parentsStartExpanded`, `expandMode()`, `followsCursor()`
- Produces: accordion path apply on follow; no `tree.refresh()` from caret-only follow; skip expand/collapse when path id set unchanged

- [ ] **Step 1: Extend fixture to record expand/collapse/refresh**

In `fixture.ts`, alongside `reveals`:

```ts
const expands: TreeNode[] = [];
const collapses: TreeNode[] = [];
let refreshCount = 0;
```

Wrap the tree handle:

```ts
fake.views.tree = (id, source, options) => {
  treeOptions = options;
  const base = originalTree(id, source, options);
  const originalRefresh = base.refresh.bind(base);
  return {
    ...base,
    refresh() {
      refreshCount++;
      originalRefresh();
    },
    async reveal(node, options) {
      reveals.push({ node, options });
    },
    async expand(node) {
      expands.push(node);
    },
    async collapse(node) {
      collapses.push(node);
    },
    get visible() {
      return visible;
    },
    onVisibilityChanged(listener) {
      visibilityChanged = listener;
      return () => {
        visibilityChanged = () => {};
      };
    },
  };
};
```

Widen `settings.access.inspect` to accept `FOLLOW_CURSOR_SETTING` **or** `EXPAND_MODE_SETTING` (import both). For expandMode, default `"accordion"` when unset; use `Map<string, unknown>` (or a parallel map) for resource overrides so expandMode can be `"all"` / `"accordion"`. Include on the returned fixture object:

```ts
return {
  // ...existing fields...
  expands,
  collapses,
  get refreshCount() {
    return refreshCount;
  },
};
```

- [ ] **Step 2: Write failing accordion host tests**

Append to `host.test.ts` (use a multi-branch note):

```ts
import { EXPAND_MODE_SETTING, FOLLOW_CURSOR_SETTING } from "../../../src/plugins/outline/commands";

const NESTED = `# A
## A1
### A1a
body-a
## A2
body-a2
# B
## B1
body-b
`;

test("accordion follow expands only the active path and does not refresh", async (t) => {
  const fixture = await outlineFixture({ "A.md": NESTED });
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  const refreshAfterOpen = fixture.refreshCount;
  fixture.expands.length = 0;
  fixture.collapses.length = 0;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.equal(fixture.refreshCount, refreshAfterOpen, "no caret-only refresh");
  assert.deepEqual(
    fixture.expands.map((node) => node.label).sort(),
    ["A", "A1", "A1a"].sort(),
  );
  assert.ok(
    fixture.collapses.some((node) => node.label === "B"),
    "other top-level branch collapses",
  );
  assert.ok(
    fixture.collapses.some((node) => node.label === "A2"),
    "sibling under A collapses",
  );
  assert.equal(fixture.reveals.at(-1)?.node.label, "A1a");
});

test("unchanged accordion path skips expand/collapse", async (t) => {
  const fixture = await outlineFixture({ "A.md": NESTED });
  t.after(() => fixture.root.dispose());
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  fixture.expands.length = 0;
  fixture.collapses.length = 0;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-a") + 1;
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.deepEqual(fixture.expands, []);
  assert.deepEqual(fixture.collapses, []);
  assert.equal(fixture.reveals.at(-1)?.node.label, "A1a");
});

test("expandMode all keeps parents expanded on build and only reveals on follow", async (t) => {
  const fixture = await outlineFixture({ "A.md": NESTED });
  t.after(() => fixture.root.dispose());
  fixture.fake.settings[EXPAND_MODE_SETTING] = "all";
  fixture.configure();
  const { panel, cursor } = fixture.panel("one");
  fixture.open(panel);
  await tick();
  assert.equal(fixture.view.source.roots()[0]?.expanded, true);
  fixture.expands.length = 0;
  fixture.collapses.length = 0;
  cursor.head = fixture.texts.get("A.md")!.indexOf("body-b");
  fixture.root.emit("editor/selectionChanged", panel, false);
  await tick();
  assert.deepEqual(fixture.expands, []);
  assert.deepEqual(fixture.collapses, []);
  assert.equal(fixture.reveals.at(-1)?.node.label, "B1");
});
```

Adjust `render` / `roots` access if the fixture exposes `source` only through `fixture.view.source` — the existing tests already use `fixture.view.source`.

- [ ] **Step 3: Run — expect FAIL**

Run: `cd packages/markdown && pnpm exec tsx --test test/unit/outline/host.test.ts`

Expected: FAIL (no expands/collapses / parents still always expanded).

- [ ] **Step 4: Implement view + host wiring**

`view.ts` options:

```ts
interface OutlineViewOptions {
  tree: TreeHandle;
  source: OutlineSource;
  editors: Pick<Editors, "active">;
  followsCursor(): boolean;
  expandMode(): "accordion" | "all";
  logger: Logger;
}
```

Add private `lastAccordionKey: string | undefined`.

In `refresh()` before `tree.refresh()`:

```ts
this.options.source.parentsStartExpanded =
  this.options.expandMode() === "all";
this.lastAccordionKey = undefined;
```

Replace the reveal-only block in `followCaret` after resolving `node`:

```ts
const node = this.options.source.activeNode(caret.head);
if (!node) {
  return;
}
if (
  this.options.followsCursor() &&
  this.options.expandMode() === "accordion"
) {
  await this.applyAccordion(node);
} else {
  await this.options.tree.reveal(node, { select: true, focus: false });
}
```

Add:

```ts
private async applyAccordion(active: TreeNode): Promise<void> {
  const path = this.options.source.pathTo(active);
  const expandIds = new Set<string>();
  for (const node of path) {
    if (this.options.source.children(node).length > 0) {
      expandIds.add(node.id);
    }
  }
  const key = [...expandIds].sort().join("\0");
  if (key !== this.lastAccordionKey) {
    this.lastAccordionKey = key;
    for (const node of path) {
      if (expandIds.has(node.id)) {
        await this.options.tree.expand(node);
      }
    }
    for (const node of this.options.source.allNodes()) {
      if (
        node.expanded !== undefined &&
        !expandIds.has(node.id)
      ) {
        // Parent nodes always set `expanded` boolean; leaves omit it.
        await this.options.tree.collapse(node);
      }
    }
  }
  await this.options.tree.reveal(active, { select: true, focus: false });
}
```

Note: after Task 2, leaves omit `expanded`; parents always have `expanded: boolean`. Prefer collapsing via `children(node).length > 0 && !expandIds.has(node.id)` if `expanded` is unreliable after accordion overrides — use:

```ts
for (const node of this.options.source.allNodes()) {
  if (
    this.options.source.children(node).length > 0 &&
    !expandIds.has(node.id)
  ) {
    await this.options.tree.collapse(node);
  }
}
```

`host.ts` — pass `expandMode`:

```ts
import { expandMode, followsCursor, /* ... */ } from "./actions";

const view = new OutlineView({
  source,
  tree,
  editors,
  logger: ctx.logger,
  followsCursor: () =>
    followsCursor(ctx.settings, editors.active()?.document.uri),
  expandMode: () =>
    expandMode(ctx.settings, editors.active()?.document.uri),
});
```

`expandAll()` stays as today (reveal with `expand: true` per node). Next accordion follow reasserts the path.

- [ ] **Step 5: Run outline host + tree tests — expect PASS**

```bash
cd packages/markdown && pnpm exec tsx --test test/unit/outline/tree.test.ts test/unit/outline/host.test.ts
```

Expected: PASS. Fix any existing host tests that assumed parents start expanded in `render(...)` snapshots if assertions break — accordion default may still *list* children via `source.children` even when `expanded: false` (TreeSource still returns children; only the UI starts collapsed).

- [ ] **Step 6: Commit**

```bash
git add packages/markdown/src/plugins/outline/view.ts \
  packages/markdown/src/plugins/outline/host.ts \
  packages/markdown/test/unit/outline/fixture.ts \
  packages/markdown/test/unit/outline/host.test.ts
git commit -m "feat(outline): accordion followCaret via expand/collapse"
```

---

### Task 5: Git blame off by default

**Files:**
- Modify: `packages/markdown/src/plugins/gitBlame/manifest.ts`
- Modify: `packages/markdown/test/unit/gitBlame/coexistence.test.ts`
- Modify: root `package.json` (via `pnpm contributions`)
- Modify: `packages/markdown/src/plugins/gitBlame/README.md`
- Modify: `packages/markdown/CAPABILITIES.md` (gitBlame row: off by default)
- Modify: `packages/markdown/docs/MANUAL_TEST_PLAN.md` and `docs/PARITY.md` only where they hard-code blame default `true`

**Interfaces:**
- Consumes: existing `defaultEnabled` → contributions `plugins.gitBlame.enabled`
- Produces: manifest + contributed default `false`

- [ ] **Step 1: Flip the coexistence assertion to expect false**

In `coexistence.test.ts`, rename/adjust the test title and:

```ts
assert.equal(manifest.defaultEnabled, false);
assert.equal(
  properties["lumiere.markdown.plugins.gitBlame.enabled"]?.default,
  false,
);
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/markdown && pnpm exec tsx --test test/unit/gitBlame/coexistence.test.ts`

Expected: FAIL on `true` vs `false`.

- [ ] **Step 3: Set `defaultEnabled: false` and regenerate**

```ts
defaultEnabled: false,
```

```bash
pnpm contributions
```

Update README (“defaults to false”), CAPABILITIES table, and any MANUAL/PARITY lines that say blame defaults on.

- [ ] **Step 4: Run — expect PASS**

Same coexistence command + `pnpm contributions --check`.

- [ ] **Step 5: Commit**

```bash
git add packages/markdown/src/plugins/gitBlame/manifest.ts \
  packages/markdown/test/unit/gitBlame/coexistence.test.ts \
  packages/markdown/src/plugins/gitBlame/README.md \
  packages/markdown/CAPABILITIES.md \
  packages/markdown/docs/MANUAL_TEST_PLAN.md \
  packages/markdown/docs/PARITY.md \
  package.json
git commit -m "feat(gitBlame): disable current-line authorship by default"
```

---

### Task 6: Milder GitLens-matching blame ghost color

**Files:**
- Modify: `packages/markdown/src/plugins/gitBlame/gitBlame.css`
- Modify: `packages/markdown/test/unit/gitBlame/widget.test.ts` (existing CSS assertions ~172–188)
- Modify: `packages/markdown/src/plugins/gitBlame/README.md` (css bullet)

**Interfaces:**
- Consumes: `.mw-gb-ghost` rule; tooltip already uses `editorHoverWidget` foreground
- Produces: ghost color stack `gitlens.trailingLineForegroundColor` → `#99999959` → existing git blame / description / muted fallbacks

- [ ] **Step 1: Update the failing CSS assertion**

In `widget.test.ts` ghost style test, replace the sole `--vscode-git-blame-editorDecorationForeground` requirement with:

```ts
assert.match(ghost, /--vscode-gitlens-trailingLineForegroundColor/);
assert.match(ghost, /#99999959/);
assert.doesNotMatch(
  ghost,
  /--vscode-git-blame-editorDecorationForeground/,
);
assert.match(css, /\.mw-gb-tooltip \{[^}]*editorHoverWidget/s);
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/markdown && pnpm exec tsx --test test/unit/gitBlame/widget.test.ts`

Expected: FAIL (gitlens token / `#99999959` missing).

- [ ] **Step 3: Update CSS**

Replace the `.mw-gb-ghost` color declaration with (spec stack: GitLens token, else `#99999959`):

```css
  /* GitLens trailing-line blame; quiet gray ~35% alpha when the token is absent. */
  color: var(
    --vscode-gitlens-trailingLineForegroundColor,
    #99999959
  );
```

Remove the previous `--vscode-git-blame-editorDecorationForeground` / description / muted chain from `.mw-gb-ghost` so the ghost stays as mild as GitLens even when the built-in git blame token is strong. Do **not** change `.mw-gb-tooltip` (keeps `editorHoverWidget` foreground).

- [ ] **Step 4: Run — expect PASS**

Same widget test command.

- [ ] **Step 5: Commit**

```bash
git add packages/markdown/src/plugins/gitBlame/gitBlame.css \
  packages/markdown/test/unit/gitBlame/widget.test.ts \
  packages/markdown/src/plugins/gitBlame/README.md
git commit -m "fix(gitBlame): milder GitLens-matching trailing ghost color"
```

---

### Task 7: Full package check + Host GUI gate + PR

**Files:**
- Modify: PR body for the implementation PR (not committed screenshots)
- Optional bot-box brief under `/workspace/plans/` only when verifying (not committed)

- [ ] **Step 1: Run markdown unit suite + contributions check**

```bash
cd packages/markdown && pnpm test
pnpm contributions --check
cd packages/host-node && pnpm exec tsx --test test/unit/trees.test.ts
```

Expected: all pass.

- [ ] **Step 2: Open/update implementation PR**

Branch tip includes Tasks 1–6. PR description links:

- Spec: `docs/superpowers/specs/2026-10-29-outline-accordion-blame-design.md`
- Plan: `docs/superpowers/plans/2026-10-29-outline-accordion-blame.md`

Host GUI checklist (real VS Code / Cursor, after VSIX + Reload Window):

1. Fresh defaults: Markdown Outline visible; follow on; parents collapsed until caret enters a section.
2. Caret into deep H3 → only that ancestor path open; other branches closed.
3. Move to another H2 → previous branch closes.
4. Expand All, then move caret → accordion returns to single path.
5. Set `lumiere.markdown.outline.expandMode` to `all` → parents start expanded; follow only selects/reveals.
6. Fresh install / default settings: no end-of-line blame chip until `lumiere.markdown.plugins.gitBlame.enabled` is turned on.
7. With blame enabled: ghost is quiet (`#99999959` / GitLens token); hover tooltip remains normal contrast.

Upload shots as GitHub user-attachments; never commit PNGs to `main`.

- [ ] **Step 3: Host GUI PASS then merge (standing rule)**

Parent runs Host GUI. Merge only after **Host GUI PASS** and CI green. Do not merge on unit green alone.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `TreeHandle.expand` / `collapse` | 1 |
| VS Code adapter without full rebuild on expand/collapse | 1 |
| Non-VS Code host implements or documents degrade | 1 (host-node events + README) |
| OutlineSource parents default collapsed | 2 |
| `pathTo` / path set for nested headings | 2 |
| `expandMode: all` parents expanded on build | 2, 4 |
| Setting `expandMode` accordion\|all default accordion | 3 |
| Accordion follow: expand path, collapse others, reveal/select | 4 |
| No full `refresh` on caret-only path change | 4 |
| Skip expand/collapse when path unchanged | 4 |
| Document refresh still refreshes then re-applies accordion | 4 (`lastAccordionKey` cleared in `refresh`) |
| Expand All then follow reasserts path | 4 + Host GUI |
| Manual chevron overwritten by next accordion follow | 4 (apply overwrites) + Host GUI |
| Click heading → navigate; expansion from follow after caret settles | existing open + 4 |
| followCursor / outline enabled / visible unchanged | 3–4 (no change to those defaults) |
| gitBlame `defaultEnabled` false | 5 |
| Milder GitLens ghost color; tooltip unchanged | 6 |
| Host GUI success criteria + merge gate | 7 |
