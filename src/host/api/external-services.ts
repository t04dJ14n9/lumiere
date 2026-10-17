import type { Context, Disposer } from "@workshop/core";
import type {
  PublicServices,
  EditorAction,
  CodeProcessor,
} from "./plugin-types";
import type { MarkdownWorkshopApi } from "./types";
import type { ApiPlatform } from "./platform";
import { RpcError } from "../../shared/rpc/lifecycle";
import { publicCancellation } from "./cancellation";
export interface ServiceBindings {
  host: Context;
  api: MarkdownWorkshopApi;
  platform: ApiPlatform;
  owner: string;
  available(editorId?: string): boolean;
}
export function ownedDisposable(ctx: Context, stop: Disposer) {
  const dispose = ctx.effect(() => stop);
  return Object.freeze({
    dispose: () => {
      void dispose();
    },
  });
}
export function externalServices(
  bindings: ServiceBindings,
): Partial<PublicServices> {
  const { host, api, available } = bindings;
  let live = true;
  host.effect(() => () => {
    live = false;
  });
  const assertLive = (editorId?: string) => {
    if (!live || !available(editorId)) {
      throw new RpcError("PluginDisabled", "External plugin is disabled");
    }
  };
  const services: {
    -readonly [K in keyof PublicServices]?: PublicServices[K];
  } = { logger: host.logger };
  if (host.editors) {
    services.editors = editorServices(bindings, assertLive);
  }
  if (host.vaults) {
    services.vault = Object.freeze({
      resolveLink: api.resolveLink,
      getMetadata: api.getMetadata,
      getBacklinks: api.getBacklinks,
      onDidResolveLinks: api.onDidResolveLinks,
    });
  }
  if (host.markers) {
    services.markers = markerServices(bindings, assertLive);
  }
  if (host.codeBlocks) {
    services.codeBlocks = processorServices(bindings, assertLive);
  }
  if (host.workshop) {
    services.commands = commandServices(bindings, assertLive);
  }
  return revokeServices(services, assertLive);
}
function editorServices(
  bindings: ServiceBindings,
  assertLive: (id?: string) => void,
): PublicServices["editors"] {
  const { host, api, available } = bindings;
  const register = (action: EditorAction, scope: "selection" | "title") => {
    assertLive();
    if (!action || typeof action.run !== "function") {
      throw new RpcError("InvalidArgument", "An action callback is required");
    }
    return ownedDisposable(
      host,
      host.editorActions.register({
        ...action,
        scope,
        isAvailable: available,
        run: (context, token) => {
          assertLive(context.editorId);
          return action.run(Object.freeze(context), publicCancellation(token));
        },
      }),
    );
  };
  return Object.freeze({
    getEditors: api.getEditors,
    getActiveEditor: api.getActiveEditor,
    open: api.open,
    reveal: api.reveal,
    getSelection: api.getSelection,
    registerSelectionAction: (action) => register(action, "selection"),
    registerTitleAction: (action) => register(action, "title"),
  });
}
/** Even read-only retained facades stop working when their provider generation stops. */
function revokeServices(
  services: Partial<PublicServices>,
  assertLive: () => void,
): Partial<PublicServices> {
  return Object.fromEntries(
    Object.entries(services).map(([name, service]) => [
      name,
      Object.freeze(
        Object.fromEntries(
          Object.entries(service).map(([key, method]) => [
            key,
            (...args: unknown[]) => {
              assertLive();
              return (method as (...args: unknown[]) => unknown)(...args);
            },
          ]),
        ),
      ),
    ]),
  ) as Partial<PublicServices>;
}

function markerServices(
  { host, available }: ServiceBindings,
  assertLive: (id?: string) => void,
): PublicServices["markers"] {
  const markers = host.markers;
  host.effect(
    () =>
      host.workshop.onConfiguration?.(() => {
        for (const panel of host.editors.all()) {
          if (!available(panel.id)) {
            markers.clear(panel.id);
          }
        }
      }) ?? (() => {}),
  );
  return Object.freeze<PublicServices["markers"]>({
    set(id, values) {
      assertLive(id);
      markers.set(id, values);
    },
    clear(id) {
      assertLive(id);
      markers.clear(id);
    },
    registerAction(id, run) {
      assertLive();
      return ownedDisposable(
        host,
        markers.registerAction(id, (context) => {
          assertLive(context.editorId);
          return run(context);
        }),
      );
    },
  });
}
function processorServices(
  { host, platform, available }: ServiceBindings,
  assertLive: () => void,
): PublicServices["codeBlocks"] {
  const codeBlocks = host.codeBlocks;
  return Object.freeze({
    register(processor: CodeProcessor) {
      assertLive();
      if (!processor || typeof processor.render !== "function") {
        throw new RpcError(
          "InvalidArgument",
          "A processor callback is required",
        );
      }
      return ownedDisposable(
        host,
        codeBlocks.register({
          language: processor.language,
          isAvailable: available,
          render: (source, context, token) =>
            processor.render(
              source,
              Object.freeze({ ...context, uri: platform.uri(context.uri) }),
              publicCancellation(token),
            ),
        }),
      );
    },
  });
}
function commandServices(
  { host, owner }: ServiceBindings,
  assertLive: (id?: string) => void,
): PublicServices["commands"] {
  return Object.freeze({
    register(id, run) {
      assertLive();
      if (
        typeof id !== "string" ||
        !id.startsWith(`${owner}.`) ||
        typeof run !== "function"
      ) {
        throw new RpcError(
          "InvalidArgument",
          "Commands must use the owner extension namespace",
        );
      }
      return ownedDisposable(
        host,
        host.workshop.command(id, () => {
          assertLive(host.editors.active()?.id);
          return run();
        }),
      );
    },
  });
}
