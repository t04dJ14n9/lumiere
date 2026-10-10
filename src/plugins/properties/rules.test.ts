import test from "node:test";
import assert from "node:assert/strict";
import {
  inferPropertyKind,
  propertyNameAvailable,
  canSetPropertyType,
} from "../../markdown/properties/types";
import { frontmatter, propertyChanges } from "../../markdown/properties";
import { normalizeListInput } from "./list-values";
import { propertyNameSuggestions } from "./name-suggestions";
import { vaultPropertyNames } from "./property-names";
import { clipboardProperties } from "./clipboard-values";
import { propertyTypeChoices, propertyRowMenu } from "./row-menu";
import { propertyHeadingMenu } from "./order";
import { propertyTabDestination } from "./row-navigation";
import type { PropertyContext } from "./context";

function editor(types = {}): NonNullable<PropertyContext["propertyEditor"]> {
  return { source: "current", set: () => true, types: () => types };
}

test("registry inference covers every scalar/list kind and reserved names before overrides", () => {
  for (const [value, kind] of [
    [true, "checkbox"],
    [3, "number"],
    ["2026-10-08", "date"],
    ["2026-10-08T14:30", "datetime"],
    [["one"], "list"],
    [null, "text"],
    ["true", "text"],
  ] as const) {
    assert.equal(inferPropertyKind("status", value), kind);
  }
  assert.equal(inferPropertyKind("Status", true, { status: "text" }), "text");
  for (const name of ["tags", "aliases", "cssclasses"]) {
    assert.equal(canSetPropertyType(name, "text"), false);
    assert.equal(canSetPropertyType(name, null), false);
  }
  assert.equal(canSetPropertyType("x", "tags"), false);
  assert.equal(canSetPropertyType("x", "aliases"), false);
  assert.equal(canSetPropertyType("status", null), true);
});

test("type submenu order, Automatic and checked state follow the registry", () => {
  const calls: unknown[] = [];
  const service = {
    ...editor({ status: "number" }),
    setType: (key: string, kind: unknown) => {
      calls.push([key, kind]);
    },
  };
  const choices = propertyTypeChoices("status", service, "done");
  assert.deepEqual(
    choices.map((item) => item.label),
    [
      "Automatic (Text)",
      "Checkbox",
      "Date",
      "Date & time",
      "List",
      "Number",
      "Text",
    ],
  );
  assert.deepEqual(
    choices.filter((item) => item.checked).map((item) => item.label),
    ["Number"],
  );
  choices[0]!.run!();
  assert.deepEqual(calls, [["status", null]]);
  assert.equal(propertyTypeChoices("status", editor(), true)[0]!.checked, true);
  for (const key of ["tags", "aliases", "cssclasses"]) {
    const reserved = propertyTypeChoices(key, service, ["x"]);
    assert.equal(reserved.length, 6);
    assert.ok(reserved.every((item) => item.disabled));
    assert.ok(reserved.every((item) => !item.label.startsWith("Automatic")));
  }
});

test("icon and heading menus expose the measured action labels and submenus", async () => {
  const invoked: string[] = [];
  const actions = {
    types: [],
    multiple: false,
    copy: () => {
      invoked.push("copy");
    },
    cut: () => {
      invoked.push("cut");
    },
    paste: async () => {
      invoked.push("paste");
    },
    remove: () => {
      invoked.push("remove");
    },
  };
  const row = propertyRowMenu(actions);
  assert.deepEqual(
    row.map((item) => item.label),
    ["Property type", "Cut", "Copy", "Paste", "Remove"],
  );
  for (const item of row.slice(1)) {
    await item.run!();
  }
  assert.deepEqual(invoked, ["cut", "copy", "paste", "remove"]);
  const heading = propertyHeadingMenu({
    add: () => {
      invoked.push("add");
    },
    sort: (reverse) => {
      invoked.push(reverse ? "descending" : "ascending");
    },
    clear: () => {
      invoked.push("clear");
    },
  });
  assert.deepEqual(
    heading.map((item) => item.label),
    ["Add file property", "Sort", "Clear file properties"],
  );
  assert.deepEqual(
    heading[1]!.children!.map((item) => item.label),
    ["Name (A to Z)", "Name (Z to A)"],
  );
  await heading[1]!.children![1]!.run!();
  assert.equal(invoked.at(-1), "descending");
});

test("field tab routing is key -> value -> same row -> next row", () => {
  assert.equal(propertyTabDestination("name", false), "value");
  assert.equal(propertyTabDestination("value", false), "row");
  assert.equal(propertyTabDestination("row", false), "next");
  assert.equal(propertyTabDestination("value", true), "name");
  assert.equal(propertyTabDestination("name", true), "previous");
  assert.equal(propertyTabDestination("row", true), "previous");
});

test("vault name suggestions combine registered and inferred names, filter and favour a prefix", () => {
  const names = vaultPropertyNames(
    [
      { title: "one", list: ["a"] },
      undefined,
      { status: "done", title: "two", "": "invalid" },
    ],
    { due: "date" },
  );
  assert.deepEqual(names, [
    "aliases",
    "cssclasses",
    "due",
    "list",
    "status",
    "tags",
    "title",
  ]);
  assert.deepEqual(propertyNameSuggestions(names, "st"), ["status", "list"]);
  assert.deepEqual(propertyNameSuggestions(names, "TITLE"), ["title"]);
  assert.deepEqual(propertyNameSuggestions(names, "new key"), []);
});

test("add/rename rules reject empty or duplicate names without changing YAML", () => {
  const source = "---\na: one\nb: two\n---\nBody";
  for (const name of ["", " ", "a", "b", "two\nlines"]) {
    assert.equal(propertyNameAvailable(name, ["a", "b"]), false);
  }
  assert.equal(propertyNameAvailable("a", ["a", "b"], "a"), true);
  assert.equal(propertyNameAvailable("other name", ["a", "b"]), true);
  assert.equal(
    propertyChanges(source, { type: "rename", key: "a", name: "b" }),
    undefined,
  );
  assert.equal(
    propertyChanges(source, { type: "rename", key: "a", name: "" }),
    undefined,
  );
  assert.equal(propertyChanges(source, { type: "add", key: "a" }), undefined);
  assert.deepEqual(frontmatter(source)?.values, { a: "one", b: "two" });
});

test("tags remove one leading hash for additions and edited pills; lists preserve it", () => {
  assert.equal(normalizeListInput("tags", " #one/two "), "one/two");
  assert.equal(normalizeListInput("TAGS", "#new"), "new");
  assert.equal(normalizeListInput("tags", "#"), "");
  assert.equal(normalizeListInput("tags", "##bad"), undefined);
  assert.equal(normalizeListInput("tags", "bad tag"), undefined);
  assert.equal(normalizeListInput("aliases", " #Alias "), "#Alias");
  assert.equal(normalizeListInput("list", "a,b"), "a,b");
});

test("menu clipboard paste accepts property mappings and rejects unsafe or invalid YAML", () => {
  assert.deepEqual(clipboardProperties("status: done\ncount: 3\n"), {
    status: "done",
    count: 3,
  });
  assert.deepEqual(clipboardProperties('{"status":"done"}'), {
    status: "done",
  });
  for (const text of [
    "a: 1\na: 2",
    "[a, b]",
    "plain",
    "a: [",
    " ",
    "x".repeat(1_000_001),
  ]) {
    assert.equal(clipboardProperties(text), undefined);
  }
});
