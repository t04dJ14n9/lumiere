import {
  autocompletion,
  closeCompletion,
  completionKeymap,
  completionStatus,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import {
  bindCaller,
  type CallerBound,
  type Context,
  type Plugin,
} from "../../kernel";
import type {} from "../editor/api";
import type { Suggest, SuggestionTrigger } from "./api";
import { CancelToken } from "../../shared/rpc/lifecycle";
import { protocol } from "./protocol";
import { allowsSuggestions, completionEdit } from "./completion";
export const suggestWebview: Plugin = {
  name: "suggest",
  inject: { required: ["editor", "rpc"] },
  apply(ctx) {
    registerSources(ctx);
    registerCompletions(ctx);
  },
};
function registerSources(ctx: Context): void {
  const service: Suggest & CallerBound<Suggest> = {
    register: (source) => ctx.on("suggest/trigger", source),
    [bindCaller]: (caller) => ({
      register: (source) => caller.on("suggest/trigger", source),
    }),
  };
  ctx.provide("suggest", service);
}
function registerCompletions(ctx: Context): void {
  const pending = new Set<CancelToken>();
  ctx.effect(() => () => {
    for (const token of pending) {
      token.cancel();
    }
    pending.clear();
  });
  const source = (context: CompletionContext) => {
    if (!allowsSuggestions(context.state, context.pos)) {
      return null;
    }
    const trigger = ctx.bail("suggest/trigger", context);
    return trigger
      ? requestCompletions(ctx, { context, trigger, pending })
      : null;
  };
  ctx.effect(() =>
    ctx.editor.extend(
      [
        autocompletion({
          override: [source],
          icons: false,
          maxRenderedOptions: 50,
          defaultKeymap: false,
        }),
        keymap.of([
          {
            key: "Escape",
            run: (view) =>
              completionStatus(view.state) === "active" &&
              closeCompletion(view),
          },
          ...completionKeymap.filter((binding) => binding.key !== "Escape"),
        ]),
      ],
      { slot: "suggest" },
    ),
  );
}
async function requestCompletions(
  ctx: Context,
  options: {
    context: CompletionContext;
    trigger: SuggestionTrigger;
    pending: Set<CancelToken>;
  },
): Promise<CompletionResult | null> {
  const { context, trigger, pending } = options;
  const token = new CancelToken();
  pending.add(token);
  context.addEventListener("abort", () => token.cancel(), {
    onDocChange: true,
  });
  try {
    const items = await ctx.rpc.call(
      protocol,
      "query",
      {
        kind: trigger.kind,
        query: trigger.query,
        ...(trigger.note === undefined ? {} : { note: trigger.note }),
      },
      { token },
    );
    if (context.aborted || token.cancelled) {
      return null;
    }
    return {
      from: trigger.from,
      filter: false,
      options: items.map((item) => ({
        label: item.label,
        detail: item.detail,
        apply: (view, _completion, from, to) =>
          view.dispatch(
            completionEdit(
              view.state,
              { from, to },
              item.insert,
              item.replaceLink ? "replace" : trigger.closeLink,
            ),
          ),
      })),
    };
  } catch (error) {
    if (!token.cancelled) {
      ctx.logger.warn("Suggestions unavailable", error);
    }
    return null;
  } finally {
    pending.delete(token);
  }
}
