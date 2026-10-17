import type { CodeMirror } from "@replit/codemirror-vim";

/** Observe resolved commands without changing Vim's motion functions or keymaps. */
export function observeMotionContext(cm: CodeMirror) {
  const mode = cm.state.vim;
  let policy: "source" | "display-entry" | undefined;
  if (!mode) {
    return { consume: () => undefined, destroy() {} };
  }
  const descriptor = Object.getOwnPropertyDescriptor(mode, "inputState");
  let input = mode.inputState;
  // In pinned codemirror-vim 6.3, evalInput replaces inputState immediately
  // before executing its resolved motion. This also covers mappings, macros,
  // operators and visual mode, and keeps upstream lastMotion identities intact.
  Object.defineProperty(mode, "inputState", {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get: () => input,
    set(next: typeof input) {
      policy = motionPolicy(input.motion);
      input = next;
    },
  });
  return {
    consume() {
      const result = policy;
      policy = undefined;
      return result;
    },
    destroy() {
      Object.defineProperty(mode, "inputState", {
        ...descriptor,
        value: input,
      });
    },
  };
}

function motionPolicy(motion: string | null | undefined) {
  if (motion === "moveByLines") {
    return "source";
  }
  return motion === "moveByDisplayLines" ? "display-entry" : undefined;
}
