import { lineHunks, splitLines } from "../diff";
import type { LineHunk } from "../diff";
import { hunkFingerprint, sideKey, sideToken } from "./fingerprint";
import type {
  DiffHunk,
  DiffSide,
  DiffSnapshot,
  HunkCapabilities,
  LineRecord,
  LineRange,
  LiveAnchor,
  WorktreeBytes,
} from "./types";

const CONTEXT = 3;

export interface LiveAnchorSpan {
  readonly modifiedFrom: number;
  readonly modifiedTo: number;
}

export interface BuildSnapshotInput {
  readonly repository: string;
  readonly fileUri: string;
  readonly baseText: string;
  readonly targetText: string;
  readonly base: DiffSide;
  readonly target: DiffSide;
  readonly worktreeBytes?: WorktreeBytes;
  readonly liveDocumentUri?: string;
  readonly mapLiveAnchor?: (span: LiveAnchorSpan) => LiveAnchor;
  readonly capabilitiesFor: (kind: LineHunk["kind"]) => HunkCapabilities;
  readonly generationId?: string;
  readonly computedAt?: number;
}

let generationCounter = 0;

export function nextGenerationId(): string {
  generationCounter += 1;
  return `gen-${generationCounter.toString(36)}`;
}

/** Build a snapshot from baseline and target texts. Live anchors are opt-in. */
export function buildWorktreeSnapshot(input: BuildSnapshotInput): DiffSnapshot {
  const generationId = input.generationId ?? nextGenerationId();
  const baseLines = splitLines(input.baseText);
  const targetLines = splitLines(input.targetText);
  const hunks = lineHunks(input.baseText, input.targetText).map((hunk) =>
    toDiffHunk({ input, hunk, baseLines, targetLines, generationId }),
  );
  return {
    generationId,
    repository: input.repository,
    fileUri: input.fileUri,
    base: input.base,
    target: input.target,
    sourceState: {
      baseOidOrFingerprint: sideToken(input.base),
      targetOidOrFingerprint: sideToken(input.target),
      ...(input.worktreeBytes ? { worktreeBytes: input.worktreeBytes } : {}),
    },
    ...(input.liveDocumentUri
      ? { liveDocumentUri: input.liveDocumentUri }
      : {}),
    hunks,
    computedAt: input.computedAt ?? 0,
  };
}

function toDiffHunk(parts: {
  input: BuildSnapshotInput;
  hunk: LineHunk;
  baseLines: readonly string[];
  targetLines: readonly string[];
  generationId: string;
}): DiffHunk {
  const { input, hunk, baseLines, targetLines, generationId } = parts;
  const originalRange: LineRange = {
    startLine: hunk.oldFrom,
    endLine: hunk.oldTo,
  };
  const modifiedRange: LineRange = {
    startLine: hunk.newFrom,
    endLine: hunk.newTo,
  };
  const lines = hunkLines(hunk, baseLines, targetLines);
  const liveAnchor = input.mapLiveAnchor?.(anchorSpan(input.targetText, hunk));
  return {
    hunkId: hunkFingerprint({
      originalRange,
      modifiedRange,
      lines,
      baseKey: sideKey(input.base),
      targetKey: sideKey(input.target),
    }),
    generationId,
    originalRange,
    modifiedRange,
    ...(liveAnchor ? { liveAnchor } : {}),
    lines,
    capabilities: input.capabilitiesFor(hunk.kind),
  };
}

function anchorSpan(targetText: string, hunk: LineHunk): LiveAnchorSpan {
  return {
    modifiedFrom: offsetOfLine(targetText, hunk.newFrom),
    modifiedTo: offsetOfLine(targetText, hunk.newTo),
  };
}

/** 0-based line index → offset of that line's first character. */
export function offsetOfLine(text: string, line: number): number {
  if (line <= 0) {
    return 0;
  }
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      seen += 1;
      if (seen === line) {
        return i + 1;
      }
    }
  }
  return text.length;
}

function hunkLines(
  hunk: LineHunk,
  baseLines: readonly string[],
  targetLines: readonly string[],
): LineRecord[] {
  const lines: LineRecord[] = [];
  pushContextBefore(lines, { hunk, baseLines, targetLines });
  for (let i = hunk.oldFrom; i < hunk.oldTo; i++) {
    lines.push({
      kind: "delete",
      originalLine: i + 1,
      text: baseLines[i] ?? "",
    });
  }
  for (let i = hunk.newFrom; i < hunk.newTo; i++) {
    lines.push({
      kind: "add",
      modifiedLine: i + 1,
      text: targetLines[i] ?? "",
    });
  }
  pushContextAfter(lines, { hunk, baseLines, targetLines });
  return lines;
}

interface LineEnds {
  readonly hunk: LineHunk;
  readonly baseLines: readonly string[];
  readonly targetLines: readonly string[];
}

function pushContextBefore(lines: LineRecord[], ends: LineEnds): void {
  const { hunk } = ends;
  const start = Math.max(0, hunk.oldFrom - CONTEXT);
  for (let oldIndex = start; oldIndex < hunk.oldFrom; oldIndex++) {
    const newIndex = hunk.newFrom - (hunk.oldFrom - oldIndex);
    pushContext(lines, ends, oldIndex, newIndex);
  }
}

function pushContextAfter(lines: LineRecord[], ends: LineEnds): void {
  for (let step = 0; step < CONTEXT; step++) {
    pushContext(lines, ends, ends.hunk.oldTo + step, ends.hunk.newTo + step);
  }
}

function pushContext(
  lines: LineRecord[],
  ends: LineEnds,
  oldIndex: number,
  newIndex: number,
): void {
  const { baseLines, targetLines } = ends;
  if (oldIndex < 0 || newIndex < 0) {
    return;
  }
  if (oldIndex >= baseLines.length || newIndex >= targetLines.length) {
    return;
  }
  lines.push({
    kind: "context",
    originalLine: oldIndex + 1,
    modifiedLine: newIndex + 1,
    text: targetLines[newIndex] ?? "",
  });
}
