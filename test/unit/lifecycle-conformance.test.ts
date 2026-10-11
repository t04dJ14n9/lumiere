import assert from "node:assert/strict";
import { test } from "node:test";
import { createMarkdownHarness } from "./lifecycle-conformance/markdown-adapter";
import {
  createCordisStub,
  cordisSkipReasons,
  cordisStubReason,
} from "./lifecycle-conformance/shared/cordis-stub";
import { runLifecycleSuite } from "./lifecycle-conformance/shared/run-suite";

runLifecycleSuite({
  name: "markdown",
  factory: createMarkdownHarness,
  earlyRelease: true,
});
runLifecycleSuite({
  name: "cordis-stub",
  factory: createCordisStub,
  earlyRelease: true,
  skips: cordisSkipReasons,
});

test("Cordis skeleton is runnable and explicitly refuses unsupported activation", async () => {
  const stub = createCordisStub([{ id: "probe", activate() {} }]);
  await assert.rejects(stub.enable("probe"), { message: cordisStubReason });
  assert.equal(stub.state("probe"), "inactive");
  await stub.dispose();
});
