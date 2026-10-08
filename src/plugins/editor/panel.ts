import { Context } from "../../kernel";
import type { Documents } from "../document/api";
import type { EditorPanel } from "./api";
import type { PanelShell, Workbench } from "../../shared/runtime";
import { Endpoint } from "../../shared/rpc/endpoint";
import { config as editorConfig } from "./manifest";
import { protocol } from "./protocol";
import { webviewHTML } from "./webview-html";
export function createPanel(
  shell: PanelShell,
  documents: Documents,
  workbench: Workbench,
  onClose: () => void,
  onState: () => void,
  configure: (context: Context, shell: PanelShell) => void,
  rank: (owner: string) => number = () => 0,
): EditorPanel {
  const owned = Context.create({ rank }),
    session = documents.session(shell.document);
  const rpc = new Endpoint(shell.transport, {
    after(ms, callback) {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  });
  owned.provide("workbench", workbench);
  owned.provide("rpc", rpc);
  configure(owned, shell);
  const panel: EditorPanel = {
    id: shell.id,
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
  owned.effect(() =>
    rpc.handle(protocol, "clipboardRead", () => workbench.clipboard.read()),
  );
  owned.effect(() =>
    rpc.handle(protocol, "clipboardWrite", async ({ text }) => {
      await workbench.clipboard.write(text);
      return true;
    }),
  );
  if (workbench.onConfiguration) {
    owned.effect(() =>
      workbench.onConfiguration!(() => {
        const config = workbench.config(shell.document);
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
      }),
    );
  }
  shell.setHTML(webviewHTML(shell));
  return panel;
}
