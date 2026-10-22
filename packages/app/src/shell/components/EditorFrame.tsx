/**
 * One tab's editor: Lumière's page in an iframe (host-node's editor route).
 * The shell sends it the theme and hears its requests to open other files,
 * as embedding.ts describes. Hidden tabs stay loaded, keeping their state.
 */
import { useEffect, useRef } from "react";
import { parseOpenMessage, SHOWN } from "@workshop/host-node/embedding";
import { editorUrl } from "../api";
import type { Tab } from "../tabs";
import { currentThemeMessage, onThemeChange } from "../theme";

export interface EditorFrameProps {
  readonly tab: Tab;
  readonly visible: boolean;
  /** The page asked to show another file (absolute path), e.g. a followed link. */
  readonly onOpen: (path: string) => void;
}

export function EditorFrame({ tab, visible, onOpen }: EditorFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => onThemeChange(() => sendTheme(frame.current)), []);
  // The shown tab's note is the active one (Outline follows it), and it
  // takes the keyboard.
  useEffect(() => {
    if (visible) {
      show(frame.current);
    }
  }, [visible]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      ) {
        return;
      }
      const request = parseOpenMessage(event.data);
      if (request) {
        onOpen(request.path);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onOpen]);
  return (
    <iframe
      ref={frame}
      className="editor-frame"
      hidden={!visible}
      src={editorUrl(tab.vault, tab.path)}
      title={tab.path}
      allow="clipboard-read; clipboard-write"
      onLoad={() => {
        sendTheme(frame.current);
        if (visible) {
          show(frame.current);
        }
      }}
    />
  );
}

function show(frame: HTMLIFrameElement | null): void {
  frame?.contentWindow?.postMessage(SHOWN, location.origin);
  frame?.contentWindow?.focus();
}

function sendTheme(frame: HTMLIFrameElement | null): void {
  frame?.contentWindow?.postMessage(currentThemeMessage(), location.origin);
}
