import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../render/api";
import type {} from "../gitGutter/api";
import { PassOwner } from "../../shared/render-lifetime";
import { inlineChanges } from "./decorations";

/** Inline track changes over the Git change bars' hunks. */
export const gitInlineWebview: Plugin = {
  name: "gitInline",
  inject: { required: ["editor", "gitDiff", "render"] },
  apply(ctx) {
    const owner = new PassOwner();
    // Registered first, so it runs after the extension is removed: every ghost
    // is gone, late passes are disposed, and teardown waits for them.
    ctx.effect(() => () => owner.drain());
    ctx.effect(() =>
      ctx.editor.extend(
        inlineChanges({ diff: ctx.gitDiff, render: ctx.render, owner }),
      ),
    );
  },
};
