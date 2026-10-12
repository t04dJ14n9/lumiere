import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import {
  gitDiffEditorHost,
  sideLabel,
} from "../../../src/plugins/gitDiffEditor/host";
import { alignBlocks, rowMarkdown } from "../../../src/shared/diff";
import { createRenderer } from "../../../src/markdown/html";
import { diffRows } from "../../../src/webview/diff/rows";
import { stepChange } from "../../../src/webview/diff/step";
import type {
  DiffPanel,
  DiffSide,
  DiffViews,
  OpenedDiff,
} from "../../../src/shared/git";

const gitUri = (ref: string) =>
  `git:/n.md?${encodeURIComponent(JSON.stringify({ path: "/n.md", ref }))}`;

test("sideLabel names each side of a git diff", () => {
  assert.equal(sideLabel("file:///n.md"), "Working tree");
  assert.equal(sideLabel(gitUri("HEAD")), "HEAD");
  assert.equal(sideLabel(gitUri("")), "Index");
  assert.equal(sideLabel(gitUri("~")), "Index");
  assert.equal(sideLabel(gitUri("a".repeat(40))), "aaaaaaa");
  assert.equal(sideLabel("git:/n.md?not-json"), "Git");
});

test("rowMarkdown keeps an unchanged frontmatter visible as lines", () => {
  const text = "---\ntype: Metric\n---\n\n# T\n";
  const [row] = alignBlocks(text, text);
  const md = rowMarkdown(row!);
  assert.match(md.before!, /^<pre class="mw-gd-lines mw-gd-frontmatter">/);
  assert.match(md.after!, /type: Metric/);
  assert.doesNotMatch(md.after!, /mw-gd-line-(ins|del)/);
});

interface Shown {
  left: DiffSide;
  right: DiffSide;
  disposed: boolean;
  updates: number;
}

function harness(mode: "native" | "rendered") {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const opened = new Set<(diff: OpenedDiff) => void>();
  const shown: Shown[] = [];
  const panels: DiffPanel[] = [];
  const changes = new Set<(document: { uri: string }) => void>();
  const texts: Record<string, string> = {
    "file:///n.md": "# T\n\nnew\n",
    [gitUri("HEAD")]: "# T\n\nold\n",
    [gitUri("")]: "# T\n\nstaged\n",
  };
  const diffViews: DiffViews = {
    onDidOpenDiff(listener) {
      opened.add(listener);
      return () => void opened.delete(listener);
    },
    async openNative() {},
    show(options) {
      const record: Shown = { ...options, disposed: false, updates: 0 };
      shown.push(record);
      const listeners = new Set<() => void>();
      const panel: DiffPanel = {
        update(left, right) {
          record.right = right;
          record.left = left;
          record.updates++;
        },
        onDispose(listener) {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
        dispose() {
          record.disposed = true;
          listeners.forEach((listener) => listener());
        },
      };
      panels.push(panel);
      return panel;
    },
  };
  const workbench = {
    diffViews,
    git: { toGitUri: (_uri: string, ref: string) => gitUri(ref) },
    views: {
      command(id: string, run: (...args: unknown[]) => unknown) {
        commands.set(id, run);
        return () => commands.delete(id);
      },
      setting: () => mode,
      activeNote: () => "file:///n.md",
      documentText: (uri: string) => texts[uri],
    },
    onChange(listener: (document: { uri: string }) => void) {
      changes.add(listener);
      return () => changes.delete(listener);
    },
    error(message: string) {
      throw new Error(message);
    },
    async execute() {},
  };
  const disposeShown = (index: number) => panels[index]!.dispose();
  return { workbench, commands, opened, shown, changes, texts, disposeShown };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("host: the command opens HEAD against the note and follows edits; off disposes panels", async () => {
  const h = harness("native");
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  const fiber = root.plugin(gitDiffEditorHost);
  await root.settled();
  h.commands.get("markdownWorkbench.gitDiffEditor.open")!();
  await tick();
  await tick();
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0]!.left.label, "HEAD");
  assert.equal(h.shown[0]!.right.text, "# T\n\nnew\n");
  h.texts["file:///n.md"] = "# T\n\nnewer\n";
  h.changes.forEach((listener) => listener({ uri: "file:///n.md" }));
  await tick();
  assert.equal(h.shown[0]!.right.text, "# T\n\nnewer\n");
  // In native mode, VS Code's own diffs are left alone.
  assert.equal(h.opened.size, 1);
  let closed = false;
  h.opened.forEach((listener) =>
    listener({
      original: gitUri("HEAD"),
      modified: "file:///n.md",
      column: 1,
      preview: true,
      close: async () => {
        closed = true;
        return true;
      },
    }),
  );
  await tick();
  assert.equal(closed, false);
  assert.equal(h.shown.length, 1);
  await fiber.dispose();
  assert.equal(h.shown[0]!.disposed, true);
  assert.equal(h.commands.size, 0);
  assert.equal(h.opened.size, 0);
  assert.equal(h.changes.size, 0);
  await root.dispose();
});

