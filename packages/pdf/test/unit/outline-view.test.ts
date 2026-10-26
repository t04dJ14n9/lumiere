import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { OutlineItem } from "../../src/shared/messages";
import {
  findActiveOutlineItem,
  flattenOutlineForPicker,
} from "../../src/shared/outline";
import { OUTLINE_COMMAND_IDS } from "../../src/shared/command-ids";
import {
  Disposable,
  EventEmitter,
  TreeItem,
  TreeItemCollapsibleState,
} from "./support/fake-vscode";
import { pdfContributes } from "./support/manifest";

const SETTING = "lumiere.pdf.outline.followCursor";
const CONTEXT = "lumiere.pdf.outlineFollowCursor";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const heading = (
  title: string,
  page: number,
  children: OutlineItem[] = [],
  top = 0,
): OutlineItem => ({ title, page, top, children });

interface Panel {
  outline: OutlineItem[] | undefined;
  view: { page: number; readingPage: number; top: number } | undefined;
  goTo(location: { page: number }, top?: number): void;
}
interface Provider {
  getChildren(item?: OutlineItem): OutlineItem[];
  getParent(item: OutlineItem): OutlineItem | undefined;
  getTreeItem(item: OutlineItem): {
    command?: { command: string; arguments: unknown[] };
  };
  onDidChangeTreeData(listener: () => void): Disposable;
}
interface Reveal {
  item: OutlineItem;
  options: { expand: boolean; select: boolean; focus: boolean };
}

