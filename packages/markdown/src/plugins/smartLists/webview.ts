import { keymap } from "@codemirror/view";
import type { Plugin } from "@workshop/core";
import type {} from "../editor/api";
import { continueLine, continueList } from "./commands";
import { renumberOnEdit } from "./renumber";
import { pasteIntoListItem } from "./paste";
export const smartListsWebview: Plugin = {
  name: "smartLists",
  inject: { required: ["editor"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.editor.extend([
        keymap.of([{ key: "Enter", run: continueList, shift: continueLine }]),
        renumberOnEdit,
        // Filters run last first: the paste is merged before numbering.
        pasteIntoListItem,
      ]),
    );
  },
};
