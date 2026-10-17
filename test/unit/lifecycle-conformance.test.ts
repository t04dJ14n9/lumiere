import assert from "node:assert/strict";
import { test } from "node:test";
import { defineManifest } from "../../src/extension/runtime/manifest";
import { PluginRuntime } from "../../src/extension/runtime/plugin-runtime";
import type { PluginScope } from "../../src/extension/runtime/plugin-runtime";
import { createPdfHarness } from "./lifecycle-conformance/pdf-adapter";
import { createCordisShimHarness } from "./lifecycle-conformance/cordis-shim-adapter";
import type { BackingService } from "./lifecycle-conformance/shared/harness";
import { runHarnessMetaTests } from "./lifecycle-conformance/shared/meta";
import { runLifecycleSuite } from "./lifecycle-conformance/shared/run-suite";

runLifecycleSuite({ name: "pdf", factory: createPdfHarness, earlyRelease: false });
runHarnessMetaTests("pdf", createPdfHarness);
runLifecycleSuite({ name: "cordis-shim", factory: createCordisShimHarness, earlyRelease: true });
runHarnessMetaTests("cordis-shim", createCordisShimHarness);

/**
 * Adapter contract the PDF harness relies on: a reader captured from the
 * ORIGINAL (first-generation, later stopped) scope keeps observing the
 * runtime's current service table rather than a cached or scope-bound value.
 */
test("pdf adapter contract: a captured stopped-scope reader tracks the live service table", async () => {
  interface Services {
    lifecycleBacking: BackingService;
  }
  let generation = 0;
  const scopes: PluginScope<Services>[] = [];
  const runtime = new PluginRuntime<Services>(
    [
      {
        manifest: defineManifest({ id: "provider", title: "provider", capabilities: [], requires: [] }),
        activate(scope) {
          scopes.push(scope);
          const current = ++generation;
          scope.provide("lifecycleBacking", { generation: current, read: () => current });
        },
      },
    ],
    { info() {}, error() {} },
  );
  await runtime.enable("provider");
  const reader = scopes[0];
  assert.ok(reader);
  assert.equal(reader.find("lifecycleBacking")?.generation, 1, "first generation visible");
  await runtime.disable("provider");
  assert.equal(reader.find("lifecycleBacking"), undefined, "withdrawn after disable");
  await runtime.enable("provider");
  assert.equal(scopes.length, 2);
  assert.equal(reader.find("lifecycleBacking")?.generation, 2, "replacement visible through the original reader");
  await runtime.dispose();
  assert.equal(reader.find("lifecycleBacking"), undefined, "absent after disposal");
});
