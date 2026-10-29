/**
 * Which side panels show: the files on the left, the outline on the right.
 * A wide window lays them out as columns beside the notes and keeps the
 * choice between launches (ui-state.ts). A narrow one (an iPad in portrait,
 * Split View, a small window) gives the note the whole width: one panel at a
 * time floats over it, only as tall as its content, and steps aside once a
 * note or a heading is chosen or the note is tapped. That choice is not kept.
 */
import { useCallback, useState, useSyncExternalStore } from "react";
import type { UiState } from "../shared/ui-state";
import type { UiStateHandle } from "./ui-state";

export type Panel = "sidebar" | "outline";

/** Narrower than this, the panels float (styles.css, `.floating-panel`). */
export const NARROW_QUERY = "(max-width: 1199.98px)";

type SavedPanels = Pick<UiState, Panel>;

/** Whether each panel shows. */
export function shownPanels(
  narrow: boolean,
  floating: Panel | undefined,
  saved: SavedPanels,
): Record<Panel, boolean> {
  return narrow
    ? { sidebar: floating === "sidebar", outline: floating === "outline" }
    : { sidebar: saved.sidebar, outline: saved.outline };
}

/**
 * What toggling a panel changes: the saved layout in a wide window, the
 * floating panel in a narrow one, where the other panel makes way.
 */
export function togglePanel(
  panel: Panel,
  narrow: boolean,
  floating: Panel | undefined,
  saved: SavedPanels,
):
  | { readonly floating: Panel | undefined }
  | { readonly save: Partial<UiState> } {
  if (narrow) {
    return { floating: floating === panel ? undefined : panel };
  }
  return { save: { [panel]: !saved[panel] } };
}

/**
 * What the window shows while no note is open. A narrow one offers its
 * files with a button while they are put away; once they float, the card is
 * the choice, and a button beside it would only put the card away again,
 * since the clear layer under the card takes the tap. A wide one points at
 * its files.
 */
export function emptyNotePrompt(
  narrow: boolean,
  filesShown: boolean,
): "button" | "hint" | "none" {
  if (!narrow) {
    return "hint";
  }
  return filesShown ? "none" : "button";
}

export interface Panels {
  /** The panels float over the note rather than sit beside it. */
  readonly narrow: boolean;
  readonly sidebar: boolean;
  readonly outline: boolean;
  toggle(panel: Panel): void;
  hide(panel: Panel): void;
  /** A note or heading was chosen, or the note tapped: a floating panel steps aside. */
  dismiss(): void;
}

export function usePanels(ui: UiStateHandle): Panels {
  const narrow = useMediaQuery(NARROW_QUERY);
  // A narrow window starts with the files, as there is no note to show yet.
  const [floating, setFloating] = useState<Panel | undefined>("sidebar");
  const [wasNarrow, setWasNarrow] = useState(narrow);
  if (wasNarrow !== narrow) {
    setWasNarrow(narrow);
    setFloating(undefined);
  }
  const { state, update } = ui;
  const toggle = useCallback(
    (panel: Panel) => {
      const change = togglePanel(panel, narrow, floating, state);
      if ("save" in change) {
        update(change.save);
      } else {
        setFloating(change.floating);
      }
    },
    [narrow, floating, state, update],
  );
  const hide = useCallback(
    (panel: Panel) => {
      if (narrow) {
        setFloating((current) => (current === panel ? undefined : current));
      } else {
        update({ [panel]: false });
      }
    },
    [narrow, update],
  );
  const dismiss = useCallback(() => setFloating(undefined), []);
  return {
    narrow,
    ...shownPanels(narrow, floating, state),
    toggle,
    hide,
    dismiss,
  };
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (changed: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", changed);
      return () => list.removeEventListener("change", changed);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
