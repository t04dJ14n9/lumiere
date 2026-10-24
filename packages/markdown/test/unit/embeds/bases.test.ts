import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateBaseView,
  parseBaseYaml,
  selectBaseView,
  type BaseNoteEntry,
} from "../../../src/markdown/bases";

const SAMPLE_ENTRIES: BaseNoteEntry[] = [
  {
    path: "Projects/Alpha.md",
    basename: "Alpha",
    extension: "md",
    mtime: Date.parse("2026-10-20T12:00:00Z"),
    size: 1200,
    frontmatter: {
      status: "done",
      priority: 1,
      price: 20,
      count: 4,
      completed: true,
      due: "2026-10-15",
      owner: "[[Alice|Alice Smith]]",
      categories: ["frontend", "ui"],
    },
    tags: ["#project/active", "#featured"],
    links: ["Roadmap", "Alice"],
    embeds: [],
    backlinks: ["Index.md"],
  },
  {
    path: "Projects/Beta.md",
    basename: "Beta",
    extension: "md",
    mtime: Date.parse("2026-10-21T12:00:00Z"),
    size: 800,
    frontmatter: {
      status: "in-progress",
      priority: 3,
      price: 50,
      count: 2,
      completed: false,
      due: "2026-10-25",
      owner: "[[Bob]]",
      categories: ["backend"],
    },
    tags: ["#project/backlog"],
    links: ["Bob"],
    embeds: [],
    backlinks: [],
  },
  {
    path: "Notes/Scratch.md",
    basename: "Scratch",
    extension: "md",
    mtime: Date.parse("2026-10-22T12:00:00Z"),
    size: 300,
    frontmatter: {
      status: "todo",
      priority: 2,
    },
    tags: ["#misc"],
    links: [],
    embeds: [],
    backlinks: [],
  },
];

test("Obsidian Bases YAML parser and evaluator evaluate views, filters, formulas, and summaries", () => {
  const yaml = `
filters:
  and:
    - file.hasTag("project")
    - file.inFolder("Projects")
formulas:
  unit_price: "(price / count).round(2)"
  label: 'if(completed, "Ready", "Pending")'
properties:
  status:
    displayName: Status
  formula.unit_price:
    displayName: Unit Price
views:
  - type: table
    name: All Projects
    order:
      - file.name
      - status
      - formula.unit_price
      - formula.label
    sort:
      - property: priority
        direction: DESC
    summaries:
      price: Sum
      priority: Average
  - type: cards
    name: Done Only
    filters: 'status == "done"'
    order:
      - file.name
      - status
`;
  const def = parseBaseYaml(yaml);
  assert.equal(def.views.length, 2);

  const defaultView = selectBaseView(def);
  assert.equal(defaultView?.name, "All Projects");

  const evaluated = evaluateBaseView(def, defaultView!, SAMPLE_ENTRIES);
  assert.deepEqual(
    evaluated.rows.map((r) => r.entry.basename),
    ["Beta", "Alpha"],
  );
  assert.deepEqual(
    evaluated.columns.map((c) => c.displayName),
    ["name", "Status", "Unit Price", "label"],
  );
  assert.deepEqual(evaluated.rows[0]!.cells["formula.unit_price"], {
    kind: "number",
    value: 25,
  });
  assert.deepEqual(evaluated.rows[1]!.cells["formula.unit_price"], {
    kind: "number",
    value: 5,
  });
  assert.deepEqual(evaluated.rows[1]!.cells["formula.label"], {
    kind: "string",
    value: "Ready",
  });
  assert.equal(evaluated.summaries["note.price"], "70");
  assert.equal(evaluated.summaries["note.priority"], "2");

  const doneView = selectBaseView(def, "Done Only");
  assert.equal(doneView?.type, "cards");
  const doneEval = evaluateBaseView(def, doneView!, SAMPLE_ENTRIES);
  assert.deepEqual(
    doneEval.rows.map((r) => r.entry.basename),
    ["Alpha"],
  );
});

test("Obsidian Bases supports groupBy, limit, list methods, regex matches, and link/date filters", () => {
  const yaml = `
views:
  - type: list
    name: Filtered
    filters:
      or:
        - 'file.hasLink("Roadmap") && categories.contains("ui")'
        - 'file.name.matches(/^Bet/)'
    groupBy:
      property: status
      direction: ASC
    limit: 5
    order:
      - file.name
      - owner
      - file.tags
`;
  const def = parseBaseYaml(yaml);
  const view = selectBaseView(def, "filtered");
  assert.equal(view?.name, "Filtered");
  const evaluated = evaluateBaseView(def, view!, SAMPLE_ENTRIES);
  assert.equal(evaluated.rows.length, 2);
  assert.equal(evaluated.groups.length, 2);
  assert.deepEqual(evaluated.groups[0]!.key, {
    kind: "string",
    value: "done",
  });
  assert.deepEqual(evaluated.groups[1]!.key, {
    kind: "string",
    value: "in-progress",
  });
});
