import test from "node:test";
import assert from "node:assert/strict";
import { markdownParser } from "../../../src/markdown/dialect";

function taskMarkers(source: string): string[] {
  const markers: string[] = [];
  markdownParser.parse(source).iterate({
    enter(node) {
      if (node.name === "TaskMarker") {
        markers.push(source.slice(node.from, node.to));
      }
    },
  });
  return markers;
}

test("any single status character makes a task, as in Obsidian", () => {
  assert.deepEqual(
    taskMarkers(
      "- [ ] open\n- [x] done\n- [/] doing\n- [-] dropped\n1. [?] asked",
    ),
    ["[ ]", "[x]", "[/]", "[-]", "[?]"],
  );
});

test("brackets that are not a single-character status stay text", () => {
  assert.deepEqual(
    taskMarkers("- [] empty\n- [ab] two\n- [x]no space\nNot a list [x] item"),
    [],
  );
});
