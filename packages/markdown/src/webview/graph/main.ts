import { protocol } from "../../plugins/graph/protocol";
import { isCurrentGeneration } from "../../plugins/graph/admission";
import type { GraphSnapshot } from "../../plugins/graph/snapshot";
import { Endpoint } from "../../shared/rpc/endpoint";
import { webviewTransport } from "../transport";
import { mountCanvas } from "./canvas";
import { mountChrome } from "./chrome";
import { readPersisted } from "./persist";
import "./graph.css";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const persisted = readPersisted(vscode.getState());
const app = document.getElementById("app");
if (!app) {
  throw new Error("Vault graph container is missing");
}
const bar = document.createElement("header");
const canvasHost = document.createElement("div");
canvasHost.id = "graph-canvas";
app.append(bar, canvasHost);
const chrome = mountChrome(bar, persisted);
const canvas = mountCanvas(canvasHost, document.body.dataset.worker);
for (const [id, point] of Object.entries(persisted.positions)) {
  canvas.positions().set(id, point);
}
canvas.restoreCamera(persisted.camera);
let applied = 0;
let latest: GraphSnapshot | undefined;

const rpc = new Endpoint(
  webviewTransport(vscode),
  {
    after(ms, callback) {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  },
  undefined,
  { session: crypto.getRandomValues(new Uint32Array(4)).join("-") },
);

rpc.on(protocol, "snapshot", (snapshot) => {
  if (!isCurrentGeneration(applied, snapshot.generation)) {
    return;
  }
  applied = snapshot.generation;
  latest = snapshot;
  const drawn = canvas.apply(
    snapshot.nodes,
    snapshot.edges,
    canvas.positions(),
  );
  chrome.show(snapshot, drawn.needsRelayout);
  persist();
});
rpc.on(protocol, "stopLayout", () => canvas.stop());
chrome.onChange(() => {
  persist();
  void rpc
    .call(protocol, "view", {
      ...chrome.view(),
      relayout: false,
      saved: true,
    })
    .catch(report);
});
chrome.onRelayout(() => canvas.relayout());
canvas.onOpen((nodeId) => {
  if (!latest?.scopeId) {
    return;
  }
  void rpc
    .call(protocol, "open", {
      scopeId: latest.scopeId,
      nodeId,
      generation: latest.generation,
    })
    .catch(report);
});
canvas.onCamera(() => persist());
window.addEventListener("pagehide", () => canvas.destroy());

void rpc
  .call(protocol, "ready", {
    ...chrome.view(),
    relayout: false,
    saved: persisted.saved,
  })
  .catch(report);

function report(error: unknown): void {
  console.error(error);
}

function persist(): void {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [id, point] of canvas.positions()) {
    positions[id] = point;
  }
  vscode.setState({
    ...chrome.view(),
    saved: true,
    camera: canvas.camera(),
    positions,
  });
}
