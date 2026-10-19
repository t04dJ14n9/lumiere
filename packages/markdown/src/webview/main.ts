import { webviewLogging } from "../plugins/editor/logging";
import { protocol } from "../plugins/editor/protocol";
import { webviewTransport } from "./transport";
import { Endpoint } from "../shared/rpc/endpoint";
import { bootstrap } from "./bootstrap";
import "./styles/index.css";
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
performance.mark("mw:main");
const vscode = acquireVsCodeApi();
const logging = webviewLogging((record) => rpc.notify(protocol, "log", record));
const rpc: Endpoint = new Endpoint(
  webviewTransport(vscode),
  {
    after(ms, callback) {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  },
  logging.logger,
  { session: crypto.getRandomValues(new Uint32Array(4)).join("-") },
);
void bootstrap(
  rpc,
  document.getElementById("app")!,
  {
    saved: vscode.getState(),
    persist: (state) => vscode.setState(state),
  },
  logging,
).catch((error) => {
  logging.logger.error("Editor bootstrap failed", error);
  document.getElementById("app")!.textContent =
    `Lumière could not open: ${String(error)}`;
});
