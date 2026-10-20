import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../markdown/metadata";
import { admit, isCurrentGeneration } from "./admission";
import {
  emptyFilters,
  filterGraph,
  folderMatches,
  localGraph,
} from "./filters";
import { buildConceptGraph } from "./project";
import type { GraphNote, ResolvedTarget } from "./project";

const files = new Map<string, string>([
  ["bundle/metrics/topic.md", "bundle/metrics/topic.md"],
  ["metrics/topic.md", "metrics/topic.md"],
  ["bundle/index.md", "bundle/index.md"],
  ["bundle/notes/plain.md", "bundle/notes/plain.md"],
  ["bundle/assets/figure.png", "bundle/assets/figure.png"],
]);

function resolve(linktext: string): ResolvedTarget {
  if (linktext.startsWith("/")) {
    const path = `bundle/${linktext.slice(1)}`.replace(/\.md$/, "");
    const withMd = path.endsWith(".png") ? path : `${path}.md`;
    return files.has(withMd)
      ? { status: "file", path: withMd }
      : { status: "missing" };
  }
  return { status: "missing" };
}

function notes(): GraphNote[] {
  return [
    {
      path: "bundle/metrics/topic.md",
      metadata: metadata(
        "---\ntype: metric\ntitle: Topic\ndescription: A margin\ntags: [alpha]\n---\nSee [index](/index.md), [gone](/missing.md), [self](/metrics/topic.md) and [pic](/assets/figure.png).",
      ),
    },
    {
      path: "bundle/notes/plain.md",
      metadata: metadata(
        "See [topic](/metrics/topic.md) twice [again](/metrics/topic.md).",
      ),
    },
    {
      path: "bundle/notes/back.md",
      metadata: metadata("---\ntype: note\n---\nSee [plain](/notes/plain.md)."),
    },
    {
      path: "bundle/index.md",
      metadata: metadata("---\ntype: index\n---\n"),
    },
    {
      path: "bundle/log.md",
      metadata: metadata("log"),
    },
    { path: "bundle/notes/alone.md" },
  ];
}

test("the builder keeps nonconformant notes, drops reserved files, and classifies targets", () => {
  const graph = buildConceptGraph({
    bundleRoot: "bundle",
    notes: notes(),
    resolve: (linktext) => resolve(linktext),
  });
  const paths = graph.nodes.map((node) => node.path);
  assert.ok(paths.includes("bundle/notes/plain.md"));
  assert.equal(paths.includes("bundle/index.md"), false);
  assert.equal(paths.includes("bundle/log.md"), false);
  const plain = graph.nodes.find(
    (node) => node.path === "bundle/notes/plain.md",
  );
  assert.equal(plain?.classification, "nonconformant");
  const topic = graph.nodes.find(
    (node) => node.path === "bundle/metrics/topic.md",
  );
  assert.equal(topic?.classification, "conformant");
  assert.equal(topic?.title, "Topic");
  assert.equal(topic?.navigation, 1);
  assert.equal(topic?.unresolved, 1);
  assert.equal(topic?.assets, 1);
  assert.equal(
    graph.edges.some(
      (edge) => edge.source === topic?.id && edge.target === topic?.id,
    ),
    false,
  );
  const toPlain = graph.edges.find(
    (edge) =>
      edge.source === "bundle/notes/plain.md" &&
      edge.target === "bundle/metrics/topic.md",
  );
  assert.equal(toPlain?.count, 2);
  const back = graph.edges.find(
    (edge) =>
      edge.source === "bundle/notes/back.md" &&
      edge.target === "bundle/notes/plain.md",
  );
  assert.ok(back);
  assert.equal(topic?.degree, 1);
});

test("orphans are decided before filters, and an excluded focus is not retargeted", () => {
  const graph = buildConceptGraph({
    bundleRoot: "bundle",
    notes: notes(),
    resolve: (linktext) => resolve(linktext),
  });
  const alone = graph.nodes.find((node) => node.id === "bundle/notes/alone.md");
  assert.equal(alone?.orphan, true);
  assert.equal(alone?.classification, "indexing");
  const filtered = filterGraph(graph, {
    ...emptyFilters(),
    types: ["metric"],
  });
  assert.deepEqual(
    filtered.graph.nodes.map((node) => node.id),
    ["bundle/metrics/topic.md"],
  );
  const local = localGraph(filtered.graph, "bundle/notes/plain.md", 2);
  assert.equal(local.focusExcluded, true);
  assert.equal(local.graph.nodes.length, 0);
});

