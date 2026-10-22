/**
 * What an editor page and the app that embeds it (DSH's preview plugin, the
 * desktop app's shell) say to each other with `postMessage`. The page runs
 * in an iframe the embedder made; nothing here crosses to the host.
 *
 * Every message carries a `lumiere` key, so none can be taken for one of the
 * editor's RPC envelopes, which arrive as `message` events on the same window.
 */

/** The embedder's theme, as the `--vscode-*` variables the editor's styles read. */
export interface ThemeMessage {
  readonly lumiere: "theme";
  readonly dark: boolean;
  readonly variables: Readonly<Record<string, string>>;
}

/** The page asks the embedder to show another file (a link to a note not open). */
export interface OpenMessage {
  readonly lumiere: "open";
  /** Absolute path on the host. */
  readonly path: string;
  /** A heading or block (`#Heading`, `#^block`), or "". */
  readonly fragment: string;
}

export type EmbedderMessage = ThemeMessage;
export type PageMessage = OpenMessage;

const VARIABLE = /^--vscode-[A-Za-z0-9-]+$/;
const MAX_VALUE = 512;

/** A theme message from the embedder, or undefined when `data` is not one. */
export function parseThemeMessage(data: unknown): ThemeMessage | undefined {
  if (
    !isRecord(data) ||
    data.lumiere !== "theme" ||
    typeof data.dark !== "boolean"
  ) {
    return undefined;
  }
  if (!isRecord(data.variables)) {
    return undefined;
  }
  const variables: Record<string, string> = {};
  for (const [name, value] of Object.entries(data.variables)) {
    // Only theme variables, and no value that could close the declaration.
    if (
      VARIABLE.test(name) &&
      typeof value === "string" &&
      value.length <= MAX_VALUE &&
      !/[;{}]/.test(value)
    ) {
      variables[name] = value;
    }
  }
  return { lumiere: "theme", dark: data.dark, variables };
}

/** An open request from a page, or undefined when `data` is not one. */
export function parseOpenMessage(data: unknown): OpenMessage | undefined {
  if (
    !isRecord(data) ||
    data.lumiere !== "open" ||
    typeof data.path !== "string" ||
    typeof data.fragment !== "string"
  ) {
    return undefined;
  }
  return { lumiere: "open", path: data.path, fragment: data.fragment };
}

/** Whether `data` is any embedding message, which the editor must not see. */
export function isEmbeddingMessage(data: unknown): boolean {
  return isRecord(data) && typeof data.lumiere === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
