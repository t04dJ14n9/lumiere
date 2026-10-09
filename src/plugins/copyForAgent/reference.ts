import {
  formatMarkdownAgentReference,
  formatUriAgentReference,
} from "../../shared/agent-reference";

/**
 * The LLM Wiki reference for lines of a note: `@notes/a.md#12-18`. The path
 * is relative to the one local workspace folder; in multi-root and remote
 * workspaces it is the note's full URI (DESIGN §17).
 */
export function agentReferenceText(
  uri: string,
  roots: readonly string[],
  startLine: number,
  endLine: number,
): string {
  const relative = workspaceRelativePath(uri, roots);
  return relative === undefined
    ? formatUriAgentReference(uri, startLine, endLine)
    : formatMarkdownAgentReference(relative, startLine, endLine);
}

/** The note's path inside the only workspace folder, if it has one there. */
export function workspaceRelativePath(
  uri: string,
  roots: readonly string[],
): string | undefined {
  const source = new URL(uri);
  if (roots.length !== 1 || source.protocol !== "file:") {
    return undefined;
  }
  const root = new URL(roots[0]!);
  const prefix = root.pathname.replace(/\/$/, "") + "/";
  if (
    root.protocol !== "file:" ||
    root.host !== source.host ||
    !source.pathname.startsWith(prefix)
  ) {
    return undefined;
  }
  return decodeURIComponent(source.pathname.slice(prefix.length));
}

/**
 * What Copy for Agent puts on the clipboard: the line reference, so the agent
 * can open the note at that range, then the selected passage quoted, so it
 * reads the exact words without opening anything.
 */
export function agentPayload(reference: string, text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const quoted = lines.map((line) => (line ? `> ${line}` : ">")).join("\n");
  return `${reference}\n\n${quoted}`;
}
