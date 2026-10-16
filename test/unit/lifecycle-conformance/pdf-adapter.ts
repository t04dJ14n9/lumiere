import { defineManifest } from "../../../src/extension/runtime/manifest";
import { PluginRuntime } from "../../../src/extension/runtime/plugin-runtime";
import type { PluginDefinition, PluginScope } from "../../../src/extension/runtime/plugin-runtime";
import type { BackingService, HarnessFactory, PluginSpec } from "./shared/harness";

interface Services {
  lifecycleBacking: BackingService;
  lifecycleDerived: BackingService;
}

/** Delegates directly; captured scope.find observes the public service lookup. */
export const createPdfHarness: HarnessFactory = (specs) => {
  const errors: string[] = [];
  let probe: PluginScope<Services> | undefined;
  const definitions: PluginDefinition<Services>[] = specs.map((spec: PluginSpec) => ({
    manifest: defineManifest({ id: spec.id, title: spec.id, capabilities: [], requires: [...(spec.requires ?? [])] }),
    activate(scope) {
      probe = scope;
      return spec.activate({
        acquire(release) {
          scope.acquire({ dispose: release });
          return undefined;
        },
        provide: (name, value) => scope.provide(name, value),
        get: (name) => scope.get(name),
      });
    },
  }));
  const runtime = new PluginRuntime<Services>(definitions, {
    info() {},
    error(message) { errors.push(message); },
  });
  return {
    errors,
    async enable(id) { await runtime.enable(id); },
    disable: (id) => runtime.disable(id),
    async restart(id) {
      await runtime.disable(id);
      await runtime.enable(id);
    },
    dispose: () => runtime.dispose(),
    state: (id) => runtime.state(id) ?? "inactive",
    service: (name) => probe?.find(name),
  };
};