function harness(enabled = false, visible = true) {
  let active: Panel | undefined;
  let saved = enabled;
  let provider!: Provider;
  let collapseAll = false;
  let hold: (() => Promise<void>) | undefined;
  const panelsChanged = new EventEmitter<void>();
  const visibilityChanged = new EventEmitter<void>();
  const configurationChanged = new EventEmitter<{
    affectsConfiguration(key: string): boolean;
  }>();
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const contexts = new Map<string, unknown>();
  const reveals: Reveal[] = [];
  const warnings: string[] = [];
  const writes: { key: string; value: boolean }[] = [];
  const executed: string[] = [];
  const navigations: { panel: Panel; page: number; top: number | undefined }[] =
    [];
  const picks: unknown[] = [];
  let pickResult: unknown = undefined;
  let holdPick = false;
  let releasePick: ((forced?: unknown) => void) | undefined;
  let livePicker:
    | {
        placeholder: string;
        busy: boolean;
        items: { label: string }[];
      }
    | undefined;
  const view = {
    visible,
    onDidChangeVisibility: visibilityChanged.event,
    reveal: async (item: OutlineItem, options: Reveal["options"]) => {
      // Exercise the ancestry VS Code needs to reveal hidden descendants.
      let parent = provider.getParent(item);
      while (parent) {
        parent = provider.getParent(parent);
      }
      reveals.push({ item, options: { ...options } });
      await hold?.();
    },
    dispose() {},
  };
  const api = {
    Disposable,
    EventEmitter,
    TreeItem,
    TreeItemCollapsibleState,
    window: {
      createTreeView: (
        _id: string,
        options: { treeDataProvider: Provider; showCollapseAll: boolean },
      ) => {
        provider = options.treeDataProvider;
        collapseAll = options.showCollapseAll;
        return view;
      },
      createQuickPick: <T extends { label: string }>() => {
        const accept: Array<() => void> = [];
        const hide: Array<() => void> = [];
        let finished = false;
        const finish = (accepted: boolean) => {
          if (finished) {
            return;
          }
          finished = true;
          if (accepted) {
            for (const listener of accept) {
              listener();
            }
          } else {
            for (const listener of hide) {
              listener();
            }
          }
        };
        const picker = {
          title: "",
          placeholder: "",
          busy: false,
          items: [] as T[],
          matchOnDescription: false,
          matchOnDetail: false,
          selectedItems: [] as T[],
          onDidAccept: (listener: () => void) => {
            accept.push(listener);
            return new Disposable(() => {});
          },
          onDidHide: (listener: () => void) => {
            hide.push(listener);
            return new Disposable(() => {});
          },
          show: () => {
            livePicker = picker;
            picks.push({
              items: picker.items,
              options: { placeHolder: picker.placeholder },
            });
            const complete = (forced?: unknown) => {
              if (forced) {
                picker.selectedItems = [forced as T];
                finish(true);
                return;
              }
              if (pickResult === undefined) {
                finish(false);
                return;
              }
              const wanted = pickResult as { label?: string };
              const match =
                typeof wanted?.label === "string"
                  ? picker.items.find((item) => item.label === wanted.label)
                  : undefined;
              picker.selectedItems = match ? [match] : [];
              finish(Boolean(match));
            };
            if (holdPick) {
              releasePick = complete;
            } else {
              queueMicrotask(() => complete());
            }
          },
          hide: () => finish(false),
          dispose: () => {
            livePicker = undefined;
          },
        };
        return picker;
      },
    },
    workspace: {
      getConfiguration: () => ({ get: () => saved }),
      onDidChangeConfiguration: configurationChanged.event,
    },
    commands: {
      registerCommand: (
        id: string,
        callback: (...args: unknown[]) => unknown,
      ) => {
        commands.set(id, callback);
        return new Disposable(() => {
          commands.delete(id);
        });
      },
      executeCommand: async (id: string, key?: string, value?: unknown) => {
        if (id === "setContext") {
          contexts.set(String(key), value);
          return;
        }
        executed.push(id);
      },
    },
  };
  const modules: Record<string, unknown> = {
    vscode: api,
    "../../../shared/outline": {
      findActiveOutlineItem,
      flattenOutlineForPicker,
    },
    "../../../shared/command-ids": { OUTLINE_COMMAND_IDS },
    "./focus": {
      createOutlineFocus: () => ({
        sync() {},
        dispose() {},
      }),
    },
  };
  const settings = {
    update: async (key: string, value: boolean) => {
      writes.push({ key, value });
      saved = value;
      configurationChanged.fire({
        affectsConfiguration: (candidate) => candidate === key,
      });
    },
  };
  const source = readFileSync(
    new URL(
      "../../src/extension/plugins/pdfOutline/outline-view.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = {
    exports: {} as {
      registerOutlineView(
        panels: unknown,
        settings: unknown,
        log: unknown,
      ): Disposable;
    },
  };
  const evaluate = runInNewContext(
    `(function(require,module,exports){${output}\n})`,
  ) as (
    require: (name: string) => unknown,
    module: unknown,
    exports: unknown,
  ) => void;
  evaluate(
    (name) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
    module,
    module.exports,
  );
  const panels = {
    get active() {
      return active;
    },
    onDidChange: panelsChanged.event,
  };
  let registration: Disposable | undefined;
  return {
    view,
    reveals,
    contexts,
    warnings,
    writes,
    navigations,
    picks,
    get livePicker() {
      return livePicker;
    },
    setPick(value: unknown) {
      pickResult = value;
    },
    holdPick(value = true) {
      holdPick = value;
    },
    releasePick(forced?: unknown) {
      const release = releasePick;
      releasePick = undefined;
      holdPick = false;
      release?.(forced);
    },
    get provider() {
      return provider;
    },
    get collapseAll() {
      return collapseAll;
    },
    get saved() {
      return saved;
    },
    panel(outline: OutlineItem[], page = 1, top = 0): Panel {
      const panel: Panel = {
        outline,
        view: { page, readingPage: page, top },
        goTo: ({ page }, top) => {
          navigations.push({ panel, page, top });
        },
      };
      return panel;
    },
    activate(panel?: Panel) {
      active = panel;
      panelsChanged.fire();
    },
    changed() {
      panelsChanged.fire();
    },
    visibility(value: boolean) {
      view.visible = value;
      visibilityChanged.fire();
    },
    setting(value: boolean, key = SETTING) {
      saved = value;
      configurationChanged.fire({
        affectsConfiguration: (candidate) => candidate === key,
      });
    },
    hold(callback?: () => Promise<void>) {
      hold = callback;
    },
    command(id: string, ...args: unknown[]) {
      const command = commands.get(`lumiere.pdf.${id}`);
      assert.ok(command, id);
      return command(...args);
    },
    start() {
      registration = module.exports.registerOutlineView(panels, settings, {
        warn: (message: string) => warnings.push(message),
      });
    },
    dispose() {
      registration?.dispose();
    },
  };
}

test("follow is off by default; its commands save the setting and update the context and selection", async (t) => {
  const h = harness();
  t.after(h.dispose);
  const child = heading("Child", 2);
  h.activate(h.panel([heading("Chapter", 1, [child])], 2));
  h.start();
  assert.equal(h.collapseAll, true);
  assert.equal(h.contexts.get(CONTEXT), false);
  assert.equal(h.reveals.length, 0);
  await h.command("enableOutlineFollowCursor");
  await tick();
  assert.equal(h.saved, true);
  assert.equal(h.contexts.get(CONTEXT), true);
  assert.equal(h.reveals.at(-1)?.item, child);
  assert.equal(
    h.reveals.length,
    1,
    "the command and configuration event reveal only once",
  );
  assert.deepEqual(h.reveals.at(-1)?.options, {
    select: true,
    focus: false,
    expand: false,
  });
  await h.command("disableOutlineFollowCursor");
  const count = h.reveals.length;
  h.changed();
  await tick();
  assert.equal(h.contexts.get(CONTEXT), false);
  assert.equal(h.reveals.length, count);
  assert.deepEqual(h.writes, [
    { key: SETTING, value: true },
    { key: SETTING, value: false },
  ]);
  h.dispose();
  h.start();
  await tick();
  assert.equal(h.contexts.get(CONTEXT), false);
});

test("persisted follow selects nested headings on page and offset changes without rebuilding the tree", async (t) => {
  const h = harness(true);
  t.after(h.dispose);
  const child = heading("Child", 2);
  const lower = heading("Lower heading", 2, [], 300);
  const root = heading("Root", 1, [child, lower]);
  const panel = h.panel([root]);
  h.activate(panel);
  h.start();
  await tick();
  let refreshes = 0;
  t.after(() => subscription.dispose());
  const subscription = h.provider.onDidChangeTreeData(() => {
    refreshes++;
  });
  panel.view = { page: 2, readingPage: 2, top: 0 };
  h.changed();
  await tick();
  panel.view.top = 300;
  h.changed();
  await tick();
  h.changed();
  await tick();
  assert.deepEqual(
    h.reveals.map((reveal) => reveal.item),
    [root, child, lower],
  );
  assert.equal(
    refreshes,
    0,
    "ordinary viewer state changes preserve expansion",
  );
  assert.equal(h.provider.getParent(lower), root);
  assert.equal(h.provider.getParent(root), undefined);
  assert.equal(h.navigations.length, 0, "revealing does not navigate");
});

test("the current page never uses a vertical offset belonging to an earlier reading page", async (t) => {
  const h = harness(true);
  t.after(h.dispose);
  const start = heading("Start", 2);
  const lower = heading("Lower", 2, [], 300);
  const panel = h.panel([start, lower], 2, 500);
  panel.view!.readingPage = 1;
  h.activate(panel);
  h.start();
  await tick();
  assert.equal(h.reveals.at(-1)?.item, start);
});

test("follow does not open hidden views; visibility and external configuration changes resync it", async (t) => {
  const h = harness(true, false);
  t.after(h.dispose);
  const item = heading("Chapter", 1);
  h.activate(h.panel([item]));
  h.start();
  await tick();
  assert.equal(h.reveals.length, 0);
  h.visibility(true);
  await tick();
  assert.equal(h.reveals.at(-1)?.item, item);
  h.setting(false);
  h.visibility(false);
  h.visibility(true);
  await tick();
  assert.equal(h.reveals.length, 1);
  h.setting(true);
  await tick();
  assert.equal(h.reveals.length, 2);
  assert.equal(h.contexts.get(CONTEXT), true);
});

test("panel switches, a late outline and reloads rebuild parent lookup and follow the active panel", async (t) => {
  const h = harness(true);
  t.after(h.dispose);
  const first = heading("First panel", 1);
  const second = heading("Second panel", 1);
  const panel = h.panel([first]);
  h.activate(panel);
  h.start();
  await tick();
  const other = h.panel([]);
  other.outline = undefined;
  h.activate(other);
  await tick();
  other.outline = [second];
  h.changed();
  await tick();
  h.activate(panel);
  await tick();
  const rebuilt = heading("Rebuilt", 1);
  panel.outline = [rebuilt];
  h.changed();
  await tick();
  h.activate();
  await tick();
  assert.deepEqual(
    h.reveals.map((reveal) => reveal.item),
    [first, second, first, rebuilt],
  );
  assert.equal(h.provider.getChildren().length, 0);
  assert.equal(h.provider.getParent(first), undefined);
  assert.deepEqual(h.warnings, []);
});

test("page and panel changes during an asynchronous reveal finish with the newest item", async (t) => {
  const h = harness(true);
  t.after(h.dispose);
  const first = heading("First", 1);
  const second = heading("Second", 2);
  const latest = heading("Other panel", 4);
  const panel = h.panel([first, second]);
  h.activate(panel);
  let release!: () => void;
  h.hold(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  h.start();
  panel.view!.page = 2;
  h.changed();
  h.activate(h.panel([latest], 4));
  h.hold();
  release();
  await tick();
  assert.deepEqual(
    h.reveals.map((reveal) => reveal.item),
    [first, latest],
  );
});

test("Expand All reveals every node beyond the API depth limit without selecting or focusing", async (t) => {
  const h = harness();
  t.after(h.dispose);
  const leaf = heading("Leaf", 5);
  const root = heading("Root", 1, [
    heading("Two", 2, [heading("Three", 3, [heading("Four", 4, [leaf])])]),
  ]);
  h.activate(h.panel([root]));
  h.start();
  await h.command("expandOutline");
  assert.deepEqual(
    h.reveals.map((reveal) => reveal.item.title),
    ["Root", "Two", "Three", "Four", "Leaf"],
  );
  for (const reveal of h.reveals) {
    assert.deepEqual(reveal.options, {
      expand: true,
      select: false,
      focus: false,
    });
  }
});

test("Expand All stops if the active panel switches while a reveal is pending", async (t) => {
  const h = harness();
  t.after(h.dispose);
  const first = heading("First", 1, [heading("Child", 2)]);
  h.activate(h.panel([first]));
  h.start();
  let release!: () => void;
  h.hold(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const expanding = h.command("expandOutline");
  h.activate(h.panel([heading("Other panel", 1)]));
  h.hold();
  release();
  await expanding;
  assert.deepEqual(
    h.reveals.map((reveal) => reveal.item),
    [first],
  );
});

test("a failed reveal is logged and a later viewer change can retry following", async (t) => {
  const h = harness(true);
  t.after(h.dispose);
  const item = heading("Heading", 1);
  h.activate(h.panel([item]));
  h.hold(async () => {
    throw new Error("Tree unavailable");
  });
  h.start();
  await tick();
  assert.match(h.warnings[0]!, /Tree unavailable/u);
  h.hold();
  h.changed();
  await tick();
  assert.equal(h.reveals.at(-1)?.item, item);
  assert.equal(h.reveals.length, 2);
});

test("clicking an outline item still navigates to its page and offset", (t) => {
  const h = harness(true);
  t.after(h.dispose);
  const item = heading("Heading", 3, [], 120);
  const panel = h.panel([item], 3);
  h.activate(panel);
  h.start();
  const command = h.provider.getTreeItem(item).command!;
  h.command(command.command.replace("lumiere.pdf.", ""), ...command.arguments);
  assert.deepEqual(h.navigations, [{ panel, page: 3, top: 120 }]);
});

test("Go to Outline Item without a page opens a Quick Pick and navigates to the choice", async (t) => {
  const h = harness();
  t.after(h.dispose);
  const child = heading("Child", 2, [], 50);
  const panel = h.panel([heading("Chapter", 1, [child])]);
  h.activate(panel);
  h.start();
  h.setPick({ label: "Child" });
  await h.command("goToOutlineItem");
  assert.equal(h.picks.length, 1);
  const shown = h.picks[0] as {
    items: { label: string; description: string; detail?: string }[];
    options: { placeHolder?: string };
  };
  assert.deepEqual(
    shown.items.map((item) => [item.label, item.description, item.detail]),
    [
      ["Chapter", "p.1", undefined],
      ["Child", "p.2", "Chapter"],
    ],
  );
  assert.equal(shown.options.placeHolder, "Go to outline item…");
  assert.deepEqual(h.navigations, [{ panel, page: 2, top: 50 }]);
});

test("Go to Outline Item with an empty outline shows a placeholder and does not navigate", async (t) => {
  const h = harness();
  t.after(h.dispose);
  const panel = h.panel([]);
  h.activate(panel);
  h.start();
  await h.command("goToOutlineItem");
  const shown = h.picks[0] as {
    items: unknown[];
    options: { placeHolder?: string };
  };
  assert.deepEqual(shown.items, []);
  assert.equal(shown.options.placeHolder, "No outline in this PDF.");
  assert.equal(h.navigations.length, 0);
});

test("Go to Outline Item while outline is loading does not look like empty", async (t) => {
  const h = harness();
  t.after(h.dispose);
  const panel = h.panel([]);
  panel.outline = undefined;
  h.activate(panel);
  h.start();
  h.holdPick();
  const pending = h.command("goToOutlineItem");
  await tick();
  const shown = h.picks[0] as {
    items: unknown[];
    options: { placeHolder?: string };
  };
  assert.equal(shown.items.length, 0);
  assert.equal(shown.options.placeHolder, "Loading outline…");
  assert.equal(h.livePicker?.busy, true);
  assert.notEqual(
    shown.options.placeHolder,
    "No outline in this PDF.",
    "undefined (loading) must not use the empty-outline placeholder",
  );

  const outline = [heading("Chapter", 1)];
  panel.outline = outline;
  h.changed();
  await tick();
  assert.equal(h.livePicker?.busy, false);
  assert.equal(h.livePicker?.placeholder, "Go to outline item…");
  assert.deepEqual(
    h.livePicker?.items.map((item) => item.label),
    ["Chapter"],
  );

  h.setPick({ label: "Chapter" });
  h.releasePick();
  await pending;
  assert.deepEqual(h.navigations, [{ panel, page: 1, top: 0 }]);
});

test("Go to Outline Item ignores a choice after the outline reloads", async (t) => {
  const h = harness();
  t.after(h.dispose);
  const first = [heading("Old chapter", 1)];
  const panel = h.panel(first);
  h.activate(panel);
  h.start();
  h.holdPick();
  const pending = h.command("goToOutlineItem");
  await tick();
  const staleChoice = (
    h.picks[0] as { items: { label: string; page: number; outline: unknown }[] }
  ).items[0]!;
  assert.equal(staleChoice.label, "Old chapter");
  // Reload clears then replaces the outline while the picker is open.
  panel.outline = undefined;
  h.changed();
  await tick();
  panel.outline = [heading("New chapter", 2)];
  h.changed();
  await tick();
  // Accept the pre-reload row even though the picker now lists the new outline.
  h.releasePick(staleChoice);
  await pending;
  assert.equal(
    h.navigations.length,
    0,
    "a pick built from the previous outline must not navigate the reloaded PDF",
  );
});

test("Go to Outline Item ignores a choice after the outline view is disposed", async () => {
  const h = harness();
  const panel = h.panel([heading("Chapter", 1)]);
  h.activate(panel);
  h.start();
  h.holdPick();
  const pending = h.command("goToOutlineItem");
  await tick();
  h.setPick({ label: "Chapter" });
  h.dispose();
  h.releasePick();
  await pending;
  assert.equal(h.navigations.length, 0);
});

test("disposal stops event reactions and a reveal in flight cannot follow another node", async () => {
  const h = harness(true);
  const panel = h.panel([heading("First", 1), heading("Second", 2)]);
  h.activate(panel);
  let release!: () => void;
  h.hold(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  h.start();
  h.dispose();
  panel.view!.page = 2;
  h.changed();
  h.visibility(true);
  h.setting(true);
  h.hold();
  release();
  await tick();
  assert.equal(h.reveals.length, 1);
  assert.deepEqual(h.warnings, []);
});

test("outline actions contribute Expand All and mutually exclusive overflow Follow Cursor variants", () => {
  const contributes = pdfContributes<{
    commands: { command: string; title: string; icon?: string }[];
    menus: Record<string, { command: string; when: string; group?: string }[]>;
    configuration: {
      properties: Record<string, { type: string; default: boolean }>;
    };
  }>();
  assert.deepEqual(
    contributes.configuration.properties[SETTING]?.default,
    false,
  );
  assert.equal(contributes.configuration.properties[SETTING]?.type, "boolean");
  const menus = contributes.menus["view/title"]!;
  const expand = menus.find(
    (item) => item.command === "lumiere.pdf.expandOutline",
  )!;
  assert.equal(expand.when, "view == lumiere.pdf.outline");
  assert.equal(expand.group, "navigation@1");
  for (const [name, checked] of [
    ["enableOutlineFollowCursor", false],
    ["disableOutlineFollowCursor", true],
  ] as const) {
    const command = `lumiere.pdf.${name}`;
    const definition = contributes.commands.find(
      (item) => item.command === command,
    )!;
    assert.equal(definition.title, "Follow Cursor");
    assert.equal(definition.icon, checked ? "$(check)" : undefined);
    const menu = menus.find((item) => item.command === command)!;
    assert.equal(
      menu.when,
      `view == lumiere.pdf.outline && ${checked ? "" : "!"}${CONTEXT}`,
    );
    assert.ok(
      !menu.group?.startsWith("navigation"),
      "Follow Cursor belongs in the overflow menu",
    );
  }
});
