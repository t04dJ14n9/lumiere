import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import {
  gitDiffEditorHost,
  sideLabel,
} from "../../../src/plugins/gitDiffEditor/host";
import {
  describedComparison,
  titledComparison,
  urisForSides,
} from "../../../src/plugins/gitDiffEditor/comparison";
import { alignBlocks, rowMarkdown } from "../../../src/shared/diff";
import { createRenderer } from "../../../src/markdown/html";
import { definitions, diffRows } from "../../../src/webview/diff/rows";
import { stepChange } from "../../../src/webview/diff/step";
import { contributionId } from "../../../src/shared/setting-schema";
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

test("SCM uris become structured sides and Open Full Diff keeps them", () => {
  const described = describedComparison(gitUri("HEAD"), "file:///n.md");
  assert.equal(described.base.kind, "HEAD");
  assert.equal(described.target.kind, "WORKTREE");
  assert.equal(described.sourceState.worktreeBytes, undefined);
  assert.equal(
    titledComparison("n.md", "HEAD", "Working tree"),
    "n.md (HEAD → Working tree)",
  );
  const uris = urisForSides(
    "file:///n.md",
    { kind: "INDEX", fingerprint: "i" },
    { kind: "WORKTREE" },
    (uri, ref) => `git:${ref}:${uri}`,
  );
  assert.equal(uris?.original, "git:~:file:///n.md");
  assert.equal(uris?.modified, "file:///n.md");
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
  h.commands.get(contributionId("gitDiffEditor.open"))!();
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
  void h.commands.get(contributionId("gitDiffEditor.open"))!();
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
  h.commands.get(contributionId("gitDiffEditor.open"))!();
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
  void h.commands.get(contributionId("gitDiffEditor.open"))!();
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
const renderSide: Parameters<typeof diffRows>[2] = (markdown, options) =>
  renderer.renderMarkdown(markdown, options);

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

test("R3 B4: a reference definition with its destination on the next line", () => {
  const rows = diffRows(
    "Read [guide][g].\n\n[g]:\n  https://example.test/old\n",
    "Read [guide][g].\n\n[g]:\n  https://example.test/new\n",
    renderSide,
  );
  assert.match(rows[0]!.before!, /href="https:\/\/example.test\/old"/);
  assert.match(rows[0]!.after!, /href="https:\/\/example.test\/new"/);
  const definition = rows[1]!;
  assert.match(
    definition.before!,
    /mw-gd-line-del"> {2}https:\/\/example.test\/old/,
  );
  assert.match(
    definition.after!,
    /mw-gd-line-ins"> {2}https:\/\/example.test\/new/,
  );
});

test("R3 B4: the second of two adjacent footnote definitions is found", () => {
  const rows = diffRows(
    "Read[^b].\n\n[^a]: First note.\n[^b]: Second note.\n",
    "Reads[^b].\n\n[^a]: First note.\n[^b]: Second note.\n",
    renderSide,
  );
  assert.match(rows[0]!.after!, /Second note\./);
  assert.doesNotMatch(rows[0]!.after!, /First note\./);
  assert.match(rows[1]!.after!, /mw-gd-line/);
});

test("R3 B1: disabling while a read is pending drops its change listener at once", async () => {
  const h = slowHarness("native");
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  const fiber = root.plugin(gitDiffEditorHost);
  await root.settled();
  void h.commands.get(contributionId("gitDiffEditor.open"))!();
  await tick();
  assert.equal(h.changes.size, 1);
  await fiber.dispose();
  // Still pending: the listener must already be gone.
  assert.equal(h.changes.size, 0);
  h.head.resolve({ getText: () => "# T\n\nold\n" });
  await flush();
  assert.equal(h.changes.size, 0);
  assert.equal(h.shown.length, 0);
  await root.dispose();
});

test("R3 B2: disabling while the native tab closes restores the native diff", async () => {
  const h = harness("rendered");
  const natives: unknown[][] = [];
  Object.assign(h.workbench.diffViews, {
    async openNative(...args: unknown[]) {
      natives.push(args);
    },
  });
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  const fiber = root.plugin(gitDiffEditorHost);
  await root.settled();
  const closing = deferred<boolean>();
  let asked = false;
  h.opened.forEach((listener) =>
    listener(
      opened(() => {
        asked = true;
        return closing.promise;
      }),
    ),
  );
  await flush();
  assert.equal(asked, true);
  await fiber.dispose();
  closing.resolve(true);
  await flush();
  assert.equal(h.shown.filter((s) => !s.disposed).length, 0);
  assert.equal(natives.length, 1);
  assert.deepEqual(natives[0]!.slice(0, 2), [gitUri("HEAD"), "file:///n.md"]);
  assert.equal(h.changes.size, 0);
  await root.dispose();
});

test("R3: a failed command presentation releases its change listener", async () => {
  const h = harness("native");
  const errors: string[] = [];
  Object.assign(h.workbench, {
    error: (message: string) => void errors.push(message),
  });
  Object.assign(h.workbench.diffViews, {
    show() {
      throw new Error("webview failed");
    },
  });
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  root.plugin(gitDiffEditorHost);
  await root.settled();
  await Promise.resolve(
    h.commands.get(contributionId("gitDiffEditor.open"))!(),
  ).catch(() => {});
  await flush();
  assert.equal(errors.length, 1);
  assert.equal(h.changes.size, 0);
  await root.dispose();
});

test("R4-1: a quoted paragraph after a definition is not its title", () => {
  const source =
    'Read [guide][g].\n\n[g]: https://example.test/guide\n"Quoted paragraph" with **emphasis**.\n\nTail.\n';
  const changed = source.replace("Quoted paragraph", "Quoted words");
  for (const after of [source, changed]) {
    const rows = diffRows(source, after, renderSide);
    const all = rows.map((row) => row.after ?? "");
    assert.equal(rows.length, 3);
    assert.match(all[0]!, /href="https:\/\/example.test\/guide"/);
    assert.doesNotMatch(all[0]!, /Quoted/);
    assert.doesNotMatch(all[2]!, /Quoted/);
    assert.match(all[1]!, /<strong>emphasis<\/strong>/);
    assert.doesNotMatch(all[1]!, /mw-gd-lines/);
  }
});

test("R4-2: a definition inside a list item resolves references elsewhere", () => {
  const side = (url: string) => `- Item\n\n  [g]: ${url}\n\nRead [guide][g].\n`;
  const rows = diffRows(
    side("https://example.test/old"),
    side("https://example.test/new"),
    renderSide,
  );
  const last = rows.at(-1)!;
  assert.match(last.before!, /href="https:\/\/example.test\/old"/);
  assert.match(last.after!, /href="https:\/\/example.test\/new"/);
  // The definition stays in the list's row, not copied as visible text.
  assert.doesNotMatch(last.after!, /\[g\]:/);
  const quoted = diffRows(
    "> [q]: https://example.test/q\n\nSee [q].\n",
    "> [q]: https://example.test/q\n\nSee [q].\n",
    renderSide,
  );
  assert.match(quoted.at(-1)!.after!, /href="https:\/\/example.test\/q"/);
});

test("R4: link reference definitions follow CommonMark", () => {
  const defs = (text: string) =>
    definitions({ kind: "text", text, from: 0, to: 1 })?.map((d) => d.text);
  // Title on the same line, or on the next line, or spanning lines.
  assert.deepEqual(defs('[a]: /u "t"'), ['[a]: /u "t"']);
  assert.deepEqual(defs("[a]: /u\n'next line'"), ["[a]: /u\n'next line'"]);
  assert.deepEqual(defs('[a]: /u "one\ntwo"'), ['[a]: /u "one\ntwo"']);
  assert.deepEqual(defs("[a]: <with space> (paren title)"), [
    "[a]: <with space> (paren title)",
  ]);
  assert.deepEqual(defs("[a]:\n/u\n[b]: /v"), ["[a]:\n/u", "[b]: /v"]);
  // Junk after a title on the destination's line: not a definition.
  assert.equal(defs('[a]: /u "t" junk'), undefined);
  // An unclosed title on the next line: the definition ends before it, and
  // the block is not definitions only.
  assert.equal(defs('[a]: /u\n"never closed'), undefined);
  // No destination, or a label with an unescaped bracket.
  assert.equal(defs("[a]:"), undefined);
  assert.equal(defs("[a[b]: /u"), undefined);
  // Balanced parentheses in a destination.
  assert.deepEqual(defs("[a]: /u(x)y"), ["[a]: /u(x)y"]);
  // Footnotes: each its own record, continuation lines included.
  assert.deepEqual(defs("[^a]: one\n  more\n[^b]: two"), [
    "[^a]: one\n  more",
    "[^b]: two",
  ]);
});

test("angle reference destinations preserve escaped closers and reject malformed spans", () => {
  for (const text of [
    "[a]: <>",
    "[a]: <with space>",
    "[a]: <escaped\\>closer>",
  ]) {
    assert.equal(
      definitions({ kind: "text", text, from: 0, to: 1 })?.[0]?.text,
      text,
    );
  }
  for (const text of [
    "[a]: <nested<angle>",
    "[a]: <line\nbreak>",
    "[a]: <unclosed",
    "[a]: <escaped\\>",
  ]) {
    assert.equal(
      definitions({ kind: "text", text, from: 0, to: 1 }),
      undefined,
    );
  }
});

test("review: mid-document rules and setext headings survive equal and modified fragments", () => {
  const source = "# Intro\n\n---\nstatus: retained\n---\n\nTail.";
  for (const after of [source, source.replace("retained", "changed")]) {
    const rows = diffRows(source, after, renderSide);
    const left = rows.map((row) => row.before ?? "").join("");
    const right = rows.map((row) => row.after ?? "").join("");
    assert.match(left, /<hr>/);
    assert.match(left, /retained/);
    assert.match(right, /<hr>/);
    assert.match(right, after === source ? /retained/ : /changed/);
  }
  assert.equal(renderer.renderMarkdown("---\nstatus: retained\n---"), "");
});

for (const [kind, before, after] of [
  ["heading", "# Heading[^n]", "# Changed heading[^n]"],
  [
    "table",
    "| Value[^n] |\n| --- |\n| Cell[^n] |",
    "| Changed value[^n] |\n| --- |\n| Changed cell[^n] |",
  ],
] as const) {
  test(`review: equal and modified ${kind} fragments retain footnote context`, () => {
    const source = `${before}\n\n[^n]: Before explanation.`;
    for (const modified of [false, true]) {
      const target = modified ? `${after}\n\n[^n]: After explanation.` : source;
      const rows = diffRows(source, target, renderSide);
      const row = rows[0]!;
      assert.equal(row.kind, modified ? "modified" : "equal");
      for (const html of [row.before!, row.after!]) {
        assert.match(html, kind === "heading" ? /<h1/ : /<table/);
        assert.equal(
          (html.match(/class="footnote-ref"/g) ?? []).length,
          kind === "heading" ? 1 : 2,
        );
        assert.doesNotMatch(html, /\[\^n\]/);
      }
      assert.match(row.before!, /Before explanation/);
      assert.match(
        row.after!,
        modified ? /After explanation/ : /Before explanation/,
      );
    }
  });
}

test("review: an equal unclosed fence never gains reference definitions", () => {
  const source =
    "[g]: /target\n\n[^n]: Explanation.\n\n```text\nkeep exactly this[^n]";
  const rows = diffRows(source, source, renderSide);
  const fence = rows.find((row) => row.before?.includes("keep exactly this"))!;
  assert.equal(fence.kind, "equal");
  for (const html of [fence.before!, fence.after!]) {
    assert.doesNotMatch(html, /\[g\]:/);
    assert.doesNotMatch(html, /Explanation/);
    assert.match(html, /keep exactly this/);
  }
  const next = diffRows("[g]", "[g]", renderSide)[0]!;
  assert.doesNotMatch(
    next.before!,
    /href=/,
    "parser context cannot leak between renders",
  );
});

test("review: Git and file events refresh after both native documents close; disposal unsubscribes", async () => {
  const h = harness("rendered");
  const gitChanges = new Set<() => void>();
  const fileChanges = new Set<() => void>();
  const closedDocuments: { closed: boolean; uri: string; getText(): string }[] =
    [];
  Object.assign(h.workbench.git, {
    onDidChange(listener: () => void) {
      gitChanges.add(listener);
      return () => gitChanges.delete(listener);
    },
  });
  Object.assign(h.workbench, {
    watchFile(uri: string, listener: () => void) {
      assert.equal(uri, "file:///n.md");
      fileChanges.add(listener);
      return () => fileChanges.delete(listener);
    },
    async openDocument(uri: string) {
      const text = h.texts[uri]!;
      const document = {
        uri,
        closed: false,
        getText() {
          assert.equal(
            this.closed,
            false,
            "disposed documents must never be read",
          );
          return text;
        },
      };
      closedDocuments.push(document);
      return document;
    },
  });
  h.workbench.views.documentText = () => undefined as never;
  const root = Context.create();
  root.provide("workbench", h.workbench as never);
  root.plugin(gitDiffEditorHost);
  await root.settled();
  for (const open of h.opened) {
    open({
      original: gitUri(""),
      modified: "file:///n.md",
      column: 1,
      preview: false,
      async close() {
        closedDocuments.forEach((document) => {
          document.closed = true;
        });
        return true;
      },
    });
  }
  await tick();
  assert.equal(closedDocuments.length, 2);
  assert.ok(closedDocuments.every((document) => document.closed));
  h.texts[gitUri("")] = "externally staged";
  gitChanges.forEach((notify) => notify());
  await tick();
  assert.equal(h.shown[0]!.left.text, "externally staged");
  closedDocuments.forEach((document) => {
    document.closed = true;
  });
  h.texts["file:///n.md"] = "external disk write";
  fileChanges.forEach((notify) => notify());
  await tick();
  assert.equal(h.shown[0]!.right.text, "external disk write");
  h.disposeShown(0);
  assert.equal(gitChanges.size, 0);
  assert.equal(fileChanges.size, 0);
  assert.equal(h.changes.size, 0);
  await root.dispose();
});
