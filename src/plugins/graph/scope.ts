import type { OkfBundle } from "../okfCore/api";

export type ScopeDecision =
  | { kind: "keep" }
  | { kind: "empty" }
  | { kind: "use"; bundle: OkfBundle }
  | { kind: "ask"; choices: readonly OkfBundle[] };

/**
 * Pick a bundle without guessing a workspace folder.
 * An existing scope stays put until the user asks to change it.
 */
export function selectScope(input: {
  explicit: boolean;
  hasCurrent: boolean;
  ambiguous: boolean;
  owner?: OkfBundle;
  choices: readonly OkfBundle[];
}): ScopeDecision {
  if (!input.explicit && input.hasCurrent) {
    return { kind: "keep" };
  }
  if (!input.explicit && !input.ambiguous && input.owner) {
    return { kind: "use", bundle: input.owner };
  }
  if (input.choices.length === 0) {
    return { kind: "empty" };
  }
  if (!input.explicit && input.choices.length === 1) {
    const bundle = input.choices[0];
    if (bundle) {
      return { kind: "use", bundle };
    }
  }
  return { kind: "ask", choices: input.choices };
}
