import {
  runtimeStates,
  type RuntimePluginState,
} from "../../shared/plugin-state";
import { registerPanelLogging } from "./logging";
import { taggedLogger, createRoot } from "@workshop/core";
import type { Logger, RootContext } from "@workshop/core";
import type { Documents } from "../document/api";
import type { EditorPanel } from "./api";
import type { PanelShell, Workshop } from "../../shared/runtime";
import { Endpoint, RpcError } from "../../shared/rpc/endpoint";
import { config as editorConfig } from "./manifest";
import { protocol } from "./protocol";
import { webviewHTML } from "./webview-html";
interface PanelOptions {
  onClose(): void;
  onState(): void;
  configure(context: RootContext, shell: PanelShell): void;
  logger?: Logger;
  rank?: (owner: string) => number;
}

export function createPanel(
  shell: PanelShell,
  documents: Documents,
  workshop: Workshop,
  options: PanelOptions,
): EditorPanel {
  const { onClose, onState, configure, rank = () => 0 } = options;
  const owned = createRoot({
    rank,
    ...(options.logger && {
      logger: taggedLogger(options.logger, shell.id),
    }),
  });
  const session = documents.session(shell.document);
  const rpc = createPanelEndpoint(shell.transport, owned.logger);
  owned.provide("workshop", workshop);
  owned.provide("rpc", rpc);
  registerPanelLogging(
    owned,
    rpc,
    () => workshop.config(shell.document).debugLogging ?? false,
  );
  configure(owned, shell);
  const reporting = panelReporting(owned, rpc, shell.document, workshop);
  const panel: EditorPanel = {
    ...reporting,
    get ready() {
      return reporting.ready;
    },
    get webviewGeneration() {
      return reporting.webviewGeneration;
    },
    id: shell.id,
    get column() {
      return shell.column;
    },
    document: shell.document,
    session,
    rpc,
    active: () => shell.active(),
    reveal: () => shell.reveal(),
    dispose: () => close(),
  };
  const close = panelShutdown(owned, shell, onClose);
  owned.effect(() => () => documents.release(shell.document));
  owned.effect(() => () => rpc.dispose());
  owned.effect(() => shell.onState(onState));
  registerSessionHandshake(owned, { shell, session, rpc, workshop });
  registerClipboard(owned, rpc, workshop.clipboard);
  registerConfiguration(owned, rpc, shell.document, workshop);
  shell.setHTML(webviewHTML(shell));
  return panel;
}

function registerSessionHandshake(
  owned: RootContext,
  options: {
    shell: PanelShell;
    session: EditorPanel["session"];
    rpc: Endpoint;
    workshop: Workshop;
  },
): void {
  const { shell, session, rpc, workshop } = options;
  let detach: (() => void | Promise<void>) | undefined;
  owned.effect(() => () => detach?.());
  owned.effect(() =>
    rpc.handle(protocol, "ready", async (_request, token) => {
      owned.emit("editor/loading");
      await owned.settled();
      await workshop.configuration?.prepare(shell.document.uri);
      if (token.cancelled || !owned.isLive) {
        throw new RpcError("Cancelled", "Renderer replaced");
      }
      await detach?.();
      if (token.cancelled || !owned.isLive) {
        throw new RpcError("Cancelled", "Renderer replaced");
      }
      detach = session.attach(shell.id, rpc);
      const config = workshop.config(shell.document);
      return {
        text: session.text,
        version: session.version,
        clientID: shell.id,
        trusted: shell.trusted,
        source: shell.document.uri,
        ...config,
        debugLogging: config.debugLogging ?? false,
        features: config.features ?? {},
        editor: editorConfig.parse(config.editor ?? {}),
      };
    }),
  );
}

function registerClipboard(
  owned: RootContext,
  rpc: Endpoint,
  clipboard: Workshop["clipboard"],
): void {
  owned.effect(() =>
    rpc.handle(protocol, "clipboardRead", () => clipboard.read()),
  );
  owned.effect(() =>
    rpc.handle(protocol, "clipboardWrite", async ({ text }) => {
      await clipboard.write(text);
      return true;
    }),
  );
}

