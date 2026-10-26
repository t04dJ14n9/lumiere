/**
 * One tab's editor: Lumière's page in an iframe, from the window's backend
 * (a server's route, or a page host-web made). The shell sends it the theme,
 * hears its requests to open other files, and hands it a channel to its host
 * when it asks for one (embedding.ts). Hidden tabs stay loaded, keeping
 * their state.
 */
import { useEffect, useRef, useState } from "react";
import {
  MENU_AT_SELECTION,
  parseConnectMessage,
  parseOpenMessage,
  SHOWN,
  type InsetMessage,
  type PortMessage,
} from "@workshop/host-node/embedding";
import { fileKind } from "../../shared/file-kind";
import { chromeInset, onChromeInset } from "../chrome-inset";
import { backend, type OpenedEditor } from "../backend";
import type { NoteTab } from "../tabs";
import { currentThemeMessage, onThemeChange } from "../theme";

export interface EditorFrameProps {
  readonly tab: NoteTab;
  readonly visible: boolean;
  /** The page asked to show another file (absolute path), e.g. a followed link. */
  readonly onOpen: (path: string) => void;
}

export function EditorFrame({ tab, visible, onOpen }: EditorFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const opened = useOpenedEditor(tab);
  useEffect(() => onThemeChange(() => sendTheme(frame.current)), []);
  useEffect(() => onChromeInset(() => sendInset(frame.current)), []);
  // The shown tab's note is the active one (Outline follows it), and it
  // takes the keyboard.
  useEffect(() => {
    if (visible) {
      show(frame.current);
    }
  }, [visible]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const page = frame.current?.contentWindow;
      if (!page || event.origin !== location.origin || event.source !== page) {
        return;
      }
      const request = parseOpenMessage(event.data);
      if (request) {
        onOpen(request.path);
      }
      const connect = parseConnectMessage(event.data);
      if (connect && opened.opened?.connect) {
        const answer: PortMessage = { lumiere: "port", panel: connect.panel };
        page.postMessage(answer, location.origin, [opened.opened.connect()]);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onOpen, opened.opened]);
  if (opened.error) {
    return (
      <p className="editor-error" hidden={!visible} role="alert">
        Could not open {tab.path}: {opened.error}
      </p>
    );
  }
  return opened.opened ? (
    <iframe
      ref={frame}
      // A PDF keeps its own toolbar below the window's glass (styles.css).
      className={
        fileKind(tab.path) === "pdf" ? "editor-frame is-pdf" : "editor-frame"
      }
      hidden={!visible}
      src={opened.opened.url}
      title={tab.path}
      allow="clipboard-read; clipboard-write"
      onLoad={() => {
        sendTheme(frame.current);
        sendInset(frame.current);
        if (visible) {
          show(frame.current);
        }
      }}
    />
  ) : null;
}

/**
 * Ask the shown note's page for its right-click menu at the selection
 * (More… in the iPad's edit menu); with Settings shown there is none.
 */
export function openShownPageMenu(): void {
  document
    .querySelector<HTMLIFrameElement>("iframe.editor-frame:not([hidden])")
    ?.contentWindow?.postMessage(MENU_AT_SELECTION, location.origin);
}

/** The tab's page, opened by the backend and disposed of when the tab goes. */
function useOpenedEditor(tab: NoteTab): {
  opened?: OpenedEditor;
  error?: string;
} {
  const [state, setState] = useState<{ opened?: OpenedEditor; error?: string }>(
    {},
  );
  useEffect(() => {
    let live = true;
    let opened: OpenedEditor | undefined;
    backend()
      .editors.open(tab.vault, tab.path)
      .then(
        (next) => {
          if (live) {
            opened = next;
            setState({ opened: next });
          } else {
            next.dispose();
          }
        },
        (error: unknown) =>
          live &&
          setState({
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    return () => {
      live = false;
      opened?.dispose();
    };
  }, [tab.vault, tab.path]);
  return state;
}

function show(frame: HTMLIFrameElement | null): void {
  frame?.contentWindow?.postMessage(SHOWN, location.origin);
  frame?.contentWindow?.focus();
}

/** How far the window's glass reaches over the page (chrome-inset.ts). */
function sendInset(frame: HTMLIFrameElement | null): void {
  const message: InsetMessage = { lumiere: "inset", top: chromeInset() };
  frame?.contentWindow?.postMessage(message, location.origin);
}

function sendTheme(frame: HTMLIFrameElement | null): void {
  frame?.contentWindow?.postMessage(currentThemeMessage(), location.origin);
}
