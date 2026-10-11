import { Context } from "../../../src/kernel";
import type { Fiber, Plugin } from "../../../src/kernel";
import type {
  BackingService,
  HarnessFactory,
  LifecycleState,
  PluginSpec,
  ServiceName,
} from "./shared/harness";

declare module "../../../src/kernel/types" {
  interface Services {
    lifecycleBacking: BackingService;
    lifecycleDerived: BackingService;
  }
}

/** Named enable retains a fiber while it loads; all barriers are kernel APIs. */
export const createMarkdownHarness: HarnessFactory = (specs) => {
  const errors: string[] = [];
  const root = Context.create({
    logger: {
      debug() {},
      warn() {},
      error(message, details) {
        errors.push(`${message}: ${String(details)}`);
      },
    },
  });
  const fibers = new Map<string, Fiber<void>>();
  const definitions = new Map(
    specs.map((spec) => [spec.id, definition(spec, specs)]),
  );

  function fiber(id: string): Fiber<void> {
    const current = fibers.get(id);
    if (!current) {
      throw new Error(`No enabled plugin ${id}`);
    }
    return current;
  }

  return {
    errors,
    async enable(id) {
      const current = fibers.get(id);
      if (!current || current.state === "disposed") {
        const plugin = definitions.get(id);
        if (!plugin) {
          throw new Error(`No plugin ${id}`);
        }
        fibers.set(id, root.plugin(plugin));
      }
      await root.settled();
    },
    disable: (id) => fiber(id).dispose(),
    async restart(id) {
      await fiber(id).update(undefined);
      await root.settled();
    },
    dispose: () => root.dispose(),
    state(id): LifecycleState {
      const state = fibers.get(id)?.state;
      if (state === "loading") {
        return "starting";
      }
      if (state === "active" || state === "failed") {
        return state;
      }
      return "inactive";
    },
    service: (name) => root.runtime.value(name) as BackingService | undefined,
  };
};

function definition(
  spec: PluginSpec,
  specs: readonly PluginSpec[],
): Plugin<void> {
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
