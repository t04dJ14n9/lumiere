import { createRoot } from "@workshop/core";
import type { Plugin, PluginHandle } from "@workshop/core";
import type {
  BackingService,
  HarnessFactory,
  LifecycleState,
  PluginSpec,
  ServiceName,
} from "./harness";

declare module "@workshop/core" {
  interface Services {
    lifecycleBacking: BackingService;
    lifecycleDerived: BackingService;
  }
}

/** Named enable retains a plugin handle; every barrier is the core's own. */
export const createCoreHarness: HarnessFactory = (specs) => {
  const errors: string[] = [];
  const root = createRoot({
    logger: {
      debug() {},
      warn() {},
      error(message, details) {
        errors.push(`${message}: ${String(details)}`);
      },
    },
  });
  const handles = new Map<string, PluginHandle<void>>();
  const definitions = new Map(
    specs.map((spec) => [spec.id, definition(spec, specs)]),
  );

  function handle(id: string): PluginHandle<void> {
    const current = handles.get(id);
    if (!current) {
      throw new Error(`No enabled plugin ${id}`);
    }
    return current;
  }

  return {
    errors,
    async enable(id) {
      const current = handles.get(id);
      if (!current || current.state === "disposed") {
        const plugin = definitions.get(id);
        if (!plugin) {
          throw new Error(`No plugin ${id}`);
        }
        handles.set(id, root.plugin(plugin));
      }
      await root.settled();
    },
    disable: (id) => handle(id).dispose(),
    async restart(id) {
      await handle(id).update(undefined);
      await root.settled();
    },
    dispose: () => root.dispose(),
    state(id): LifecycleState {
      const state = handles.get(id)?.state;
      if (state === "loading") {
        return "starting";
      }
      if (state === "active" || state === "failed") {
        return state;
      }
      return "inactive";
    },
    service: (name) => root.service(name),
  };
};

function definition(spec: PluginSpec, specs: readonly PluginSpec[]): Plugin {
  const required = (spec.requires ?? []).map((id): ServiceName => {
    const service = specs.find((candidate) => candidate.id === id)?.provides;
    if (!service) {
      throw new Error(`${id} must declare a provided service`);
    }
    return service;
  });
  return {
    name: spec.id,
    inject: { required },
    apply: (ctx) =>
      spec.activate({
        acquire: (release) => ctx.acquire("conformance resource", release),
        provide: (name, value) => ctx.provide(name, value),
        get: (name) => ctx[name],
      }),
  };
}
