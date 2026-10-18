import * as vscode from "vscode";
import { JumpHistory } from "../../../shared/jump-history";
import {
  cloneHistoryEntry,
  sameHistoryEntry,
  type PdfHistoryEntry,
} from "../../../shared/pdf-history";
import type { ReadingPosition } from "../../../shared/reading-position";
import type { PdfPanel } from "../pdf/panel";
import type { PdfPanels } from "../pdf/panels";

interface PanelHistory {
  history: JumpHistory<PdfHistoryEntry>;
  /** A Back or Forward is running; another one waits for it. */
  busy: boolean;
  /** Advanced by anything that makes a running traversal stale. */
  generation: number;
  inheritedDeparture?: boolean;
}

export type Direction = "back" | "forward";

/** A separate memory-only jump history for each PDF editor, split views included. */
export class PdfHistories {
  private readonly states = new Map<PdfPanel, PanelHistory>();

  constructor(private readonly panels: PdfPanels) {}

  /** The viewer reported a deliberate jump (a link, a page number, the outline). */
  recordJump(panel: PdfPanel, from: ReadingPosition, to: ReadingPosition) {
    const state = this.stateFor(panel);
    state.generation++;
    delete state.inheritedDeparture;
    state.history.record(entry(panel, from), entry(panel, to));
    this.publish();
  }

  /** The active editor changed: a restore in an editor left behind is cancelled. */
  panelsChanged(): void {
    for (const [panel, state] of this.states) {
      if (state.busy && this.panels.active !== panel) {
        state.generation++;
        panel.cancelHistoryRestore();
      }
    }
    this.publish();
  }

  /** Go back or forward in `panel`'s history; false when nothing moved. */
  async traverse(
    panel: PdfPanel | undefined,
    direction: Direction,
  ): Promise<boolean> {
    if (!panel) {
      return false;
    }
    const state = this.stateFor(panel);
    if (state.busy) {
      return false;
    }
    state.busy = true;
    this.publish();
    try {
      return await this.move(panel, state, direction);
    } finally {
      state.busy = false;
      this.publish();
    }
  }

  dispose(): void {
    for (const [panel, state] of this.states) {
      state.generation++;
      panel.cancelHistoryRestore();
      panel.setHistoryState(false, false);
    }
    this.states.clear();
    this.publish();
  }

  /** Show which way each editor can go, and the active one's in the context keys. */
  publish(): void {
    for (const [panel, state] of this.states) {
      if (!this.panels.all.includes(panel)) {
        state.generation++;
        this.states.delete(panel);
        continue;
      }
      const ready = Boolean(panel.view) && !state.busy;
      panel.setHistoryState(
        ready && state.history.canGoBack,
        ready && state.history.canGoForward,
      );
    }
    const active = this.panels.active;
    const state = active?.view ? this.states.get(active) : undefined;
    const ready = Boolean(state && !state.busy);
    void vscode.commands.executeCommand(
      "setContext",
      "lumiere.pdf.historyBack",
      ready && Boolean(state?.history.canGoBack),
    );
    void vscode.commands.executeCommand(
      "setContext",
      "lumiere.pdf.historyForward",
      ready && Boolean(state?.history.canGoForward),
    );
  }

  private async move(
    panel: PdfPanel,
    state: PanelHistory,
    direction: Direction,
  ): Promise<boolean> {
    // The capture flushes any deliberate jump still settling in the viewer.
    const current = await panel.capturePosition();
    if (!current || this.panels.active !== panel || !this.states.has(panel)) {
      return false;
    }
    if (current.previousRestoreStarted === false && !state.inheritedDeparture) {
      state.history.releaseDeparture();
    }
    state.inheritedDeparture = state.history.hasDeparture;
    const generation = ++state.generation;
    const from = entry(panel, current.position);
    const transition =
      direction === "back"
        ? state.history.prepareBack(from)
        : state.history.prepareForward(from);
    if (!transition) {
      return false;
    }
    const actual = await panel.restoreHistory(
      transition.target.anchor,
      current.intent,
    );
    if (
      !actual ||
      state.generation !== generation ||
      this.panels.active !== panel
    ) {
      state.history.cancel(transition.token);
      return false;
    }
    return state.history.commit(transition.token, entry(panel, actual));
  }

  private stateFor(panel: PdfPanel): PanelHistory {
    let state = this.states.get(panel);
    if (!state) {
      state = {
        history: new JumpHistory({
          equals: sameHistoryEntry,
          clone: cloneHistoryEntry,
        }),
        busy: false,
        generation: 0,
      };
      this.states.set(panel, state);
    }
    return state;
  }
}

function entry(panel: PdfPanel, anchor: ReadingPosition): PdfHistoryEntry {
  return { kind: "pdf", uri: panel.uri.toString(), anchor };
}
