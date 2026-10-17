import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import {
  buildInline,
  ghostMarkdown,
} from "../../../src/plugins/gitInline/decorations";
import { computeHunks, hunkField } from "../../../src/plugins/gitGutter/hunks";
import { outerBlock, peekContext } from "../../../src/plugins/gitGutter/peek";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  PassOwner,
  adoptPass,
  newLifetime,
} from "../../../src/shared/render-lifetime";
import {
  HUNK_TOKENS,
  REBUILD_TOKENS,
} from "../../../src/plugins/gitInline/decorations";
import type { GitDiff } from "../../../src/plugins/gitGutter/api";
import type { RenderService } from "../../../src/plugins/render/api";
import { fixture } from "../features/fixture";
import { spawnSync } from "node:child_process";
import { wordDiffStats } from "../../../src/shared/diff";

const BASE =
  "# T\n\nReport it monthly.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nGone paragraph.\n\nend\n";
const NOW =
  "# T\n\nReport it per region.\n\n| a | b |\n|---|---|\n| 1 | 3 |\n\nend\nnew line\n";

function decorations(base = BASE, now = NOW, label = "HEAD (abc1234)") {
  const state = EditorState.create({
    doc: now,
    extensions: [hunkField, markdown({ base: markdownLanguage })],
  });
  // Blocks come from the syntax tree, which a busy machine may not have
  // finished parsing within the editor's time budget.
  ensureSyntaxTree(state, state.doc.length, 5000);
  const set = { hunks: computeHunks(base, state.doc), generation: 1 };
  const diff = {
    field: hunkField,
    label: () => label,
    blockRange: outerBlock,
    context: peekContext,
  } as unknown as GitDiff;
  const render = {} as RenderService;
  const found: {
    kind: string;
    at: number;
    text?: string;
    cls?: string;
    widget?: { eq(other: unknown): boolean };
  }[] = [];
  buildInline(state, set, { diff, render }).between(
    0,
    state.doc.length,
    (from, to, value) => {
      const spec = value.spec as {
        class?: string;
        widget?: {
          text?: string;
          model?: { markdown: string; kind: string };
          eq(other: unknown): boolean;
        };
        block?: boolean;
      };
      if (spec.widget?.model) {
        found.push({
          kind: `ghost:${spec.widget.model.kind}`,
          at: state.doc.lineAt(from).number,
          text: spec.widget.model.markdown,
          widget: spec.widget,
        });
      } else if (spec.widget) {
        found.push({ kind: "removed", at: from, text: spec.widget.text! });
      } else if (from === to) {
        found.push({
          kind: "line",
          at: state.doc.lineAt(from).number,
          cls: spec.class!,
        });
      } else {
        found.push({
          kind: "inserted",
          at: from,
          text: state.sliceDoc(from, to),
        });
      }
    },
  );
  return found;
}

test("prose changes are word marks; rendered blocks get a ghost of the old version", () => {
  const found = decorations();
  assert.deepEqual(
    found
      .filter((d) => d.kind === "removed" || d.kind === "inserted")
      .map((d) => [d.kind, d.text]),
    [
      ["removed", "monthly"],
      ["inserted", "per region"],
    ],
  );
  const ghosts = found.filter((d) => d.kind.startsWith("ghost"));
  assert.deepEqual(
    ghosts.map((d) => [d.kind, d.at]),
    [
      ["ghost:before", 5],
      ["ghost:removed", 9],
    ],
  );
  assert.match(ghosts[0]!.text!, /<del class="mw-gd-del">2<\/del>/);
  assert.match(ghosts[1]!.text!, /Gone paragraph\./);
  assert.deepEqual(
    found.filter((d) => d.kind === "line").map((d) => [d.at, d.cls]),
    [
      [7, "mw-gi-modified"],
      [10, "mw-gi-added"],
    ],
  );
});

