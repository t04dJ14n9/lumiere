import { ViewPlugin } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { getCM } from "@replit/codemirror-vim";
import {
  setVisualRevealFreeze,
  visualRevealFreeze,
} from "../../webview/ui/pointer-selection";

/**
 * While Vim is in visual mode, freeze Live Preview reveal at the selection
 * from when visual started. Extending the selection with motions must not
 * reflow blocks under the growing range (height changes jump the viewport).
 * Thaw when visual ends so the final caret (or a new selection) reveals again.
 */
export function freezeRevealDuringVisual(): Extension {
  return ViewPlugin.define((view) => {
    const cm = getCM(view);
    if (!cm) {
      return {};
    }
    let frozenByUs = false;
    const sync = () => {
      const visual = Boolean(cm.state.vim?.visualMode);
      if (visual && !frozenByUs) {
        frozenByUs = true;
        view.dispatch({
          effects: setVisualRevealFreeze.of(view.state.selection),
        });
        return;
      }
      if (!visual && frozenByUs) {
        frozenByUs = false;
        if (view.state.field(visualRevealFreeze, false)) {
          view.dispatch({ effects: setVisualRevealFreeze.of(null) });
        }
      }
    };
    cm.on("vim-mode-change", sync);
    return {
      destroy() {
        cm.off("vim-mode-change", sync);
        if (frozenByUs && view.state.field(visualRevealFreeze, false)) {
          view.dispatch({ effects: setVisualRevealFreeze.of(null) });
        }
      },
    };
  });
}
