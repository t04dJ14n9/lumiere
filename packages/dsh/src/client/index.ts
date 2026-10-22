/**
 * Lumière's browser half in DSH. Notes in DSH's preview sidebar open in
 * Lumière's editor, a page the host half serves (host/routes.ts), instead of
 * DSH's read-only Markdown preview, which stays in the viewer menu. Written
 * against DSH's plugin module format: React comes from DSH's module table.
 */
import { parseOpenMessage } from "@workshop/host-node/embedding";
import { insideWorkspace, sessionAddress, workspaceRoot } from "./address";
import { onDshThemeChange, readDshTheme } from "./theme";

const ID = "@lumiere/dsh";
const BODY_ID = `${ID}/markdown`;

interface ReactLike {
  createElement(type: string, props?: Record<string, unknown> | null): unknown;
  useEffect(effect: () => void | (() => void), dependencies?: unknown[]): void;
  useRef<T>(value: T): { current: T };
}

/** What DSH hands a document body (`sidebar.right.tab.document`). */
interface BodyProps {
  readonly resourceAddress: string;
  readonly sessionId?: string;
  readonly content: {
    readonly kind: string;
    readonly revision?: number;
    loaded?(version: string): void;
    failed?(): void;
  };
  scrollportRef?(element: HTMLElement | null): void;
  useResource(address: string):
    | {
        readonly value?: {
          readonly absolutePath?: string;
          readonly version?: string;
        };
      }
    | undefined;
}

interface ClientContext {
  readonly documentPreviews: { register(definition: unknown): () => void };
  readonly slots: {
    inject(owner: string, register: () => () => void): () => void;
    register(options: unknown, component: unknown): () => void;
  };
  readonly sidebarRight: { openResource(address: string): void };
  effect(start: () => () => void): void;
}

declare global {
  interface Window {
    __ModuleLoader__: {
      load(module: {
        id: string;
        factory(require: (name: string) => unknown): unknown;
      }): void;
    };
  }
}

window.__ModuleLoader__.load({
  id: ID,
  factory(require) {
    const React = require("react") as ReactLike;
    return {
      inject: ["documentPreviews", "slots", "sidebarRight"],
      apply(ctx: ClientContext) {
        ctx.effect(() =>
          ctx.documentPreviews.register({
            id: BODY_ID,
            extensions: ["md", "markdown"],
            priority: "extension",
            title: () => "Lumière",
            loading: "renderer",
          }),
        );
        const body = noteBody(React, (address) =>
          ctx.sidebarRight.openResource(address),
        );
        ctx.effect(() =>
          ctx.slots.inject("sidebar.right.tab.document", () =>
            ctx.slots.register(
              { name: "sidebar.right.tab.document", key: BODY_ID },
              body,
            ),
          ),
        );
      },
    };
  },
});

function noteBody(React: ReactLike, open: (address: string) => void) {
  return function LumiereNote(props: BodyProps): unknown {
    const frame = React.useRef<HTMLIFrameElement | null>(null);
    const hasLoaded = React.useRef(false);
    const file = props.useResource(props.resourceAddress)?.value;
    const absolute = file?.absolutePath;
    const root = absolute
      ? workspaceRoot(props.resourceAddress, absolute)
      : undefined;
    React.useEffect(
      () => followOpens(frame, { sessionId: props.sessionId, root, open }),
      [props.sessionId, root],
    );
    React.useEffect(() => onDshThemeChange(() => sendTheme(frame.current)), []);
    // DSH starts a new revision whenever the file changes, including Lumière's
    // own saves. The editor already follows the file, so it stays put and only
    // tells DSH the revision is shown; reloading would lose caret and scroll.
    React.useEffect(() => {
      if (hasLoaded.current) {
        props.content.loaded?.(file?.version ?? "lumiere");
      }
    }, [props.content.revision]);
    // DSH shows its loading state until the file's path is known.
    if (!absolute) {
      return null;
    }
    const query = new URLSearchParams({
      path: absolute,
      ...(root ? { root } : {}),
    });
    const src = `/lumiere/editor?${query.toString()}`;
    return React.createElement("iframe", {
      key: src,
      ref: (element: HTMLIFrameElement | null) => {
        frame.current = element;
        props.scrollportRef?.(element);
      },
      src,
      title: "Lumière",
      allow: "clipboard-read; clipboard-write",
      onLoad: () => {
        hasLoaded.current = true;
        sendTheme(frame.current);
        props.content.loaded?.(file?.version ?? "lumiere");
      },
      onError: () => props.content.failed?.(),
      style: { border: 0, width: "100%", height: "100%", display: "block" },
    });
  };
}

/** The page takes DSH's theme from a theme message (embedding.ts). */
function sendTheme(frame: HTMLIFrameElement | null): void {
  frame?.contentWindow?.postMessage(readDshTheme(), location.origin);
}

/** The page asks to open another note (a link to it): open it in a DSH tab. */
function followOpens(
  frame: { current: HTMLIFrameElement | null },
  target: {
    sessionId: string | undefined;
    root: string | undefined;
    open(address: string): void;
  },
): () => void {
  const listener = (event: MessageEvent) => {
    const request =
      event.origin === location.origin &&
      event.source === frame.current?.contentWindow
        ? parseOpenMessage(event.data)
        : undefined;
    if (
      request &&
      target.sessionId &&
      // A page may only open notes in its own workspace.
      (target.root === undefined || insideWorkspace(target.root, request.path))
    ) {
      target.open(sessionAddress(target.sessionId, target.root, request.path));
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