test("ghostMarkdown keeps code changes as line spans", () => {
  assert.match(
    ghostMarkdown("```\na\nb\n```", "```\na\nc\n```"),
    /mw-gd-line-del">b</,
  );
});

test("inline changes wait for the change bars and leave with them", async () => {
  const f = fixture();
  const on = { enabled: true, config: {} };
  await f.configure({ gitInline: on });
  const inline = () =>
    [...f.root.plugins].find((fiber) => fiber.definition.name === "gitInline")!;
  assert.equal(inline().state, "pending");
  await f.configure({
    gitInline: on,
    gitGutter: { enabled: true, config: { compareTo: "HEAD" } },
  });
  assert.equal(inline().state, "active", String(inline().error));
  const both = f.extensions;
  await f.configure({ gitInline: on });
  assert.equal(inline().state, "pending");
  assert.ok(f.extensions < both);
  await f.configure({});
  assert.equal(f.extensions, 0);
  await f.root.dispose();
});

test("N4: a ghost shows the whole old table, fence or frontmatter, not the changed line", () => {
  const cases: [string, string, RegExp][] = [
    [
      "| a |\n| --- |\n| 1 |\n",
      "| a |\n| --- |\n| 2 |\n",
      /^\| a \|\n\| --- \|\n\| <del class="mw-gd-del">1<\/del> \|$/,
    ],
    [
      "```js\nconst x = 1;\n```\n",
      "```js\nconst x = 2;\n```\n",
      /^<pre class="mw-gd-lines mw-gd-code">.*mw-gd-line-del">const x = 1;/,
    ],
    [
      "---\nstatus: draft\n---\n# T\n",
      "---\nstatus: done\n---\n# T\n",
      /mw-gd-frontmatter.*mw-gd-line-del">status: draft/,
    ],
  ];
  for (const [base, now, expected] of cases) {
    const ghosts = decorations(base, now).filter((d) =>
      d.kind.startsWith("ghost"),
    );
    assert.equal(ghosts.length, 1, now);
    assert.match(ghosts[0]!.text!, expected);
  }
});

test("N5: a row added inside a table shows the table with the row marked as added", () => {
  const ghosts = decorations(
    "| a |\n| --- |\n| 1 |\n",
    "| a |\n| --- |\n| 1 |\n| 2 |\n",
  ).filter((d) => d.kind.startsWith("ghost"));
  assert.deepEqual(
    ghosts.map((d) => d.kind),
    ["ghost:added"],
  );
  assert.match(ghosts[0]!.text!, /<ins class="mw-gd-ins">/);
});

test("N6: a ghost is rebuilt when the baseline label or its raw text changes", () => {
  const a = decorations("A\n\nB\n\nC\n", "A\n\nC\n").find((d) =>
    d.kind.startsWith("ghost"),
  )!;
  const relabelled = decorations(
    "A\n\nB\n\nC\n",
    "A\n\nC\n",
    "HEAD (def5678)",
  ).find((d) => d.kind.startsWith("ghost"))!;
  const raw = decorations("A\n\nB\nC\n", "A\n\nC\n").find((d) =>
    d.kind.startsWith("ghost"),
  )!;
  assert.equal(a.widget!.eq(a.widget), true);
  assert.equal(a.widget!.eq(relabelled.widget), false);
  assert.equal(a.widget!.eq(raw.widget), false);
});

test("B3 (inline): long rewritten paragraphs fall back to lines within the rebuild budget", () => {
  const paragraphs = (unit: string) =>
    Array.from({ length: 10 }, () => unit.repeat(4000)).join("\n\n") + "\n";
  const started = performance.now();
  const found = decorations(paragraphs("a,"), paragraphs("b;"));
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1000, `${elapsed} ms`);
  assert.equal(found.filter((d) => d.kind === "removed").length, 0);
  assert.equal(found.filter((d) => d.kind === "ghost:before").length, 10);
  assert.ok(HUNK_TOKENS < REBUILD_TOKENS);
  // Short prose still gets word marks.
  assert.ok(decorations().some((d) => d.kind === "removed"));
});

