import type { Extension, Text } from "@codemirror/state";
import { StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Context } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../render/api";
import { noteCssClasses } from "../../markdown/properties";
import { frontmatterBodyStart } from "./caret-guard";
import { protocol } from "./protocol";

function computeClasses(doc: Text): readonly string[] {
  const end = frontmatterBodyStart(doc);
  if (!end || end <= 0) {
    return [];
  }
  return noteCssClasses(doc.sliceString(0, end));
}

function sameClasses(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

const cssClassesField = StateField.define<readonly string[]>({
  create(state) {
    return computeClasses(state.doc);
  },
  update(value, transaction) {
    if (!transaction.docChanged) {
      return value;
    }
    const next = computeClasses(transaction.newDoc);
    return sameClasses(value, next) ? value : next;
  },
});

export function noteCssClassesExtension(): Extension {
  return [
    cssClassesField,
    EditorView.editorAttributes.compute([cssClassesField], (state) => {
      const classes = state.field(cssClassesField);
      if (classes.length === 0) {
        return {};
      }
      const joined = classes.join(" ");
      return {
        class: joined,
        "data-cssclasses": joined,
      };
    }),
    EditorView.contentAttributes.compute([cssClassesField], (state) => {
      const classes = state.field(cssClassesField);
      if (classes.length === 0) {
        return {};
      }
      return {
        class: classes.join(" "),
      };
    }),
  ];
}

export function registerVaultSnippets(ctx: Context, signal: AbortSignal): void {
  const applySnippets = (snippets: readonly string[]) => {
    if (signal.aborted || typeof document === "undefined") {
      return;
    }
    const combined = snippets.join("\n\n").trim();
    const existing = document.head.querySelector<HTMLStyleElement>(
      "style[data-vault-snippets]",
    );
    if (!combined) {
      if (existing) {
        existing.remove();
        ctx.emit("render/changed");
      }
      return;
    }
    const style = existing ?? document.createElement("style");
    style.dataset["vaultSnippets"] = "true";
    if (style.textContent !== combined) {
      style.textContent = combined;
      if (!existing) {
        document.head.appendChild(style);
      }
      ctx.emit("render/changed");
    }
  };
  ctx.effect(() => () => {
    if (typeof document !== "undefined") {
      document.head
        ?.querySelector<HTMLStyleElement>("style[data-vault-snippets]")
        ?.remove();
    }
  });
  ctx.effect(() => ctx.rpc.on(protocol, "snippets", applySnippets));
  void ctx.rpc
    .call(protocol, "snippets", {})
    .then(applySnippets)
    .catch(() => {
      // Optional on hosts that do not provide vault snippets.
    });
}
