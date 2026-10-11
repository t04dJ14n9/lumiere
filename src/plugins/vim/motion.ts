import { ViewPlugin } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import type { LivePreview } from "../livePreview/api";

/** Keep Vim's command bookkeeping; only correct its single-step widget target. */
export function revealBlockMotion(service: () => LivePreview | undefined) {
  return ViewPlugin.define((view) => {
    const cm = getCM(view);
    if (!cm) {
      return {};
    }
    const original = cm.findPosV;
    let entering = false;
    const keydown = (event: KeyboardEvent) => {
      const mode = cm.state.vim;
      // Vim clears inputState before calling findPosV. Capture operator state
      // before its handler runs, without consuming or remapping any keys.
      entering = Boolean(
        event.type === "keydown" &&
          ["j", "k"].includes(event.key) &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          mode &&
          !mode.insertMode &&
          !mode.visualMode &&
          !mode.inputState.operator,
      );
    };
    cm.findPosV = (start, amount, unit, goalColumn) => {
      const eligible = entering;
      entering = false;
      const preview = service();
      if (
        eligible &&
        unit === "line" &&
        Math.abs(amount) === 1 &&
        preview?.mode === "livePreview"
      ) {
        const target = preview.verticalPosition?.(
          view.state,
          amount > 0 ? 1 : -1,
        );
        if (target !== undefined) {
          const line = view.state.doc.lineAt(target);
          return { line: line.number - 1, ch: target - line.from };
        }
      }
      return original.call(cm, start, amount, unit, goalColumn);
    };
    view.contentDOM.addEventListener("keydown", keydown, true);
    view.contentDOM.addEventListener("keyup", keydown, true);
    return {
      destroy() {
        view.contentDOM.removeEventListener("keydown", keydown, true);
        view.contentDOM.removeEventListener("keyup", keydown, true);
        cm.findPosV = original;
      },
    };
  });
}
