export type * from "./types";
export {
  hunkFingerprint,
  sideKey,
  sideToken,
  textFingerprint,
} from "./fingerprint";
export { sha256Hex } from "./sha256";
export {
  resolveExactHunk,
  resolveNearestHunk,
  sourceStateEquals,
} from "./resolve";
export {
  createMutationGate,
  mutationsAllowedForWorktree,
  worktreeBacked,
} from "./mutate";
export type { MutationDeps, MutationGate, MutationResult } from "./mutate";
export {
  buildWorktreeSnapshot,
  nextGenerationId,
  offsetOfLine,
} from "./snapshot";
export type { BuildSnapshotInput, LiveAnchorSpan } from "./snapshot";
export { unifiedRows } from "./unified";
export type { UnifiedRow } from "./unified";
export {
  comparisonTitle,
  gitRefOf,
  snapshotSideFromUri,
  sourceStateForSides,
} from "./sides";