test("B2 (inline): a late pass is disposed and the plugin's drain waits for it", async () => {
  const owner = new PassOwner();
  let disposed = 0;
  let resolve!: (pass: { dispose(): Promise<void> }) => void;
  const lifetime = newLifetime(owner);
  const adopted = adoptPass(
    lifetime,
    new Promise((r) => {
      resolve = r;
    }),
  );
  const drained = owner.drain();
  resolve({
    dispose: async () => {
      await new Promise((r) => setTimeout(r, 5));
      disposed++;
    },
  });
  assert.equal(await adopted, false);
  await drained;
  assert.equal(disposed, 1);
});

const ghostsOf = (base: string, now: string) =>
  decorations(base, now).filter((d) => d.kind.startsWith("ghost"));

test("F3: a removal ghost shows only the removed text, not its neighbours", () => {
  const middle = ghostsOf("A\n\nB\n\nC\n", "A\n\nC\n");
  assert.equal(middle.length, 1);
  assert.equal(middle[0]!.kind, "ghost:removed");
  assert.doesNotMatch(middle[0]!.text!, /C/);
  assert.match(middle[0]!.text!, /B/);
  const eof = ghostsOf("A\nB", "A");
  assert.equal(eof.length, 1);
  assert.doesNotMatch(eof[0]!.text!, /A/);
  assert.match(eof[0]!.text!, /B/);
  // The last body row of a table: the table is shown, only that row marked.
  const row = ghostsOf(
    "| a |\n| --- |\n| 1 |\n| 2 |\n",
    "| a |\n| --- |\n| 1 |\n",
  );
  assert.equal(row.length, 1);
  const text = row[0]!.text!;
  assert.match(text, /^\| a \|\n\| --- \|\n\| 1 \|\n/);
  assert.match(text, /<del class="mw-gd-del">2<\/del>/);
  assert.doesNotMatch(text, /<del class="mw-gd-del">(a|1)<\/del>/);
});

test("F2: once the budget is spent no word diff runs, directly or via ghosts", () => {
  const count = () => wordDiffStats.calls;
  // One oversized hunk: 80 000 characters a paragraph, rewritten.
  const huge = (unit: string) =>
    Array.from({ length: 10 }, () => unit.repeat(40_000)).join("\n\n") + "\n";
  let before = count();
  let tokensBefore = wordDiffStats.tokens;
  const started = performance.now();
  decorations(huge("a,"), huge("b;"));
  assert.ok(performance.now() - started < 2000);
  assert.equal(count() - before, 0, "word diffs on oversized hunks");
  assert.equal(wordDiffStats.tokens - tokensBefore, 0);
  // Thirty individually affordable hunks: the rebuild budget caps the total.
  const words = (w: string) =>
    Array.from({ length: 30 }, () => `${w} `.repeat(300).trim()).join("\n\n") +
    "\n";
  tokensBefore = wordDiffStats.tokens;
  before = count();
  decorations(words("x"), words("y"));
  assert.ok(wordDiffStats.tokens - tokensBefore <= REBUILD_TOKENS);
  assert.ok(count() - before < 30);
  // Tables and rendered blocks spend from the same budget.
  const table = (v: string) =>
    "| a |\n| --- |\n" +
    Array.from({ length: 40 }, () => `| ${`${v} `.repeat(200)} |`).join("\n") +
    "\n";
  tokensBefore = wordDiffStats.tokens;
  decorations(table("x"), table("y"));
  assert.ok(wordDiffStats.tokens - tokensBefore <= REBUILD_TOKENS);
});