test("host: in rendered mode a Markdown text diff is replaced by the rendered panel", async () => {
  const h = harness("rendered");
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  root.plugin(gitDiffEditorHost);
  await root.settled();
  let closed = false;
  h.opened.forEach((listener) =>
    listener({
      original: gitUri(""),
      modified: "file:///n.md",
      column: 2,
      preview: true,
      close: async () => {
        closed = true;
        return true;
      },
    }),
  );
  await tick();
  await tick();
  assert.equal(closed, true);
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0]!.left.label, "Index");
  await root.dispose();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A harness whose HEAD side is read through a held openDocument. */
function slowHarness(mode: "native" | "rendered") {
  const h = harness(mode);
  const head = deferred<{ getText(): string }>();
  const errors: string[] = [];
  delete h.texts[gitUri("HEAD")];
  delete h.texts[gitUri("")];
  Object.assign(h.workbench, {
    openDocument: () => head.promise,
    error: (message: string) => void errors.push(message),
  });
  return { ...h, head, errors };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await tick();
  }
};

test("B1: an open still reading when the plugin is turned off creates nothing", async () => {
  const h = slowHarness("native");
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  const fiber = root.plugin(gitDiffEditorHost);
  await root.settled();
  void h.commands.get("markdownWorkbench.gitDiffEditor.open")!();
  await tick();
  await fiber.dispose();
  h.head.resolve({ getText: () => "# T\n\nold\n" });
  await flush();
  assert.equal(h.shown.length, 0);
  assert.equal(h.changes.size, 0);
  await root.dispose();
});

test("B1: an update queued before its panel closes is dropped", async () => {
  const h = harness("native");
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  root.plugin(gitDiffEditorHost);
  await root.settled();
  h.commands.get("markdownWorkbench.gitDiffEditor.open")!();
  await flush();
  assert.equal(h.shown.length, 1);
  h.texts["file:///n.md"] = "# T\n\nnewer\n";
  h.changes.forEach((listener) => listener({ uri: "file:///n.md" }));
  // Close the panel before the queued read completes.
  const record = h.shown[0]!;
  h.disposeShown(0);
  await flush();
  assert.equal(record.updates, 0);
  assert.equal(h.changes.size, 0);
  await root.dispose();
});

test("B3: an edit while the baseline loads is in the first comparison", async () => {
  const h = slowHarness("native");
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  root.plugin(gitDiffEditorHost);
  await root.settled();
  void h.commands.get("markdownWorkbench.gitDiffEditor.open")!();
  await tick();
  h.texts["file:///n.md"] = "# T\n\nedited\n";
  h.changes.forEach((listener) => listener({ uri: "file:///n.md" }));
  h.head.resolve({ getText: () => "# T\n\nold\n" });
  await flush();
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0]!.right.text, "# T\n\nedited\n");
  await root.dispose();
});

function opened(
  close: () => Promise<boolean>,
  original = gitUri("HEAD"),
): OpenedDiff {
  return {
    original,
    modified: "file:///n.md",
    column: 1,
    preview: false,
    close,
  };
}

