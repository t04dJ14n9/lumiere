/**
 * The host services VS Code's window provides (messages, prompts, the
 * clipboard, the active editor), done by the editor page the reader is in.
 */
import type { Disposer } from "@workshop/core";
import {
  MARKDOWN_EDITOR,
  type ActiveEditor,
  type Clipboard,
  type Dialogs,
  type PickItem,
} from "@workshop/markdown/portable";
import { questionId, type LivePanel } from "./panel";
import type { PanelHub } from "./panels";
import type { PickRow } from "../protocol";

/** The page to show something on: the active one, else the newest. */
export function presentingPanel(panels: PanelHub): LivePanel | undefined {
  return panels.active() ?? panels.all().at(-1);
}

export function createDialogs(
  panels: PanelHub,
  log: (message: string) => void,
): Dialogs {
  const id = questionId;
  return {
    error: (message) => toast(panels, log, "error", message),
    inform: (message) => toast(panels, log, "info", message),
    async ask(message, actions) {
      const panel = presentingPanel(panels);
      const answer = await panel?.ask({
        type: "ask",
        id: id(),
        message,
        actions: [...actions],
      });
      return typeof answer === "string" && actions.includes(answer)
        ? answer
        : undefined;
    },
    pick: (options) => pick(panels, id(), options),
    input: (options) => input(panels, id, options),
  };
}

function toast(
  panels: PanelHub,
  log: (message: string) => void,
  kind: "info" | "error",
  message: string,
): void {
  log(message);
  presentingPanel(panels)?.tell({ type: "toast", kind, message });
}

async function pick<T>(
  panels: PanelHub,
  id: number,
  options: {
    placeholder: string;
    items(query: string): readonly PickItem<T>[];
  },
): Promise<{ item?: PickItem<T>; query: string } | undefined> {
  const panel = presentingPanel(panels);
  if (!panel) {
    return undefined;
  }
  let query = "";
  let items = options.items(query);
  // The page filters by asking again as the reader types.
  const stop = panel.onUi((event) => {
    if (event.type === "query" && event.id === id) {
      query = event.query;
      items = options.items(query);
      panel.tell({ type: "pickItems", id, items: rows(items) });
    }
  });
  try {
    const answer = await panel.ask({
      type: "pick",
      id,
      placeholder: options.placeholder,
      items: rows(items),
    });
    if (answer === null) {
      return undefined;
    }
    const item = typeof answer === "number" ? items[answer] : undefined;
    return item ? { item, query } : { query };
  } finally {
    stop();
  }
}

function rows<T>(items: readonly PickItem<T>[]): PickRow[] {
  return items.slice(0, 200).map((item) => ({
    label: item.label,
    ...(item.description === undefined
      ? {}
      : { description: item.description }),
    ...(item.detail === undefined ? {} : { detail: item.detail }),
  }));
}

/** The page cannot run `validate`, so a rejected value is asked for again with its error. */
async function input(
  panels: PanelHub,
  id: () => number,
  options: Parameters<Dialogs["input"]>[0],
): Promise<string | undefined> {
  const panel = presentingPanel(panels);
  let value = options.value;
  let error: string | undefined;
  for (;;) {
    const answer = await panel?.ask({
      type: "input",
      id: id(),
      prompt: options.prompt,
      value,
      ...(error === undefined ? {} : { error }),
    });
    if (typeof answer !== "string") {
      return undefined;
    }
    error = options.validate(answer);
    if (error === undefined) {
      return answer;
    }
    value = answer;
  }
}

/** Writes go through the page, whose browser holds the clipboard. */
export function createClipboard(panels: PanelHub): Clipboard {
  let last = "";
  return {
    // A page cannot read the clipboard without asking; what Lumière wrote is the best guess.
    read: async () => last,
    write: async (text) => {
      last = text;
      presentingPanel(panels)?.tell({ type: "clipboard", text });
    },
  };
}

export function createActiveEditor(panels: PanelHub): ActiveEditor {
  return {
    note: () => panels.active()?.document.uri,
    onNoteChanged: (listener: () => void): Disposer =>
      panels.onActiveChanged(listener),
    // Notes open only in Lumière here; there is no text editor to read.
    textEditor: () => undefined,
    onTextSelectionChanged: () => () => {},
    customEditorViewType: () =>
      panels.active() ? MARKDOWN_EDITOR.viewType : undefined,
    // One view per note outside VS Code, so Toggle Text Editor leaves no sibling tab.
    closeSiblingTabs: async () => {},
  };
}
