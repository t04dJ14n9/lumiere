import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseBridge,
  parseBridgeRecord,
  type BridgeRecord,
} from "../../src/bridge-stdio/discovery";

const token = "a".repeat(48);
function record(
  pid: number,
  workspaceFolders: string[],
  startedAt = "2026-10-09T10:00:00.000Z",
): BridgeRecord {
  return {
    url: `http://127.0.0.1:${4000 + pid}/mcp`,
    token,
    pid,
    workspaceFolders,
    startedAt,
  };
}
const allAlive = { alive: () => true };

test("no window whose workspace contains the folder is an error, not the newest window", () => {
  const choice = chooseBridge(
    [record(1, ["/work/other"]), record(2, [], "2030-01-01T00:00:00.000Z")],
    { cwd: "/work/project", ...allAlive },
  );
  assert.ok("error" in choice);
  assert.match(
    choice.error,
    /No VS Code or Cursor window .* containing \/work\/project/u,
  );
});

test("the window whose workspace contains the folder is chosen", () => {
  const choice = chooseBridge(
    [record(1, ["/work/other"]), record(2, ["/work/project"])],
    { cwd: "/work/project/src", ...allAlive },
  );
  assert.deepEqual(choice, { bridge: record(2, ["/work/project"]) });
});

test("a folder that only shares a prefix is not inside the workspace", () => {
  const choice = chooseBridge([record(1, ["/work/pro"])], {
    cwd: "/work/project",
    ...allAlive,
  });
  assert.ok("error" in choice);
});

test("nested workspaces: the most specific one wins", () => {
  const choice = chooseBridge(
    [record(1, ["/work"]), record(2, ["/work/project"])],
    { cwd: "/work/project/src", ...allAlive },
  );
  assert.deepEqual(choice, { bridge: record(2, ["/work/project"]) });
});

test("two windows matching equally is an error naming both, whichever started last", () => {
  const choice = chooseBridge(
    [
      record(1, ["/work/project"]),
      record(2, ["/work/project"], "2030-01-01T00:00:00.000Z"),
    ],
    { cwd: "/work/project", ...allAlive },
  );
  assert.ok("error" in choice);
  assert.match(choice.error, /2 windows .* pids 1, 2.*AGENT_PDF_BRIDGE_PID/u);
});

test("AGENT_PDF_BRIDGE_PID picks a window explicitly, and must name a live one", () => {
  const records = [record(1, ["/work/project"]), record(2, ["/work/project"])];
  assert.deepEqual(
    chooseBridge(records, { cwd: "/elsewhere", pid: "2", ...allAlive }),
    { bridge: records[1] },
  );
  assert.ok(
    "error" in
      chooseBridge(records, { cwd: "/work/project", pid: "3", ...allAlive }),
  );
  assert.ok(
    "error" in
      chooseBridge(records, {
        cwd: "/work/project",
        pid: "2",
        alive: (pid) => pid !== 2,
      }),
  );
});

test("stale records (their process is gone) are ignored", () => {
  const records = [record(1, ["/work/project"]), record(2, ["/work/project"])];
  assert.deepEqual(
    chooseBridge(records, { cwd: "/work/project", alive: (pid) => pid === 1 }),
    { bridge: records[0] },
  );
  assert.ok(
    "error" in
      chooseBridge(records, { cwd: "/work/project", alive: () => false }),
  );
});

test("malformed records and non-loopback endpoints are rejected", () => {
  const good = record(1, ["/work/project"]);
  assert.deepEqual(parseBridgeRecord(good), good);
  for (const bad of [
    null,
    "text",
    { ...good, token: "short" },
    { ...good, pid: -1 },
    { ...good, pid: 1.5 },
    { ...good, workspaceFolders: "x" },
    { ...good, workspaceFolders: ["relative/path"] },
    { ...good, startedAt: 5 },
    { ...good, url: "http://example.com:4001/mcp" },
    { ...good, url: "http://localhost:4001/mcp" },
    { ...good, url: "https://127.0.0.1:4001/mcp" },
    { ...good, url: "http://127.0.0.1/mcp" },
    { ...good, url: "http://127.0.0.1:4001/other" },
    { ...good, url: "http://user:pw@127.0.0.1:4001/mcp" },
    { ...good, url: "http://127.0.0.1:4001/mcp?x=1" },
    { ...good, url: "not a url" },
  ]) {
    assert.equal(parseBridgeRecord(bad), undefined, JSON.stringify(bad));
  }
});
