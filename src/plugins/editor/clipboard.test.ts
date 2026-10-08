import test from "node:test";
import assert from "node:assert/strict";
import { Endpoint } from "../../shared/rpc/endpoint";
import { protocol } from "./protocol";
import { createClipboard } from "./clipboard";

test("clipboard routes reads and writes through validated host RPC and removes handlers", async () => {
  let hostReceive: (value: unknown) => void = () => {};
  let viewReceive: (value: unknown) => void = () => {};
  const clock = {
    after() {
      return () => {};
    },
  };
  const host = new Endpoint(
    {
      send: (value) => viewReceive(value),
      listen(fn) {
        hostReceive = fn;
        return () => {};
      },
    },
    clock,
  );
  const view = new Endpoint(
    {
      send: (value) => hostReceive(value),
      listen(fn) {
        viewReceive = fn;
        return () => {};
      },
    },
    clock,
  );
  let text = "source **text**";
  const removeRead = host.handle(protocol, "clipboardRead", () => text);
  host.handle(protocol, "clipboardWrite", (value) => {
    text = value.text;
    return true;
  });
  const clipboard = createClipboard(view);
  assert.equal(await clipboard.read(), text);
  await clipboard.write("你好\nnew text");
  assert.equal(text, "你好\nnew text");
  await assert.rejects(clipboard.write("x".repeat(4_000_001)));
  removeRead();
  await assert.rejects(clipboard.read());
  host.dispose();
  view.dispose();
});
