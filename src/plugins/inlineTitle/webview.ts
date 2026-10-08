import { EditorView } from "@codemirror/view";
import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../properties/api";
import { protocol } from "./protocol";
import { titleFromSource } from "./title";
import { setTitle, titleField } from "./widget";
import type { TitleFocus } from "./input";
export const inlineTitleWebview: Plugin = {
  name: "inlineTitle",
  inject: { required: ["editor", "rpc"] },
  apply(ctx) {
    registerTitle(ctx);
    registerFocus(ctx);
  },
};

function registerTitle(ctx: Context): void {
  let isLive = true;
  ctx.effect(() => () => {
    isLive = false;
  });
  const title = titleFromSource(ctx.editor.source);
  const field = titleField(title, {
    focus: (target) => focusAfterTitle(ctx, target),
    rename: (next, focus) => {
      void ctx.rpc
        .call(protocol, "rename", { title: next, focus })
        .then((value) => {
          if (isLive) {
            ctx.editor.view.dispatch({ effects: setTitle.of(value) });
          }
        })
        .catch((error) => {
          if (isLive) {
            ctx.editor.view.dispatch({
              effects: setTitle.of({ title, error: String(error) }),
            });
          }
        });
    },
  });
  ctx.effect(() => ctx.editor.extend([field, titleTheme]));
}

function registerFocus(ctx: Context): void {
  let isLive = true;
  ctx.effect(() => () => {
    isLive = false;
  });
  ctx.on("editor/focusTitle", () => {
    const view = ctx.editor.view;
    const find = () =>
      view.contentDOM.querySelector<HTMLTextAreaElement>(
        ".file-title textarea",
      );
    const focus = (input: HTMLTextAreaElement | null) => {
      if (isLive) {
        input?.focus();
        input?.select();
      }
    };
    const input = find();
    if (input) {
      focus(input);
    } else {
      view.scrollDOM.scrollTop = 0;
      view.requestMeasure({ key: focus, read: find, write: focus });
    }
    return true;
  });
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "focus", ({ target }) => {
      focusAfterTitle(ctx, target);
      return true;
    }),
  );
}
function focusAfterTitle(ctx: Context, target: TitleFocus): void {
  if (target === "properties" && ctx.bail("editor/focusProperties")) {
    return;
  }
  ctx.editor.view.focus();
}
const titleTheme = EditorView.baseTheme({
  ".file-title": {
    display: "grid",
    position: "relative",
    margin: "0 0 16px",
    fontSize: "2em",
    fontWeight: "700",
    lineHeight: "1.3",
  },
  ".file-title textarea, .file-title-measure": {
    gridArea: "1 / 1",
    font: "inherit",
    padding: "0",
    margin: "0",
    border: "0",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    width: "100%",
  },
  ".file-title textarea": {
    background: "transparent",
    color: "inherit",
    resize: "none",
    overflow: "hidden",
    outline: "none",
    height: "100%",
  },
  ".file-title-measure": { visibility: "hidden", pointerEvents: "none" },
  ".file-title textarea[aria-invalid=true]": {
    outline: "1px solid var(--vscode-inputValidation-errorBorder)",
  },
});
