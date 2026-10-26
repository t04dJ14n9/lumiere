/**
 * What the service worker asks the app's window, and what the window answers.
 * The worker posts a question with a `MessagePort`, and the window answers on
 * that port. Each side parses what it receives: a window can be any page
 * of this origin, and a message can come from any of its workers.
 */

export type Question = { readonly lumiere: "page"; readonly id: string };

export type Answer =
  /** A note's page, as HTML. */
  | { readonly kind: "page"; readonly html: string }
  /** Not this window's: another window may have it. */
  | { readonly kind: "unknown" };

export function parseQuestion(value: unknown): Question | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.lumiere === "page" && isText(value.id)) {
    return { lumiere: "page", id: value.id };
  }
  return undefined;
}

export function parseAnswer(value: unknown): Answer | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.kind === "page" && typeof value.html === "string") {
    return { kind: "page", html: value.html };
  }
  if (value.kind === "unknown") {
    return { kind: "unknown" };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
