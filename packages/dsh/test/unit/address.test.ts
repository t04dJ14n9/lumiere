import test from "node:test";
import assert from "node:assert/strict";
import {
  insideWorkspace,
  parseSessionAddress,
  sessionAddress,
  workspaceRoot,
} from "../../src/client/address";

test("a session address reads back to its session and decoded path", () => {
  assert.deepEqual(
    parseSessionAddress(
      "dsh-resource://file/session/s-1/notes/Start%20here.md#x",
    ),
    { sessionId: "s-1", path: "notes/Start here.md" },
  );
  assert.equal(
    parseSessionAddress("dsh-resource://file/absolute/a.md"),
    undefined,
  );
  assert.equal(
    parseSessionAddress("dsh-resource://file/session/s-1"),
    undefined,
  );
  assert.equal(
    parseSessionAddress("dsh-resource://file/session/s/%E0"),
    undefined,
  );
});

test("the workspace root is the absolute path without the relative one", () => {
  const address = "dsh-resource://file/session/s/notes/Start%20here.md";
  assert.equal(workspaceRoot(address, "/v/notes/Start here.md"), "/v");
  assert.equal(workspaceRoot(address, "/elsewhere/x.md"), undefined);
  assert.equal(
    workspaceRoot("dsh-resource://file/session/s//v/a.md", "/v/a.md"),
    undefined,
  );
});

test("a page may open a file inside its workspace and not a prefix or the disk root", () => {
  assert.equal(insideWorkspace("/v", "/v/notes/A.md"), true);
  assert.equal(insideWorkspace("/v/", "/v"), true);
  assert.equal(insideWorkspace("/v", "/vault/A.md"), false);
  assert.equal(insideWorkspace("/v", "/v/../etc/passwd"), false);
  assert.equal(insideWorkspace("/", "/etc/passwd"), false);
  assert.equal(insideWorkspace(undefined, "/v/A.md"), false);
});

test("another note's address is relative to the workspace, encoded like DSH's", () => {
  assert.equal(
    sessionAddress("s 1", "/v", "/v/notes/A #1.md"),
    "dsh-resource://file/session/s%201/notes/A%20%231.md",
  );
  assert.equal(
    sessionAddress("s", "/v", "/other/C:x.md"),
    "dsh-resource://file/session/s//other/C:x.md",
  );
});
