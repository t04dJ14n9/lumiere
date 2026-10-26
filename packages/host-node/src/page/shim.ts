/**
 * Stands in for VS Code's webview API in a Lumière editor page outside VS
 * Code. In VS Code a webview posts with `acquireVsCodeApi().postMessage` and
 * hears the extension through `message` events; here both travel over the
 * page's socket to its panel on the host. The embedder (DSH's preview plugin,
 * the app shell) sends the theme (embedding.ts). Runs before the editor's
 * module (host/page.ts puts it first).
 */
import {
  isEmbeddingMessage,
  isShownMessage,
  parseThemeMessage,
} from "../embedding";
import { parseHostFrame, type PageFrame } from "../protocol";
import { applyTheme, followSystemTheme } from "./theme";
import { reportContextMenus } from "./context-menu";
import { createUi } from "./ui";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const panelId =
  document.querySelector<HTMLMetaElement>('meta[name="lumiere-panel"]')
    ?.content ?? "";
const send = connect(panelId);
window.acquireVsCodeApi = () => vsCodeApi(send);
listenToEmbedder(send);
reportFocus(send);
reportContextMenus(send);

/**
 * The embedder's messages arrive as `message` events, like the editor's RPC.
 * This listener is registered first and keeps them from the editor.
 */
function listenToEmbedder(send: (frame: PageFrame) => void): void {
  const stopFollowingSystem = followSystemTheme();
  window.addEventListener("message", (event) => {
    if (!isEmbeddingMessage(event.data)) {
      return;
    }
    event.stopImmediatePropagation();
    if (event.source !== window.parent || event.origin !== location.origin) {
      return;
    }
    const theme = parseThemeMessage(event.data);
    if (theme) {
      stopFollowingSystem();
      applyTheme(theme);
    } else if (isShownMessage(event.data)) {
      // Shown is active, as when the reader clicks in (reportFocus).
      send({ ch: "ui", data: { type: "focus" } });
    }
  });
}

function connect(panel: string): (frame: PageFrame) => void {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(
    `${scheme}://${location.host}/lumiere/socket?panel=${encodeURIComponent(panel)}`,
  );
  const waiting: string[] = [];
  const handleUi = createUi((frame) => send(frame));
  socket.addEventListener("open", () => {
    for (const text of waiting.splice(0)) {
      socket.send(text);
    }
  });
  socket.addEventListener("message", (event) => {
    const frame = parseHostFrame(String(event.data));
    if (!frame) {
      return;
    }
    if (frame.ch === "rpc") {
      // The editor's transport accepts messages from this page's own origin.
      window.dispatchEvent(
        new MessageEvent("message", {
          data: frame.data,
          origin: location.origin,
        }),
      );
    } else {
      handleUi(frame.data);
    }
  });
  socket.addEventListener("close", () => {
    document.body.dataset.lumiereDisconnected = "";
  });
  function send(frame: PageFrame): void {
    const text = JSON.stringify(frame);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(text);
    } else {
      waiting.push(text);
    }
  }
  return send;
}

/** Saved view state (scroll, folds) lives with the tab, as VS Code keeps it with the webview. */
function vsCodeApi(send: (frame: PageFrame) => void): VsCodeApi {
  const key = `lumiere:state:${location.search}`;
  return {
    postMessage: (message) => send({ ch: "rpc", data: message }),
    getState: () => {
      try {
        const saved = sessionStorage.getItem(key);
        return saved === null ? undefined : JSON.parse(saved);
      } catch {
        return undefined;
      }
    },
    setState: (state) => {
      try {
        sessionStorage.setItem(key, JSON.stringify(state));
      } catch {
        // A full or blocked storage only loses the saved scroll position.
      }
    },
  };
}

/** The host's active panel is the one the reader is in. */
function reportFocus(send: (frame: PageFrame) => void): void {
  const focus = () => send({ ch: "ui", data: { type: "focus" } });
  window.addEventListener("focus", focus);
  window.addEventListener("pointerdown", focus, { capture: true });
  window.addEventListener("blur", () =>
    send({ ch: "ui", data: { type: "blur" } }),
  );
}
