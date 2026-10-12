import { createMarkdownHarness } from "./lifecycle-conformance/markdown-adapter";
import { runHarnessMetaTests } from "./lifecycle-conformance/shared/meta";
import { runLifecycleSuite } from "./lifecycle-conformance/shared/run-suite";

runLifecycleSuite({
  name: "markdown",
  factory: createMarkdownHarness,
  earlyRelease: true,
});
runHarnessMetaTests("markdown", createMarkdownHarness);
// Cordis reference suite lives in test/reference (opt-in: pnpm test:cordis-reference).
