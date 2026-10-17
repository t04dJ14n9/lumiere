import { createMarkdownHarness } from "./lifecycle-conformance/markdown-adapter";
import { createCordisShimHarness } from "./lifecycle-conformance/cordis-shim-adapter";
import { runHarnessMetaTests } from "./lifecycle-conformance/shared/meta";
import { runLifecycleSuite } from "./lifecycle-conformance/shared/run-suite";

runLifecycleSuite({
  name: "markdown",
  factory: createMarkdownHarness,
  earlyRelease: true,
});
runHarnessMetaTests("markdown", createMarkdownHarness);
runLifecycleSuite({
  name: "cordis-shim",
  factory: createCordisShimHarness,
  earlyRelease: true,
});
runHarnessMetaTests("cordis-shim", createCordisShimHarness);