test("B2: takeover keeps the native diff when it cannot be closed or replaced", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => void unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  try {
    // Dirty tab / refused close, and a close that rejects: no panel.
    for (const close of [
      async () => false,
      async () => {
        throw new Error("close failed");
      },
    ]) {
      const h = slowHarness("rendered");
      h.head.resolve({ getText: () => "# T\n\nold\n" });
      const root = Context.create();
      root.provide("workbench", h.workbench as never);
      root.plugin(gitDiffEditorHost);
      await root.settled();
      h.opened.forEach((listener) => listener(opened(close)));
      await flush();
      assert.equal(h.shown.length, 0);
      await root.dispose();
    }
    // A side that cannot be read: the native tab is never closed.
    {
      const h = slowHarness("rendered");
      h.head.reject(new Error("no such revision"));
      const root = Context.create();
      root.provide("workbench", h.workbench as never);
      root.plugin(gitDiffEditorHost);
      await root.settled();
      let closed = false;
      h.opened.forEach((listener) =>
        listener(
          opened(async () => {
            closed = true;
            return true;
          }),
        ),
      );
      await flush();
      assert.equal(closed, false);
      assert.equal(h.shown.length, 0);
      assert.equal(h.errors.length, 1);
      await root.dispose();
    }
    // The replacement fails after the native tab closed: it is reopened.
    {
      const h = harness("rendered");
      const natives: unknown[][] = [];
      const errors: string[] = [];
      Object.assign(h.workbench, {
        error: (message: string) => void errors.push(message),
      });
      Object.assign(h.workbench.diffViews, {
        show() {
          throw new Error("webview failed");
        },
        async openNative(...args: unknown[]) {
          natives.push(args);
        },
      });
      const root = Context.create();
      root.provide("workbench", h.workbench as never);
      root.plugin(gitDiffEditorHost);
      await root.settled();
      h.opened.forEach((listener) => listener(opened(async () => true)));
      await flush();
      assert.equal(natives.length, 1);
      assert.deepEqual(natives[0]!.slice(0, 2), [
        gitUri("HEAD"),
        "file:///n.md",
      ]);
      assert.equal(errors.length, 1);
      await root.dispose();
    }
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("S5: Previous from no selection picks the last change, Next the first", () => {
  assert.equal(stepChange(-1, -1, 3), 2);
  assert.equal(stepChange(-1, 1, 3), 0);
  assert.equal(stepChange(0, -1, 3), 2);
  assert.equal(stepChange(2, 1, 3), 0);
  assert.equal(stepChange(-1, -1, 1), 0);
  assert.equal(stepChange(-1, 1, 0), -1);
});

const renderer = createRenderer();
const renderSide = (markdown: string) => renderer.renderMarkdown(markdown);

test("B4: a reference link renders with its definition from another block", () => {
  const rows = diffRows(
    "Read [guide][g].\n\n[g]: https://example.test/old\n",
    "Read [guide][g].\n\n[g]: https://example.test/new\n",
    renderSide,
  );
  const paragraph = rows[0]!;
  assert.match(paragraph.before!, /href="https:\/\/example.test\/old"/);
  assert.match(paragraph.after!, /href="https:\/\/example.test\/new"/);
  // The definition row shows its source, the destination change marked.
  const definition = rows[1]!;
  assert.equal(definition.kind, "modified");
  assert.match(
    definition.before!,
    /mw-gd-line-del">\[g\]: https:\/\/example.test\/old/,
  );
  assert.match(
    definition.after!,
    /mw-gd-line-ins">\[g\]: https:\/\/example.test\/new/,
  );
});

test("B4: a footnote defined in another block is shown with its reference", () => {
  const rows = diffRows(
    "Note[^1] here.\n\n[^1]: The foot.\n",
    "Notes[^1] here.\n\n[^1]: The foot.\n",
    renderSide,
  );
  assert.equal(rows[0]!.kind, "modified");
  assert.match(rows[0]!.after!, /The foot\./);
  assert.match(rows[0]!.after!, /footnote-ref/);
});

test("B4: a list item's later paragraphs stay inside the list", () => {
  const before = "- a\n\n    more of a\n- b\n";
  const after = "- a\n\n    more of a\n- c\n";
  const rows = diffRows(before, after, renderSide);
  for (const row of rows) {
    for (const html of [row.before, row.after]) {
      assert.doesNotMatch(html ?? "", /<pre><code>/);
    }
  }
  assert.ok(rows.some((row) => /<li>[\s\S]*more of a/.test(row.after ?? "")));
});
