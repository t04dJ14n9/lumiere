import test from "node:test";
import assert from "node:assert/strict";
import { fromHost } from "../../../src/webview/transport";

test("webview accepts its real wrapper after VS Code masks window.parent", () => {
  const origin = "vscode-webview://test-origin";
  const self = { location: { origin }, parent: undefined as unknown };
  self.parent = self;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: self,
  });
  try {
    const wrapper = {};
    const message = (source: unknown, origin: string) =>
      ({ source, origin }) as MessageEvent<unknown>;
    assert.equal(fromHost(message(wrapper, origin)), true);
    assert.equal(fromHost(message({}, "https://embedded.example")), false);
    assert.equal(fromHost(message({}, "null")), false);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});
