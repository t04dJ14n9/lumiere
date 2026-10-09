import {
  runtimeStates,
  type RuntimePluginState,
} from "../../shared/plugin-state";
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
  rank?: (owner: string) => number;
}

export function createPanel(
  shell: PanelShell,
  documents: Documents,
  workbench: Workbench,
  options: PanelOptions,
): EditorPanel {
  const { onClose, onState, configure, rank = () => 0 } = options;
  const owned = Context.create({ rank });
  const session = documents.session(shell.document);
  const rpc = createPanelEndpoint(shell.transport);
  owned.provide("workbench", workbench);
  owned.provide("rpc", rpc);
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
    dispose: () => shell.dispose(),
  };
  let detach: (() => void | Promise<void>) | undefined;
  owned.effect(() => () => documents.release(shell.document));
  owned.effect(() => () => rpc.dispose());
  owned.effect(() => () => detach?.());
  owned.effect(() =>
    shell.onDispose(() => {
      onClose();
      void owned.dispose();
    }),
  );
  owned.effect(() => shell.onState(onState));
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
        features: config.features ?? {},
        editor: editorConfig.parse(config.editor ?? {}),
      };
    }),
  );
  registerClipboard(owned, rpc, workbench.clipboard);
  registerConfiguration(owned, rpc, shell.document, workbench);
  shell.setHTML(webviewHTML(shell));
  return panel;
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

function createPanelEndpoint(transport: PanelShell["transport"]): Endpoint {
  return new Endpoint(transport, {
    after(ms, callback) {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  });
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