test("R3-B1: a few very long tokens are not word-diffed and do not stall", () => {
  const table = (c: string) => `| value |\n| --- |\n| ${c.repeat(80_000)} |\n`;
  let started = performance.now();
  const calls = wordDiffStats.calls;
  decorations(table("a"), table("b"));
  assert.ok(performance.now() - started < 1000);
  // 80 000-character rows: past the character cap, shown line by line.
  assert.equal(wordDiffStats.calls, calls);
  const prose = (c: string) => `Intro ${c.repeat(80_000)} end.\n`;
  started = performance.now();
  const found = decorations(prose("a"), prose("b"));
  assert.ok(performance.now() - started < 1000);
  assert.equal(found.filter((d) => d.kind === "removed").length, 0);
  assert.equal(found.filter((d) => d.kind === "ghost:before").length, 1);
  assert.equal(wordDiffStats.calls, calls);
});

/** Run `decorations(base, now)` in a child process with a hard deadline. */
function timed(name: string, base: string, now: string) {
  const script = `
    const { EditorState } = require("@codemirror/state");
    const { markdown, markdownLanguage } = require("@codemirror/lang-markdown");
    const { buildInline } = require("./src/plugins/gitInline/decorations");
    const { computeHunks, hunkField } = require("./src/plugins/gitGutter/hunks");
    const { outerBlock, peekContext } = require("./src/plugins/gitGutter/peek");
    const [base, now] = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const state = EditorState.create({ doc: now, extensions: [hunkField, markdown({ base: markdownLanguage })] });
    const diff = { field: hunkField, label: () => "HEAD", blockRange: outerBlock, context: peekContext };
    const started = performance.now();
    const set = buildInline(state, { hunks: computeHunks(base, state.doc), generation: 1 }, { diff, render: {} });
    let ghosts = 0;
    set.between(0, state.doc.length, (f, t, v) => { if (v.spec.widget && v.spec.widget.model) ghosts++; });
    process.stdout.write(JSON.stringify({ ms: performance.now() - started, ghosts }));
  `;
  const run = spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
    input: JSON.stringify([base, now]),
    timeout: 8000,
    encoding: "utf8",
  });
  assert.equal(run.signal, null, `${name}: killed after 8 s (stalled)`);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout) as { ms: number; ghosts: number };
}

test("R4-B1 (inline): admitted table rows with long inner whitespace build fast", () => {
  const now = "| value |\n| --- |\n| keep |\n";
  const removedRow = `| a${" ".repeat(19_000)}b |\n`;
  const { ms, ghosts } = timed(
    "inner-spaces",
    now + removedRow.repeat(10),
    now,
  );
  assert.ok(ms < 1500, `${ms} ms`);
  assert.equal(ghosts, 1);
});

test("R4-B2: a heavily indented non-separator row is rejected fast", () => {
  const now = "| value |\n| --- |\n| keep |\n";
  const { ms } = timed(
    "indented-row",
    now + `${" ".repeat(80_000)}| a |\n`,
    now,
  );
  assert.ok(ms < 1500, `${ms} ms`);
});

test("R4-B2: table separators are still recognised", () => {
  for (const separator of ["| --- |", "|:---:|", "  |---|", "| :-- | --: |"]) {
    const after = ghostMarkdown(
      "| a |\n",
      `| a |\n${separator}\n| 1 |\n`,
      "after",
    );
    assert.ok(after.includes(`\n${separator}\n`), after);
    assert.match(after, /<ins class="mw-gd-ins">1<\/ins>/);
  }
  // Not separators: marked as rows.
  const row = ghostMarkdown("| a |\n", "| a |\n| a- |\n", "after");
  assert.match(row, /<ins/);
});

test("R4: the character budget runs out across hunks while tokens remain", () => {
  // 12 paragraphs of 9 000 characters, one token a side: 18 000 a hunk.
  const para = (c: string) =>
    Array.from({ length: 12 }, () => c.repeat(9_000)).join("\n\n") + "\n";
  const before = wordDiffStats.calls;
  decorations(para("a"), para("b"));
  // 200 000 / 18 000 per hunk: eleven word diffs fit, the twelfth is lines.
  assert.equal(wordDiffStats.calls - before, 11);
});
