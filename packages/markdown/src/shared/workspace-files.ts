/** Host file and problem adapters. Implementations live in `src/host`. */

export interface DiagnosticPoint {
  readonly line: number;
  readonly col: number;
}

export interface DiagnosticItem {
  readonly message: string;
  readonly severity: "error" | "warning" | "information";
  readonly start: DiagnosticPoint;
  readonly end: DiagnosticPoint;
}

export interface DiagnosticEntry {
  readonly uri: string;
  readonly items: readonly DiagnosticItem[];
}

/** Replaces one owner's problems. `clear` runs when that owner stops. */
export interface DiagnosticSink {
  replaceAll(owner: string, entries: readonly DiagnosticEntry[]): void;
  clear(owner: string): void;
}

/**
 * Workspace file access plugins need beyond reading bytes. Every path is a
 * URI the host re-checks; plugins do not touch the filesystem themselves.
 */
export interface WorkspaceFiles {
  /** Checks lexical containment and existing symlinks, including missing targets. */
  authorize?(root: string, target: string): Promise<void>;
  readText(uri: string): Promise<string | undefined>;
  writeText(uri: string, text: string): Promise<void>;
  /** Replace or create a file with raw bytes (images, etc.). */
  writeBytes(uri: string, data: Uint8Array): Promise<void>;
  list(uri: string): Promise<readonly string[] | undefined>;
  mkdir(uri: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(uri: string): Promise<void>;
  /** True when the URI exists and is a symbolic link. Missing is false. */
  isSymbolicLink(uri: string): Promise<boolean>;
  pickFile(title: string): Promise<string | undefined>;
}

/** 0-based line and column of a UTF-16 offset, counting `\n` as the break. */
export function pointAt(text: string, offset: number): DiagnosticPoint {
  const bounded = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let col = 0;
  for (let index = 0; index < bounded; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      col = 0;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

export function span(
  text: string,
  from: number,
  to: number,
): {
  start: DiagnosticPoint;
  end: DiagnosticPoint;
} {
  return { start: pointAt(text, from), end: pointAt(text, to) };
}
