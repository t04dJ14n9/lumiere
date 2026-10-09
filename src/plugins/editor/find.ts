import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { Command, KeyBinding } from "@codemirror/view";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  search,
  searchPanelOpen,
} from "@codemirror/search";
import { FindPanel } from "./find-panel";

function open(replace: boolean): Command {
  return (view) => {
    if (!searchPanelOpen(view.state)) {
      openSearchPanel(view);
    }
    FindPanel.of(view)?.show(replace);
    return true;
  };
}

/** Find and replace bindings; Escape is handled by the bar itself. */
export const findKeymap: readonly KeyBinding[] = [
  { key: "Mod-f", run: open(false), preventDefault: true },
  { key: "Mod-h", run: open(true), preventDefault: true },
  { key: "Mod-g", run: findNext, shift: findPrevious, preventDefault: true },
  { key: "F3", run: findNext, shift: findPrevious, preventDefault: true },
];

export function findExtension(): Extension {
  return [
    search({
      top: true,
      createPanel: (view) => new FindPanel(view),
    }),
    keymap.of(findKeymap),
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (event.key === "Escape" && searchPanelOpen(view.state)) {
          closeSearchPanel(view);
          return true;
        }
        return false;
      },
    }),
  ];
}

export { countLabel, countMatches, countLimit } from "./find-count";
