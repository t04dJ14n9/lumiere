import type { Context } from "@workshop/core";
import { contributionId } from "../../shared/setting-schema";
import type { EditPromptVisibility } from "./handoff";

export const EDIT_PROMPT_VIEW = contributionId("cursorBridge.editPromptProbe");
export const EDIT_PROMPT_ARMED = contributionId("editPromptArmed");

export interface EditPromptProbe {
  readonly visibility: EditPromptVisibility;
  arm(): () => void;
}

/** The workbench evaluates Cursor's private keys; extensions only see the view. */
export function registerEditPromptProbe(ctx: Context): EditPromptProbe {
  const commands = ctx.hostCommands;
  const tree = ctx.views.tree(EDIT_PROMPT_VIEW, {
    roots: () => [],
    children: () => [],
  });
  const owners = new Set<symbol>();
  let isDisposed = false;
  void commands.execute("setContext", EDIT_PROMPT_ARMED, false);
  ctx.effect(() => async () => {
    isDisposed = true;
    owners.clear();
    tree.dispose();
    await commands.execute("setContext", EDIT_PROMPT_ARMED, false);
  });
  return {
    visibility: tree,
    arm() {
      if (isDisposed) {
        return () => {};
      }
      const owner = Symbol();
      owners.add(owner);
      if (owners.size === 1) {
        void commands.execute("setContext", EDIT_PROMPT_ARMED, true);
      }
      return () => {
        if (owners.delete(owner) && owners.size === 0) {
          void commands.execute("setContext", EDIT_PROMPT_ARMED, false);
        }
      };
    },
  };
}
