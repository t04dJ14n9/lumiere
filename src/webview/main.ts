import { webviewTransport } from "./transport";
import { Endpoint } from "../shared/rpc/endpoint";
import { bootstrap } from "./bootstrap";
import "./styles/index.css";
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
const vscode = acquireVsCodeApi();
const rpc = new Endpoint(webviewTransport(vscode), {
  after(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
});
void bootstrap(rpc, document.getElementById("app")!, {
  saved: vscode.getState(),
  persist: (state) => vscode.setState(state),
}).catch((error) => {
  document.getElementById("app")!.textContent =
    `Markdown Workbench could not open: ${String(error)}`;
});
