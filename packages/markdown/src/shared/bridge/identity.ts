import {
  formatMarkdownAgentReference,
  formatUriAgentReference,
} from "../agent-reference";
import { relativeFilePath } from "../workspace-path";

export interface NoteIdentity {
  readonly kind: "file" | "untitled" | "remote";
  readonly identity: string;
  /** Set only for the single local workspace folder, matching Copy Link for Agent. */
  readonly relative?: string;
}

/**
 * Durable source identity. A relative path is used only when there is one
 * local workspace folder; otherwise the full URI, so the `@path` wording
 * stays unambiguous.
 */
export function noteIdentity(
  uri: string,
  roots: readonly string[],
): NoteIdentity {
  if (uri.startsWith("untitled:")) {
    return { kind: "untitled", identity: uri };
  }
  const protocol = uriProtocol(uri);
  if (protocol !== "file:") {
    return { kind: "remote", identity: uri };
  }
  if (roots.length === 1) {
    const relative = relativeFilePath(uri, roots[0]!);
    if (relative) {
      return { kind: "file", identity: relative, relative };
    }
  }
  return { kind: "file", identity: uri };
}

export function durableMarkdownLocator(
  identity: NoteIdentity,
  uri: string,
  startLine: number,
  endLine: number,
): string | undefined {
  if (identity.kind === "untitled") {
    return undefined;
  }
  if (identity.relative) {
    return formatMarkdownAgentReference(identity.relative, startLine, endLine);
  }
  return formatUriAgentReference(uri, startLine, endLine);
}

function uriProtocol(uri: string): string {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*:)/.exec(uri);
  return match?.[1]?.toLowerCase() ?? "";
}
