import { createCoreHarness } from "./conformance/core-adapter";
import { runHarnessMetaTests } from "./conformance/meta";
import { runLifecycleSuite } from "./conformance/run-suite";

runLifecycleSuite({
  name: "core",
  factory: createCoreHarness,
  earlyRelease: true,
});
runHarnessMetaTests("core", createCoreHarness);
