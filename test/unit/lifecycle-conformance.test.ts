import { createMarkdownHarness } from "./lifecycle-conformance/markdown-adapter";
import { createCordisHarness } from "./lifecycle-conformance/shared/cordis-adapter";
import { cordisExpectations } from "./lifecycle-conformance/shared/cordis-expectations";
import { runHarnessMetaTests } from "./lifecycle-conformance/shared/meta";
import { runLifecycleSuite } from "./lifecycle-conformance/shared/run-suite";

runLifecycleSuite({
  name: "markdown",
  factory: createMarkdownHarness,
  earlyRelease: true,
});
runHarnessMetaTests("markdown", createMarkdownHarness);
runLifecycleSuite({
  name: "cordis@4.0.0-rc.10",
  factory: createCordisHarness,
  earlyRelease: true,
  expectations: cordisExpectations,
});
