import {
  runtimeStates,
  type RuntimePluginState,
} from "../../shared/plugin-state";
import { registerPanelLogging } from "./logging";
import { taggedLogger } from "../../kernel/logger";
import type { Logger } from "../../kernel";
import { Context } from "../../kernel";
import type { Documents } from "../document/api";
import type { EditorPanel } from "./api";
import type { PanelShell, Workbench } from "../../shared/runtime";
import { Endpoint } from "../../shared/rpc/endpoint";
import { config as editorConfig } from "./manifest";
import { protocol } from "./protocol";
import { webviewHTML } from "./webview-html";
interface PanelOptions {
  onClose(): void;
  onState(): void;
  configure(context: Context, shell: PanelShell): void;
  logger?: Logger;
  rank?: (owner: string) => number;
}

export function createPanel(
  shell: PanelShell,
  documents: Documents,
  workbench: Workbench,
  options: PanelOptions,
): EditorPanel {
  const { onClose, onState, configure, rank = () => 0 } = options;
  const owned = Context.create({
    rank,
    ...(options.logger && {
      logger: taggedLogger(options.logger, shell.id),
    }),
  });
  const session = documents.session(shell.document);
  const rpc = createPanelEndpoint(shell.transport, owned.logger);
  owned.provide("workbench", workbench);
  owned.provide("rpc", rpc);
  registerPanelLogging(
    owned,
    rpc,
    () => workbench.config(shell.document).debugLogging ?? false,
  );
  configure(owned, shell);
  const panel: EditorPanel = {
    ...panelReporting(owned, rpc, shell.document, workbench),
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
  registerSessionHandshake(owned, { shell, session, rpc, workbench });
  registerClipboard(owned, rpc, workbench.clipboard);
  registerConfiguration(owned, rpc, shell.document, workbench);
  shell.setHTML(webviewHTML(shell));
  return panel;
}

function registerSessionHandshake(
  owned: Context,
  options: {
    shell: PanelShell;
    session: EditorPanel["session"];
    rpc: Endpoint;
    workbench: Workbench;
  },
): void {
  const { shell, session, rpc, workbench } = options;
  let detach: (() => void | Promise<void>) | undefined;
  owned.effect(() => () => detach?.());
  owned.effect(() =>
    rpc.handle(protocol, "ready", async () => {
      await owned.settled();
      await detach?.();
      detach = session.attach(shell.id, rpc);
      const config = workbench.config(shell.document);
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
  owned: Context,
  rpc: Endpoint,
  clipboard: Workbench["clipboard"],
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
  owned: Context,
  rpc: Endpoint,
  document: PanelShell["document"],
  workbench: Workbench,
): void {
  if (workbench.onConfiguration) {
    owned.effect(() =>
      workbench.onConfiguration!(() => {
        sendConfiguration(rpc, document, workbench);
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
  );
}

function panelReporting(
  owned: Context,
  rpc: Endpoint,
  document: PanelShell["document"],
  workbench: Workbench,
) {
  let initialized = () => {};
  const ready = new Promise<void>((resolve) => {
    initialized = resolve;
  });
  let remote: readonly RuntimePluginState[] = [];
  owned.effect(() => rpc.on(protocol, "initialized", initialized));
  owned.effect(() => initialized);
  owned.effect(() =>
    rpc.on(protocol, "pluginsChanged", (states) => {
      remote = states;
    }),
  );
  return {
    ready,
    webviewPluginStates: () => remote,
    pluginStates: () => [...runtimeStates(owned), ...remote],
    async refreshPlugins() {
      await ready;
      owned.emit("editor/configure");
      sendConfiguration(rpc, document, workbench);
      await owned.settled();
      remote = await rpc.call(protocol, "plugins", {});
    },
  };
}
function sendConfiguration(
  rpc: Endpoint,
  document: PanelShell["document"],
  workbench: Workbench,
): void {
  const config = workbench.config(document);
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
 */
function panelShutdown(
  owned: Context,
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
