import { keymap } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import { continueList, removeMarker } from "./commands";
export const smartListsWebview: Plugin = {
  name: "smartLists",
  inject: { required: ["editor"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.editor.extend(
        keymap.of([
          { key: "Enter", run: continueList },
          { key: "Backspace", run: removeMarker },
        ]),
      ),
    );
  },
};
