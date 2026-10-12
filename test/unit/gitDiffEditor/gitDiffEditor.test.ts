import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import {
  gitDiffEditorHost,
  sideLabel,
} from "../../../src/plugins/gitDiffEditor/host";
import { alignBlocks, rowMarkdown } from "../../../src/shared/diff";
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
  const changes = new Set<(document: { uri: string }) => void>();
  const texts: Record<string, string> = {
    "file:///n.md": "# T\n\nnew\n",
    [gitUri("HEAD")]: "# T\n\nold\n",
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
  return { workbench, commands, opened, shown, changes, texts };
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
