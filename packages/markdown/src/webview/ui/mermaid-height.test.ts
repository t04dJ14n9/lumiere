import test from "node:test";
import assert from "node:assert/strict";
import { mermaidBlockHeight } from "./mermaid-height";
import { diagramSource } from "../../../test/support/mermaid-note";
import { MERMAID_SAMPLES } from "../../../test/support/mermaid-samples";

const fence = (body: string) => `\`\`\`mermaid\n${body}\n\`\`\``;

/**
 * Block heights Mermaid 12 drew in Chromium (default theme) at two note
 * widths; the guesses must land near them.
 */
const DRAWN: { name: string; source: string; at1211: number; at731: number }[] =
  [
    { name: "chain", source: diagramSource(0), at1211: 904, at731: 904 },
    { name: "messages", source: diagramSource(1), at1211: 595, at731: 595 },
    { name: "classes", source: diagramSource(2), at1211: 497, at731: 497 },
    { name: "states", source: diagramSource(3), at1211: 435, at731: 435 },
    { name: "entities", source: diagramSource(4), at1211: 513, at731: 513 },
    { name: "plan", source: diagramSource(5), at1211: 221, at731: 218 },
    { name: "pie", source: diagramSource(6), at1211: 504, at731: 504 },
    {
      name: "long chain",
      source: diagramSource(21),
      at1211: 1312,
      at731: 1312,
    },
    {
      name: "pipeline",
      source: MERMAID_SAMPLES.pipeline!,
      at1211: 238,
      at731: 238,
    },
    {
      name: "subgraphs",
      source: MERMAID_SAMPLES.subgraphs!,
      at1211: 782,
      at731: 782,
    },
    {
      name: "conversation",
      source: MERMAID_SAMPLES.conversation!,
      at1211: 686,
      at731: 686,
    },
    {
      name: "animals",
      source: MERMAID_SAMPLES.animals!,
      at1211: 390,
      at731: 390,
    },
    {
      name: "machine",
      source: MERMAID_SAMPLES.machine!,
      at1211: 383,
      at731: 383,
    },
    {
      name: "orders",
      source: MERMAID_SAMPLES.orders!,
      at1211: 531,
      at731: 531,
    },
    { name: "gantt", source: MERMAID_SAMPLES.plan!, at1211: 245, at731: 241 },
  ];

for (const { name, source, at1211, at731 } of DRAWN) {
  test(`the ${name} diagram's guessed height is within a quarter of its drawn height`, () => {
    for (const [width, drawn] of [
      [1211, at1211],
      [731, at731],
    ] as const) {
      const guess = mermaidBlockHeight(fence(source), width);
      assert.ok(
        Math.abs(guess - drawn) <= drawn / 4,
        `${name} at ${width}px: guessed ${guess}, drew ${drawn}`,
      );
    }
  });
}

test("flowchart and sequence height guesses do not shrink with a narrower pane", () => {
  // Short diagrams are already narrower than both panes. The wide ones are
  // the cases fitted() used to scale down at 731px and leave tall at 1211px.
  const sources = [
    fence("flowchart TB\n  A --> B --> C --> D --> E"),
    fence("flowchart LR\n  A --> B --> C --> D --> E --> F --> G --> H --> I"),
    fence(
      "flowchart TB\n  A --> B\n  A --> C\n  A --> D\n  A --> E\n  A --> F\n  A --> G\n  A --> H\n  A --> I",
    ),
    fence(
      "sequenceDiagram\n  Alice->>Bob: hi\n  Bob->>Alice: yo\n  Alice->>Bob: ok",
    ),
    fence(
      "sequenceDiagram\n  A->>B: hi\n  C->>D: hi\n  E->>F: hi\n  G->>H: hi\n  I->>J: hi",
    ),
    fence(diagramSource(1)),
    fence(MERMAID_SAMPLES.pipeline!),
    fence(MERMAID_SAMPLES.conversation!),
  ];
  for (const source of sources) {
    assert.equal(
      mermaidBlockHeight(source, 731),
      mermaidBlockHeight(source, 1211),
      source,
    );
  }
});

test("comments, directives and front matter are not statements", () => {
  const plain = mermaidBlockHeight(fence("flowchart TB\n  A --> B --> C"), 900);
  const dressed = mermaidBlockHeight(
    fence(
      '---\ntitle: Steps\n---\n%%{init: {"theme": "forest"}}%%\nflowchart TB\n  %% a comment\n  A --> B --> C',
    ),
    900,
  );
  assert.equal(dressed, plain);
});

test("a cycle does not deepen a flowchart without end", () => {
  const loop = mermaidBlockHeight(
    fence("flowchart TB\n  A --> B --> C --> A"),
    900,
  );
  const line = mermaidBlockHeight(fence("flowchart TB\n  A --> B --> C"), 900);
  assert.equal(loop, line);
});

test("an unclosed fence and an unknown kind still get a block-sized guess", () => {
  const unknown = mermaidBlockHeight(
    "```mermaid\nquadrantChart\n  x-axis Low --> High",
  );
  assert.ok(unknown >= 320, `got ${unknown}`);
  assert.ok(mermaidBlockHeight("```mermaid\n```") >= 174);
});
