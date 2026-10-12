import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../render/api";
import type {} from "../gitGutter/api";
import { inlineChanges } from "./decorations";

/** Inline track changes over the Git change bars' hunks. */
export const gitInlineWebview: Plugin = {
  name: "gitInline",
  inject: { required: ["editor", "gitDiff", "render"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.editor.extend(
        inlineChanges({ diff: ctx.gitDiff, render: ctx.render }),
      ),
    );
  },
};
