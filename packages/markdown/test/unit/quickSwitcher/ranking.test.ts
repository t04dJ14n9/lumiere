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

test("an empty query lists notes by most recent change when none were opened", () => {
  assert.deepEqual(labels(switcherItems(vault(), "")), [
    "Daily",
    "Project Plan",
    "Planning",
  ]);
});

test("an empty query prefers recently opened notes over mtime", () => {
  const index = vault();
  const planning = index.files().find((file) => file.path === "notes/Planning.md")!;
  const daily = index.files().find((file) => file.path === "Daily.md")!;
  assert.deepEqual(
    labels(switcherItems(index, "", 50, [planning.uri, daily.uri])),
    ["Planning", "Daily", "Project Plan"],
  );
  assert.deepEqual(
    labels(switcherItems(index, "", 50, [planning.path])),
    ["Planning", "Daily", "Project Plan"],
  );
});

test("prefix matches rank first, names above paths; aliases, not-created links and attachments are found; excluded files rank 10 lower", () => {
  assert.deepEqual(labels(switcherItems(vault(), "plan")), [
    "Planning",
    "Project Plan",
    "Old plan",
    "$(new-file) Create “plan”",
  ]);
  assert.deepEqual(labels(switcherItems(vault(), "image")), [
    "image.png",
    "$(new-file) Create “image”",
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
