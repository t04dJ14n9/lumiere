import assert from "node:assert/strict";
import test from "node:test";
import {
  joinContained,
  relativeFilePath,
  walksSymbolicLink,
} from "../../src/shared/workspace-path";

test("a decoded file URI stays inside its workspace folder", () => {
  assert.equal(
    relativeFilePath("file:///vault/folder/A%20B.md", "file:///vault"),
    "folder/A B.md",
  );
});

test("joinContained refuses a path that escapes the root", () => {
  assert.equal(joinContained("file:///proj", "assets/../secret"), undefined);
  assert.equal(joinContained("file:///proj", "/etc/passwd"), undefined);
  assert.equal(
    joinContained("file:///proj", "assets/fig.png"),
    "file:///proj/assets/fig.png",
  );
});

test("a symbolic link on the path blocks a write, and a missing file does not", async () => {
  const linked = new Set(["file:///proj/assets"]);
  assert.equal(
    await walksSymbolicLink("assets/fig.png", "file:///proj", async (uri) =>
      linked.has(uri),
    ),
    true,
  );
  assert.equal(
    await walksSymbolicLink(
      "assets/fig.png",
      "file:///proj",
      async () => false,
    ),
    false,
  );
  assert.equal(
    await walksSymbolicLink("../secret", "file:///proj", async () => false),
    true,
  );
});
