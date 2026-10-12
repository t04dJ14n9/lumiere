import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import {
  buildInline,
  ghostMarkdown,
} from "../../../src/plugins/gitInline/decorations";
import { computeHunks, hunkField } from "../../../src/plugins/gitGutter/hunks";
import { outerBlock } from "../../../src/plugins/gitGutter/peek";
import type { GitDiff } from "../../../src/plugins/gitGutter/api";
import type { RenderService } from "../../../src/plugins/render/api";
import { fixture } from "../features/fixture";

const BASE =
  "# T\n\nReport it monthly.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nGone paragraph.\n\nend\n";
const NOW =
  "# T\n\nReport it per region.\n\n| a | b |\n|---|---|\n| 1 | 3 |\n\nend\nnew line\n";

function decorations() {
  const state = EditorState.create({ doc: NOW, extensions: [hunkField] });
  const set = { hunks: computeHunks(BASE, state.doc), generation: 1 };
  const diff = {
    field: hunkField,
    label: () => "HEAD (abc1234)",
    blockRange: outerBlock,
  } as unknown as GitDiff;
  const render = {} as RenderService;
  const found: { kind: string; at: number; text?: string; cls?: string }[] = [];
  buildInline(state, set, { diff, render }).between(
    0,
    state.doc.length,
    (from, to, value) => {
      const spec = value.spec as {
        class?: string;
        widget?: { text?: string; markdown?: string; hunk?: { kind: string } };
        block?: boolean;
      };
      if (spec.widget?.markdown !== undefined) {
        found.push({
          kind: `ghost:${spec.widget.hunk!.kind}`,
          at: state.doc.lineAt(from).number,
          text: spec.widget.markdown,
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
      ["ghost:modified", 7],
      ["ghost:deleted", 9],
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
    [...f.root.runtime.fibers].find(
      (fiber) => fiber.definition.name === "gitInline",
    )!;
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
