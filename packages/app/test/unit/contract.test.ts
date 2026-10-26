import test from "node:test";
import assert from "node:assert/strict";
import { logLine, parseServerArgs, readyLine } from "../../src/server/contract";

test("server arguments: defaults, repeated vaults, loopback only", () => {
  assert.deepEqual(parseServerArgs([]), {
    vaults: [],
    port: 0,
    host: "127.0.0.1",
    token: undefined,
    data: undefined,
    assets: undefined,
    version: false,
  });
  const options = parseServerArgs([
    "--vault",
    "/a",
    "--vault",
    "/b",
    "--port",
    "4123",
    "--host",
    "::1",
    "--assets",
    "/res",
  ]);
  assert.deepEqual(options.vaults, ["/a", "/b"]);
  assert.equal(options.port, 4123);
  assert.equal(options.host, "::1");
  assert.equal(options.assets, "/res");
  for (const bad of [
    ["--host", "0.0.0.0"],
    ["--host", "192.168.1.2"],
    ["--port", "70000"],
    ["--port", "x"],
    ["--unknown"],
  ]) {
    assert.throws(() => parseServerArgs(bad), Error, bad.join(" "));
  }
});

test("the ready line is one JSON object the desktop app can parse", () => {
  const line = readyLine({
    url: "http://127.0.0.1:5000/?token=t",
    port: 5000,
    pid: 42,
    version: "1.2.3",
  });
  assert.ok(!line.includes("\n"));
  assert.deepEqual(JSON.parse(line), {
    lumiere: "ready",
    url: "http://127.0.0.1:5000/?token=t",
    port: 5000,
    pid: 42,
    version: "1.2.3",
  });
});

test("log lines are JSON and describe errors", () => {
  const parsed = JSON.parse(
    logLine("error", "Could not start", new Error("busy")),
  ) as {
    level: string;
    message: string;
    details: { name: string; message: string };
  };
  assert.equal(parsed.level, "error");
  assert.equal(parsed.message, "Could not start");
  assert.equal(parsed.details.message, "busy");
  assert.deepEqual(JSON.parse(logLine("info", "hi")), {
    level: "info",
    message: "hi",
  });
});