test("folder prefixes match path segments, and conformant-only reports the omission", () => {
  assert.equal(folderMatches("bundle/notes", "bundle"), true);
  assert.equal(folderMatches("bundle-old/notes", "bundle"), false);
  const graph = buildConceptGraph({
    bundleRoot: "bundle",
    notes: notes(),
    resolve: (linktext) => resolve(linktext),
  });
  const filtered = filterGraph(graph, {
    ...emptyFilters(),
    conformantOnly: true,
  });
  assert.ok(filtered.omittedConformant >= 1);
  assert.ok(
    filtered.graph.nodes.every((node) => node.classification === "conformant"),
  );
});

test("admission refuses over-cap graphs and stale generations are ignored", () => {
  const nodes = Array.from({ length: 3 }, (_, index) => ({
    id: String(index),
  }));
  assert.equal(
    admit(nodes, [], { maxNodes: 2000, maxEdges: 20000 }).accepted,
    true,
  );
  const refused = admit(nodes, [], { maxNodes: 2, maxEdges: 20000 });
  assert.equal(refused.accepted, false);
  assert.equal(refused.nodeCount, 3);
  assert.equal(isCurrentGeneration(4, 4), false);
  assert.equal(isCurrentGeneration(4, 5), true);
});

test("frontmatter wikilinks count as concept edges like Obsidian", () => {
  const graph = buildConceptGraph({
    bundleRoot: "bundle",
    notes: [
      {
        path: "bundle/notes/from.md",
        metadata: metadata('---\nup: "[[plain]]"\n---\nNo body link.'),
      },
      {
        path: "bundle/notes/plain.md",
        metadata: metadata("plain body"),
      },
    ],
    resolve: (linktext) =>
      linktext === "plain"
        ? { status: "file", path: "bundle/notes/plain.md" }
        : { status: "missing" },
  });
  const edge = graph.edges.find(
    (item) =>
      item.source === "bundle/notes/from.md" &&
      item.target === "bundle/notes/plain.md",
  );
  assert.ok(edge);
  assert.equal(edge?.count, 1);
  const from = graph.nodes.find((node) => node.id === "bundle/notes/from.md");
  assert.equal(from?.degree, 1);
  assert.equal(from?.orphan, false);
});

test("OKF sources path resources count as concept edges", () => {
  const graph = buildConceptGraph({
    bundleRoot: "bundle",
    notes: [
      {
        path: "bundle/notes/from.md",
        metadata: metadata(
          "---\nsources:\n  - resource: plain.md\n    title: Plain\n  - resource: https://example.com/paper\n---\nNo body link.",
        ),
      },
      {
        path: "bundle/notes/plain.md",
        metadata: metadata("plain body"),
      },
    ],
    resolve: () => ({ status: "missing" }),
  });
  const edge = graph.edges.find(
    (item) =>
      item.source === "bundle/notes/from.md" &&
      item.target === "bundle/notes/plain.md",
  );
  assert.ok(edge);
  assert.equal(edge?.count, 1);
  const from = graph.nodes.find((node) => node.id === "bundle/notes/from.md");
  assert.equal(from?.degree, 1);
  assert.equal(from?.orphan, false);
  // http(s) sources are not graph nodes / edges
  assert.equal(from?.outOfScope ?? 0, 0);
  assert.equal(from?.unresolved ?? 0, 0);
});

test("sources wiki resources stay on frontmatterLinks (no double edge)", () => {
  const graph = buildConceptGraph({
    bundleRoot: "bundle",
    notes: [
      {
        path: "bundle/notes/from.md",
        metadata: metadata(
          '---\nsources:\n  - resource: "[[plain]]"\n---\nNo body link.',
        ),
      },
      {
        path: "bundle/notes/plain.md",
        metadata: metadata("plain body"),
      },
    ],
    resolve: (linktext) =>
      linktext === "plain"
        ? { status: "file", path: "bundle/notes/plain.md" }
        : { status: "missing" },
  });
  const edges = graph.edges.filter(
    (item) =>
      item.source === "bundle/notes/from.md" &&
      item.target === "bundle/notes/plain.md",
  );
  assert.equal(edges.length, 1);
  assert.equal(edges[0]?.count, 1);
});

test("sources asset paths count as assets, not concept edges", () => {
  const graph = buildConceptGraph({
    bundleRoot: "bundle",
    notes: [
      {
        path: "bundle/notes/from.md",
        metadata: metadata(
          "---\nsources:\n  - resource: ../assets/figure.png\n---\n",
        ),
      },
      {
        path: "bundle/notes/plain.md",
        metadata: metadata("plain body"),
      },
    ],
    resolve: () => ({ status: "missing" }),
  });
  const from = graph.nodes.find((node) => node.id === "bundle/notes/from.md");
  assert.equal(from?.assets, 1);
  assert.equal(
    graph.edges.some((edge) => edge.source === "bundle/notes/from.md"),
    false,
  );
});
