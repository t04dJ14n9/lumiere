import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Infer } from "@workshop/core";
import type { request as requestSchema } from "./protocol";
import { unresolvedKey } from "./target";

export interface LinksService {
  /** Follow the link at the focused editor's caret, including a projected cell. */
  follow(view: EditorView): boolean;
}
export type LinkRequest = Infer<typeof requestSchema> & {
  source: string;
  editorId?: string;
};
declare module "@workshop/core" {
  interface Services {
    links: LinksService;
  }
  interface Events {
    /** @mode bail */ "links/open": (
      request: LinkRequest,
    ) => Promise<true> | undefined;
    /** @mode bail */ "link/click": (
      request: Infer<typeof requestSchema>,
    ) => true | undefined;
  }
}

export const setUnresolved = StateEffect.define<ReadonlySet<string>>();

/** The host's unresolved link paths for this note, as `unresolvedKey`s. */
export const unresolvedLinks = StateField.define<ReadonlySet<string>>({
  create: () => new Set(),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setUnresolved)) {
        value = effect.value;
      }
    }
    return value;
  },
});

export function isUnresolved(state: EditorState, href: string): boolean {
  const key = unresolvedKey(href);
  return key !== "" && !!state.field(unresolvedLinks, false)?.has(key);
}
