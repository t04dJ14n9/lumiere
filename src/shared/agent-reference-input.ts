import {
  formatMarkdownAgentReference,
  formatUriAgentReference,
} from "./agent-reference";

export interface AgentReferenceInput {
  readonly location: string;
  readonly isUri: boolean;
  readonly startLine: number;
  readonly endLine: number;
}

/** Parse the emitted reference, never the quoted passage or a chat command. */
export function parseAgentReference(input: string): AgentReferenceInput {
  const value = unquote(input.trim()).replace(/^@/, "");
  const match = /^(.*)#([1-9]\d*)(?:-([1-9]\d*))?$/.exec(value);
  if (!match) {
    throw new TypeError(
      "Use @path/to/note.md#12-18 or a full note URI with #12-18.",
    );
  }
  const location = match[1]!;
  const startLine = Number(match[2]);
  const endLine = Number(match[3] ?? match[2]);
  const isUri = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(location);
  if (/^[A-Za-z]:[\\/]/.test(location)) {
    throw new TypeError(
      "Use a file:/// URI for an absolute drive-letter path.",
    );
  }
  if (isUri) {
    if (location.includes("#")) {
      throw new TypeError(
        "Encode a literal URI filename # as %23; only the final line reference may be a fragment.",
      );
    }
    formatUriAgentReference(location, startLine, endLine);
  } else {
    formatMarkdownAgentReference(location, startLine, endLine);
  }
  return {
    location: isUri ? location : location.replaceAll("\\", "/"),
    isUri,
    startLine,
    endLine,
  };
}

function unquote(value: string): string {
  const quotes: Readonly<Record<string, string>> = {
    '"': '"',
    "'": "'",
    "`": "`",
    "“": "”",
    "‘": "’",
  };
  const closing = quotes[value[0] ?? ""];
  if (!closing) {
    return value;
  }
  if (!value.endsWith(closing) || value.length < 2) {
    throw new TypeError("The reference's surrounding quotes must match.");
  }
  return value.slice(1, -1).trim();
}
