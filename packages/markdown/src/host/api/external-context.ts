import { createRoot } from "@workshop/core";
import type { Context, Services, Disposer } from "@workshop/core";
import type {
  ExternalPlugin,
  ExternalContext,
  PublicServices,
  ExternalEvents,
} from "./plugin-types";
import type { ServiceBindings } from "./external-services";
import { externalServices, ownedDisposable } from "./external-services";
import { RpcError } from "../../shared/rpc/lifecycle";
import { editorSnapshot } from "./snapshots";
const serviceDependencies: Record<
  keyof PublicServices,
  readonly (keyof Services)[]
> = {
  editors: ["editors", "editorActions", "selections"],
  vault: ["vaults"],
  markers: ["markers", "settings"],
  commands: ["hostCommands"],
  codeBlocks: ["codeBlocks"],
  logger: [],
};
export function externalInjection(definition: ExternalPlugin) {
  const required = new Set<keyof Services>(["hostCommands", "editors"]);
  const optional = new Set<keyof Services>();
  for (const key of definition.inject?.required ?? []) {
    for (const dependency of serviceDependencies[key]) {
      required.add(dependency);
    }
  }
  for (const key of definition.inject?.optional ?? []) {
    for (const dependency of serviceDependencies[key]) {
      optional.add(dependency);
    }
  }
  // Building facades must not probe undeclared internal services on the host context.
  for (const dependencies of Object.values(serviceDependencies)) {
    for (const dependency of dependencies) {
      if (!required.has(dependency)) {
        optional.add(dependency);
      }
    }
  }
  return {
    required: [...required],
    optional: [...optional].filter((key) => !required.has(key)),
  };
}
export async function applyExternal(
  definition: ExternalPlugin,
  bindings: ServiceBindings,
  capture: (services: Partial<PublicServices>) => void,
): Promise<void> {
  const services = externalServices(bindings);
  capture(services);
  const isolated = createRoot({ logger: bindings.host.logger });
  bindings.host.effect(() => () => isolated.dispose());
  for (const [key, value] of Object.entries(services)) {
    if (key !== "logger") {
      isolated.provide(key as keyof Services, value as never);
    }
  }
  const required = (definition.inject?.required ?? []).filter(
    (key) => key !== "logger",
  ) as (keyof Services)[];
  const optional = (definition.inject?.optional ?? []).filter(
    (key) => key !== "logger",
  ) as (keyof Services)[];
  const fiber = isolated.plugin({
    name: definition.id,
    inject: { required, optional },
    apply(ctx) {
      return definition.apply(publicContext(ctx, definition, bindings));
    },
  });
  await isolated.settled();
  if (fiber.state === "failed") {
    throw fiber.error;
  }
}
function publicContext(
  ctx: Context,
  definition: ExternalPlugin,
  bindings: ServiceBindings,
): ExternalContext {
  const declared = new Set([
    ...(definition.inject?.required ?? []),
    ...(definition.inject?.optional ?? []),
    "logger",
  ]);
  // A plugin may keep its context after being disabled; report that in API
  // terms rather than with the kernel's internal Disposed error.
  let live = true;
  ctx.effect(() => () => {
    live = false;
  });
  const methods = Object.freeze({
    effect: (create: () => { dispose(): void } | Disposer) =>
      ownedDisposable(ctx, ctx.effect(create)),
    on: <K extends keyof ExternalEvents>(
      name: K,
      listener: ExternalEvents[K],
    ) => subscribeExternal(ctx, bindings, name, listener),
  });
  return new Proxy(methods, {
    get(target, key) {
      if (key === "then") {
        return undefined;
      }
      if (Object.hasOwn(target, key)) {
        return Reflect.get(target, key);
      }
      if (!live) {
        throw new RpcError("PluginDisabled", "External plugin is disabled");
      }
      if (typeof key !== "string" || !declared.has(key)) {
        throw new RpcError(
          "UndeclaredService",
          `External service ${String(key)} is unavailable`,
        );
      }
      return Reflect.get(ctx, key);
    },
  }) as unknown as ExternalContext;
}
function subscribeExternal<K extends keyof ExternalEvents>(
  ctx: Context,
  bindings: ServiceBindings,
  name: K,
  listener: ExternalEvents[K],
) {
  const { host, platform, available } = bindings;
  const callback = listener as (...args: unknown[]) => unknown;
  let stop: Disposer;
  switch (name) {
    case "editor/opened":
      stop = host.on("editor/opened", (panel) => {
        if (available(panel.id)) {
          callback(editorSnapshot(panel, platform));
        }
      });
      break;
    case "editor/closed":
      stop = host.on("editor/closed", (panel) => {
        callback(Object.freeze({ editorId: panel.id }));
      });
      break;
    case "editor/activeChanged":
      stop = host.on("editor/activeChanged", (panel) => {
        callback(
          panel && available(panel.id)
            ? editorSnapshot(panel, platform)
            : undefined,
        );
      });
      break;
    case "editor/selectionChanged":
      stop = host.on("editor/selectionChanged", (panel, hasSelection) => {
        if (available(panel.id)) {
          callback(Object.freeze({ editorId: panel.id, hasSelection }));
        }
      });
      break;
    case "links/open":
      stop = subscribeLinks(bindings, callback);
      break;
    default:
      throw new RpcError("InvalidArgument", "Unsupported external event");
  }
  return ownedDisposable(ctx, stop);
}
export function validateExternal(
  definition: ExternalPlugin,
  installed: (id: string) => boolean,
): void {
  if (
    !definition ||
    typeof definition.ownerExtensionId !== "string" ||
    !/^[\w-]+\.[\w.-]+$/.test(definition.ownerExtensionId) ||
    !installed(definition.ownerExtensionId)
  ) {
    throw new RpcError(
      "InvalidArgument",
      "External owner must be an installed extension",
    );
  }
  validateDefinition(definition);
  for (const key of [
    ...(definition.inject?.required ?? []),
    ...(definition.inject?.optional ?? []),
  ]) {
    if (!Object.hasOwn(serviceDependencies, key)) {
      throw new RpcError(
        "InvalidArgument",
        `Unsupported public service ${key}`,
      );
    }
  }
}

function subscribeLinks(
  { host, platform, available }: ServiceBindings,
  callback: (...args: unknown[]) => unknown,
): Disposer {
  return host.on("links/open", (request) => {
    if (!request.editorId || !available(request.editorId)) {
      return undefined;
    }
    const result = callback(
      Object.freeze({
        editorId: request.editorId,
        source: platform.uri(request.source),
        href: request.href,
        side: request.side,
      }),
    );
    return result === undefined
      ? undefined
      : Promise.resolve(result).then((value) => {
          if (value !== true) {
            throw new RpcError(
              "InvalidArgument",
              "A claimed link must resolve true",
            );
          }
          return true as const;
        });
  });
}

function validateDefinition(definition: ExternalPlugin): void {
  const publisher = definition.ownerExtensionId.split(".")[0];
  if (
    typeof definition.id !== "string" ||
    !definition.id.startsWith(`${publisher}.`) ||
    !/^[\w.-]{3,200}$/.test(definition.id) ||
    typeof definition.apply !== "function" ||
    typeof definition.defaultEnabled !== "boolean" ||
    typeof definition.title !== "string" ||
    typeof definition.description !== "string"
  ) {
    throw new RpcError(
      "InvalidArgument",
      "Invalid external plugin definition or namespace",
    );
  }
}
