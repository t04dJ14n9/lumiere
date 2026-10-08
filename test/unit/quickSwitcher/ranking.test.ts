import test from "node:test";
import assert from "node:assert/strict";
import { switcherItems } from "../../../src/plugins/quickSwitcher/ranking";
import { memoryVaults } from "../views/fakes";

function vault() {
  const { index } = memoryVaults({
    "Project Plan.md": "---\naliases: [Roadmap]\n---\n[[Someday]]",
    "notes/Planning.md": "",
    "archive/Old plan.md": "",
    "Daily.md": "[[Someday]] [[someday]]",
    "image.png": "",
  });
  const mtimes: Record<string, number> = {
    "Daily.md": 3,
    "Project Plan.md": 2,
    "notes/Planning.md": 1,
  };
  index.replaceFiles(
    index.files().map((file) => ({
      ...file,
      mtime: mtimes[file.path] ?? 0,
      excluded: file.path.startsWith("archive/"),
    })),
  );
  return index;
}

const labels = (items: { label: string }[]) => items.map((item) => item.label);

test("an empty query lists notes by most recent change", () => {
  assert.deepEqual(labels(switcherItems(vault(), "")), [
    "Daily",
    "Project Plan",
    "Planning",
  ]);
});

test("prefix matches rank first, names above paths; aliases and not-created links are found; excluded files are not", () => {
  assert.deepEqual(labels(switcherItems(vault(), "plan")), [
    "Planning",
    "Project Plan",
    "$(new-file) Create “plan”",
  ]);
  assert.deepEqual(labels(switcherItems(vault(), "road")), [
    "Roadmap",
    "$(new-file) Create “road”",
  ]);
  assert.equal(
    switcherItems(vault(), "roadmap")[0]!.description,
    "→ Project Plan",
  );
  assert.deepEqual(labels(switcherItems(vault(), "some")), [
    "Someday",
    "$(new-file) Create “some”",
  ]);
  assert.deepEqual(labels(switcherItems(vault(), "notes")), [
    "Planning",
    "$(new-file) Create “notes”",
  ]);
});

test("no create item when a note already has that name", () => {
  assert.deepEqual(labels(switcherItems(vault(), "daily")), ["Daily"]);
  assert.deepEqual(labels(switcherItems(vault(), "zzz")), [
    "$(new-file) Create “zzz”",
  ]);
});
