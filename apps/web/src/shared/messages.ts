/**
 * What the service worker asks the app's window, and what the window answers.
 * The worker posts a question with a `MessagePort`, and the window answers on
 * that port. Each side parses what it receives: a window can be any page
 * of this origin, and a message can come from any of its workers.
 */

export type Question =
  /** A note's page, by the id in its address. */
  | { readonly lumiere: "page"; readonly id: string }
  /** A file the page of panel `panel` shows, by its `file:` URI. */
  | { readonly lumiere: "file"; readonly panel: string; readonly uri: string };

export type Answer =
  /** A note's page, as HTML. */
  | { readonly kind: "page"; readonly html: string }
  /** The file asked for, read as it is used where its folder can. */
  | { readonly kind: "file"; readonly file: Blob }
  /** The page may not read it: it is outside the note's vault. */
  | { readonly kind: "refused" }
  /** Nothing is there in the note's vault: no file, or a folder. */
  | { readonly kind: "missing" }
  /** Not this window's: another window may have it. */
  | { readonly kind: "unknown" };

export function parseQuestion(value: unknown): Question | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.lumiere === "page" && isText(value.id)) {
    return { lumiere: "page", id: value.id };
  }
  if (value.lumiere === "file" && isText(value.panel) && isText(value.uri)) {
    return { lumiere: "file", panel: value.panel, uri: value.uri };
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
  if (value.kind === "file" && value.file instanceof Blob) {
    return { kind: "file", file: value.file };
  }
  if (
    value.kind === "refused" ||
    value.kind === "missing" ||
    value.kind === "unknown"
  ) {
    return { kind: value.kind };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
