import {
  runtimeStates,
  type RuntimePluginState,
} from "../../shared/plugin-state";
import { registerPanelLogging } from "./logging";
import { taggedLogger, createRoot } from "@workshop/core";
import type { Logger, RootContext } from "@workshop/core";
import type { Documents } from "../document/api";
import type { EditorPanel } from "./api";
import type { PanelShell, HostServices } from "../../shared/host";
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
  host: Pick<HostServices, "settings" | "clipboard">,
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
  owned.provide("rpc", rpc);
  registerPanelLogging(
    owned,
    rpc,
    () => host.settings.forNote(shell.document).debugLogging ?? false,
  );
  // Kick off webview HTML (and editor.js fetch/parse) before panel host
  // plugins configure, so download overlaps with host work. ready still
  // waits for owned.settled() and settings prepare.
  shell.setHTML(webviewHTML(shell));
  configure(owned, shell);
  const reporting = panelReporting(owned, rpc, shell.document, host);
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
  registerSessionHandshake(owned, { shell, session, rpc, host });
  registerClipboard(owned, rpc, host.clipboard);
  registerConfiguration(owned, rpc, shell.document, host);
  return panel;
}

function registerSessionHandshake(
  owned: RootContext,
  options: {
    shell: PanelShell;
    session: EditorPanel["session"];
    rpc: Endpoint;
    host: Pick<HostServices, "settings" | "clipboard">;
  },
): void {
  const { shell, session, rpc, host } = options;
  let detach: (() => void | Promise<void>) | undefined;
  owned.effect(() => () => detach?.());
  owned.effect(() =>
    rpc.handle(protocol, "ready", async (_request, token) => {
      const readyStarted = performance.now();
      owned.emit("editor/loading");
      let settledMs = 0;
      let prepareMs = 0;
      await Promise.all([
        owned.settled().then(() => {
          settledMs = Math.round(performance.now() - readyStarted);
        }),
        host.settings.effective.prepare(shell.document.uri).then(() => {
          prepareMs = Math.round(performance.now() - readyStarted);
        }),
      ]);
      owned.logger.debug(
        `Panel ready: settled ${settledMs} ms, prepare ${prepareMs} ms`,
      );
      if (token.cancelled || !owned.isLive) {
        throw new RpcError("Cancelled", "Renderer replaced");
      }
      await detach?.();
      if (token.cancelled || !owned.isLive) {
        throw new RpcError("Cancelled", "Renderer replaced");
      }
      detach = session.attach(shell.id, rpc);
      const config = host.settings.forNote(shell.document);
      const init = {
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
      // After the ready payload is built: deferred panel hosts (blame, search,
      // suggest, …) may start without delaying the webview's first paint.
      owned.emit("editor/session-ready");
      return init;
    }),
  );
}

function registerClipboard(
  owned: RootContext,
  rpc: Endpoint,
  clipboard: HostServices["clipboard"],
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
  host: Pick<HostServices, "settings" | "clipboard">,
): void {
  owned.effect(() =>
    host.settings.onChange(() => {
      sendConfiguration(rpc, document, host);
    }),
  );
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
  host: Pick<HostServices, "settings" | "clipboard">,
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
      sendConfiguration(rpc, document, host);
      await owned.settled();
      remote = await rpc.call(protocol, "plugins", {});
    },
  };
}
function sendConfiguration(
  rpc: Endpoint,
  document: PanelShell["document"],
  host: Pick<HostServices, "settings" | "clipboard">,
): void {
  const config = host.settings.forNote(document);
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
