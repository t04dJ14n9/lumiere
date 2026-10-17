import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../markdown/metadata";
import type { OkfBundle } from "../okfCore/api";
import { presentSnapshot } from "./snapshot";
import type { GraphNote } from "./project";

const bundle: OkfBundle = {
  id: "vault:bundle",
  name: "bundle",
  root: "bundle",
  vaultRoot: "/vault",
};

function note(path: string, body: string): GraphNote {
  return { path, metadata: metadata(body) };
}

test("a graph snapshot keeps nonconformant notes and refuses an oversized payload", () => {
  const description = "d".repeat(4000);
  const notes: GraphNote[] = [
    note("bundle/metrics/topic.md", "---\ntype: metric\ntitle: Topic\n---\n"),
  ];
  for (let index = 0; index < 400; index += 1) {
    notes.push(
      note(`bundle/n${index}.md`, `---\ndescription: ${description}\n---\n`),
    );
  }
  const snapshot = presentSnapshot({
    bundle,
    notes,
    resolve: () => ({ status: "missing" }),
    completeness: "ready",
    generation: 1,
    mode: "global",
    depth: 2,
    colorBy: "type",
    filters: {
      types: [],
      tags: [],
      folders: [],
      text: "",
      orphans: false,
      conformantOnly: false,
    },
    maxNodes: 2000,
    maxEdges: 20000,
  });
  assert.equal(snapshot.accepted, false);
  assert.equal(snapshot.nodes.length, 0);
  assert.match(snapshot.reason ?? "", /too large/);
  assert.ok(snapshot.facets.types.includes("metric"));
});

test("paths that cannot fit the protocol are left out of the drawing", () => {
  const snapshot = presentSnapshot({
    bundle,
    notes: [
      note("bundle/ok.md", "---\ntype: metric\n---\n"),
      note(`bundle/${"p".repeat(1100)}.md`, "---\ntype: metric\n---\n"),
    ],
    resolve: () => ({ status: "missing" }),
    completeness: "indexing",
    generation: 2,
    mode: "global",
    depth: 2,
    colorBy: "type",
    filters: {
      types: [],
      tags: [],
      folders: [],
      text: "",
      orphans: false,
      conformantOnly: false,
    },
    maxNodes: 2000,
    maxEdges: 20000,
  });
  assert.deepEqual(
    snapshot.nodes.map((node) => node.path),
    ["bundle/ok.md"],
  );
  assert.equal(snapshot.completeness, "indexing");
});
