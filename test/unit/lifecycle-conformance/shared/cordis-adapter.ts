import { Context } from "cordis";
import type { Fiber, Plugin } from "cordis";
import type {
  BackingService,
  HarnessFactory,
  LifecycleState,
  PluginSpec,
  ServiceName,
} from "./harness";

export const cordisVersion = "4.0.0-rc.10";

/** cordis FiberState is a const enum in its .d.ts; mirror the values. */
const FiberState = {
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
} as const;

/**
 * Public-API characterization adapter for cordis@4.0.0-rc.10. It maps the
 * harness onto Cordis directly and adds NO lifecycle mechanism of its own:
 * no release memoization, no drain loops, no stop barriers. Repeated
 * disable/dispose calls go straight to Cordis disposers. The only
 * application-owned piece is the child lifetime `app` (decision memo H:
 * root.fiber.dispose() is restart, not shutdown) plus a closed flag so a
 * disposed harness refuses enable, as the harness contract allows.
 *
 * Mapping: enable → app.ctx.plugin(def) then fiber.await() (activation
 * errors are recorded via the Cordis logger, not rethrown, matching the
 * native adapters' settle-then-inspect contract); disable → fiber.dispose();
 * restart → fiber.restart(); acquire → ctx.effect(() => release) whose
 * disposer is the early-release handle; provide → ctx.provide(name, value);
 * get → ctx.get(name); requires → plugin `inject` of provider service names.
 */
export const createCordisHarness: HarnessFactory = (specs) => {
  const errors: string[] = [];
  const root = new Context();
  root.logger.exporter({
    export(message: { type: string; args: unknown[] }) {
      if (message.type !== "error") {
        return;
      }
      errors.push(
        message.args
          .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
          .join(" "),
      );
    },
  } as never);
  const app = root.plugin({ name: "conformance-app", apply() {} });
  const fibers = new Map<string, Fiber>();
  const definitions = new Map(
    specs.map((spec) => [spec.id, definition(spec, specs)]),
  );
  let closed = false;

  function fiber(id: string): Fiber {
    const current = fibers.get(id);
    if (!current) {
      throw new Error(`No enabled plugin ${id}`);
    }
    return current;
  }

  async function settle(current: Fiber): Promise<void> {
    try {
      await current.await();
    } catch {
      /* Recorded by the Cordis logger exporter; state() reports failed. */
    }
  }

  return {
    errors,
    async enable(id) {
      if (closed) {
        throw new Error("cordis harness has been disposed");
      }
      let current = fibers.get(id);
      if (!current || current.uid === null) {
        const plugin = definitions.get(id);
        if (!plugin) {
          throw new Error(`No plugin ${id}`);
        }
        current = app.ctx.plugin(plugin);
        fibers.set(id, current);
      }
      await settle(current);
    },
    async disable(id) {
      await fiber(id).dispose();
    },
    async restart(id) {
      await fiber(id).restart();
    },
    async dispose() {
      closed = true;
      await app.dispose();
    },
    state(id): LifecycleState {
      const current = fibers.get(id);
      if (!current || current.uid === null) {
        return "inactive";
      }
      switch (current.state as number) {
        case FiberState.LOADING:
          return "starting";
        case FiberState.ACTIVE:
          return "active";
        case FiberState.FAILED:
          return "failed";
        case FiberState.UNLOADING:
          return "stopping";
        default:
          return "inactive";
      }
    },
    service: (name) => root.get(name) as BackingService | undefined,
  };
};

function definition(spec: PluginSpec, specs: readonly PluginSpec[]): Plugin {
  const inject = (spec.requires ?? []).map((id): ServiceName => {
    const service = specs.find((candidate) => candidate.id === id)?.provides;
    if (!service) {
      throw new Error(`${id} must declare a provided service`);
    }
    return service;
  });
  return {
    name: spec.id,
    inject,
    apply: (ctx: Context) =>
      spec.activate({
        acquire: (release) =>
          ctx.effect(
            () => release,
            "conformance resource",
          ) as () => Promise<void>,
        provide: (name, value) => {
          ctx.provide(name, value);
        },
        get: (name) => ctx.get(name) as BackingService,
      }),
  };
}