function registerConfiguration(
  owned: RootContext,
  rpc: Endpoint,
  document: PanelShell["document"],
  workshop: Workshop,
): void {
  if (workshop.onConfiguration) {
    owned.effect(() =>
      workshop.onConfiguration!(() => {
        sendConfiguration(rpc, document, workshop);
      }),
    );
  }
}

function createPanelEndpoint(
  transport: PanelShell["transport"],
  logger: Logger,
): Endpoint {
  return new Endpoint(
    transport,
    {
      after(ms, callback) {
        const timer = setTimeout(callback, ms);
        return () => clearTimeout(timer);
      },
    },
    logger,
    {
      session: crypto.getRandomValues(new Uint32Array(4)).join("-"),
      restartOn: "editor/ready",
    },
  );
}

function panelReporting(
  owned: RootContext,
  rpc: Endpoint,
  document: PanelShell["document"],
  workshop: Workshop,
) {
  let initialized = () => {};
  let ready = new Promise<void>((resolve) => {
    initialized = resolve;
  });
  let remote: readonly RuntimePluginState[] = [];
  let seenLoading = false;
  let webviewGeneration = 0;
  owned.on("editor/loading", () => {
    if (seenLoading) {
      webviewGeneration++;
      initialized();
      ready = new Promise<void>((resolve) => {
        initialized = resolve;
      });
      remote = [];
    }
    seenLoading = true;
  });
  owned.effect(() => rpc.on(protocol, "initialized", () => initialized()));
  owned.effect(() => () => initialized());
  owned.effect(() =>
    rpc.on(protocol, "pluginsChanged", (states) => {
      remote = states;
    }),
  );
  return {
    get ready() {
      return ready;
    },
    get webviewGeneration() {
      return webviewGeneration;
    },
    webviewPluginStates: () => remote,
    pluginStates: () => [...runtimeStates(owned), ...remote],
    async refreshPlugins() {
      await ready;
      owned.emit("editor/configure");
      sendConfiguration(rpc, document, workshop);
      await owned.settled();
      remote = await rpc.call(protocol, "plugins", {});
    },
  };
}
function sendConfiguration(
  rpc: Endpoint,
  document: PanelShell["document"],
  workshop: Workshop,
): void {
  const config = workshop.config(document);
  rpc.notify(protocol, "configureLogging", config.debugLogging ?? false);
  rpc.notify(
    protocol,
    "configureEditor",
    editorConfig.parse(config.editor ?? {}),
  );
  rpc.notify(
    protocol,
    "configure",
    config.preset === "minimal" ? {} : (config.features ?? {}),
  );
}

/**
 * One shutdown, shared by the host's dispose and VS Code closing the panel
 * (which re-enters here from `shell.dispose()`): the close notification
 * cannot skip the cleanup, and every caller awaits it. Never rejects.
 *
 * Order and error handling: `onClose` first (the host forgets the panel), then
 * the shell, then the panel's own kernel. A failure in a step is logged and
 * never skips the next, so cleanup always runs. "Closed" as observed through
 * `onClose` means logical removal, not complete disposal: listeners of a
 * synchronous close event can still see the panel's kernel alive.
 */
function panelShutdown(
  owned: RootContext,
  shell: PanelShell,
  onClose: () => void,
): () => Promise<void> {
  let closing: Promise<void> | undefined;
  let shellClosed = false;
  const shutdown = async () => {
    try {
      onClose();
    } catch (error) {
      owned.logger.error("Panel close notification failed", error);
    }
    try {
      if (!shellClosed) {
        shellClosed = true;
        shell.dispose();
      }
    } catch (error) {
      owned.logger.error("Closing the panel failed", error);
    }
    // Never rejects: cleanup errors are logged by the context.
    await owned.dispose();
  };
  const close = (): Promise<void> => {
    if (!closing) {
      let adopt!: (work: Promise<void>) => void;
      closing = new Promise<void>((resolve) => (adopt = resolve));
      adopt(shutdown());
    }
    return closing;
  };
  owned.effect(() =>
    shell.onDispose(() => {
      shellClosed = true;
      void close();
    }),
  );
  return close;
}
