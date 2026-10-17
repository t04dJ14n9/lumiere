import * as vscode from "vscode";
import { JumpHistory } from "../../../shared/jump-history";
import {
  cloneHistoryEntry,
  sameHistoryEntry,
  type PdfHistoryEntry,
} from "../../../shared/pdf-history";
import type { ReadingPosition } from "../../../shared/reading-position";
import type { PdfPanel } from "../pdf/panel";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import { HISTORY_COMMAND_IDS } from "../pdf/registered-commands";
import manifest from "./manifest";

interface PanelHistory {
  history: JumpHistory<PdfHistoryEntry>;
  busy: boolean;
  generation: number;
  inheritedDeparture?: boolean;
}

/** A separate memory-only stack for each editor, including split views of one PDF. */
export const pdfHistoryPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    const states = new Map<PdfPanel, PanelHistory>();
    const stateFor = (panel: PdfPanel): PanelHistory => {
      let state = states.get(panel);
      if (!state) {
        state = {
          history: new JumpHistory({
            equals: sameHistoryEntry,
            clone: cloneHistoryEntry,
          }),
          busy: false,
          generation: 0,
        };
        states.set(panel, state);
      }
      return state;
    };
    const entry = (
      panel: PdfPanel,
      anchor: ReadingPosition,
    ): PdfHistoryEntry => ({ kind: "pdf", uri: panel.uri.toString(), anchor });
    const publish = (): void => {
      for (const [panel, state] of states) {
        if (!panels.all.includes(panel)) {
          state.generation++;
          states.delete(panel);
          continue;
        }
        panel.setHistoryState(
          Boolean(panel.view) && !state.busy && state.history.canGoBack,
          Boolean(panel.view) && !state.busy && state.history.canGoForward,
        );
      }
      const active = panels.active?.view && states.get(panels.active);
      void vscode.commands.executeCommand(
        "setContext",
        "pdfWorkshop.historyBack",
        Boolean(active && !active.busy && active.history.canGoBack),
      );
      void vscode.commands.executeCommand(
        "setContext",
        "pdfWorkshop.historyForward",
        Boolean(active && !active.busy && active.history.canGoForward),
      );
    };
    const traverse = async (
      panel: PdfPanel | undefined,
      direction: "back" | "forward",
    ): Promise<boolean> => {
      if (!panel) {
        return false;
      }
      const state = stateFor(panel);
      if (state.busy) {
        return false;
      }
      state.busy = true;
      publish();
      try {
        // The capture flushes any deliberate jump still settling in the viewer.
        const current = await panel.capturePosition();
        if (!current || panels.active !== panel || !states.has(panel)) {
          return false;
        }
        if (
          current.previousRestoreStarted === false &&
          !state.inheritedDeparture
        ) {
          state.history.releaseDeparture();
        }
        state.inheritedDeparture = state.history.hasDeparture;
        const generation = ++state.generation;
        const transition =
          direction === "back"
            ? state.history.prepareBack(entry(panel, current.position))
            : state.history.prepareForward(entry(panel, current.position));
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
          panels.active !== panel
        ) {
          state.history.cancel(transition.token);
          return false;
        }
        return state.history.commit(transition.token, entry(panel, actual));
      } finally {
        state.busy = false;
        publish();
      }
    };
    ctx.own(
      panels.handle("historyJump", (panel, message) => {
        const state = stateFor(panel);
        state.generation++;
        delete state.inheritedDeparture;
        state.history.record(
          entry(panel, message.from),
          entry(panel, message.to),
        );
        publish();
      }),
      "jump handler",
    );
    ctx.own(
      panels.handle("historyTraverse", (panel, message) =>
        traverse(panel, message.direction),
      ),
      "traverse handler",
    );
    ctx.own(
      panels.onDidChange(() => {
        for (const [panel, state] of states) {
          if (state.busy && panels.active !== panel) {
            state.generation++;
            panel.cancelHistoryRestore();
          }
        }
        publish();
      }),
      "listener",
    );
    ctx.own(
      vscode.commands.registerCommand(HISTORY_COMMAND_IDS.historyBack, () =>
        traverse(panels.active, "back"),
      ),
      "command",
    );
    ctx.own(
      vscode.commands.registerCommand(HISTORY_COMMAND_IDS.historyForward, () =>
        traverse(panels.active, "forward"),
      ),
      "command",
    );
    ctx.own(
      {
        dispose: () => {
          for (const [panel, state] of states) {
            state.generation++;
            panel.cancelHistoryRestore();
            panel.setHistoryState(false, false);
          }
          states.clear();
          publish();
        },
      },
      "memory history",
    );
    publish();
  },
};
