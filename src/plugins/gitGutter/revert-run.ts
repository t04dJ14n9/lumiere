import type { Text } from "@codemirror/state";
import { resolveExactHunk, sourceStateEquals } from "../../shared/git-diff";
import type {
  DiffHunk,
  DiffSnapshot,
  SourceState,
} from "../../shared/git-diff";
import type { DocHunk } from "./api";
import { computeHunks } from "./hunks";
import { sameBaseline } from "./identity";
import { revertControlEnabled, runGutterRevert } from "./mutations";
import type { DiffSession } from "./session";

/** The document hunk the validated snapshot hunk still is. Never a neighbor. */
export function docHunkForDiffHunk(
  baseline: string,
  doc: Text,
  hunk: DiffHunk,
): DocHunk | undefined {
  const matches = computeHunks(baseline, doc).filter((item) =>
    sameBaseline(hunk, item),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Gate readers. Both ends are the session's live identity, not the click closure. */
export function liveRevertReaders(session: DiffSession): {
  readSnapshot: () => Promise<DiffSnapshot>;
  readAuthoritativeSourceState: () => Promise<SourceState>;
} {
  return {
    readSnapshot: async () => {
      const snap = session.snapshot;
      if (!snap) {
        throw new Error("git snapshot missing");
      }
      return snap;
    },
    readAuthoritativeSourceState: async () => {
      const auth = session.authoritativeSourceState();
      if (!auth) {
        throw new Error("git source state missing");
      }
      return auth;
    },
  };
}

interface RevertRun {
  readonly session: DiffSession;
  readonly hunk: DocHunk;
  readonly fileUri: string;
  readonly baseline: string | undefined;
  docText(): string;
  hold(locking: boolean): Promise<boolean>;
  apply(hunk: DiffHunk, snapshot: DiffSnapshot): Promise<boolean> | boolean;
}

/**
 * Revert one displayed hunk. The click publishes the buffer it sees, then the
 * gate reads the session again. An edit that lands after that click and before
 * execute changes the document version and aborts with no edit.
 */
export async function revertDisplayedHunk(input: RevertRun): Promise<void> {
  const baseline = input.baseline;
  if (baseline === undefined) {
    return;
  }
  const docText = input.docText();
  input.session.noteDocument(docText);
  publishIfDrifted(input, baseline, docText);
  const snap = input.session.snapshot;
  const ref = input.session.refFor(input.hunk);
  if (!snap || !ref || !resolveExactHunk(snap, ref)) {
    return;
  }
  if (!revertControlEnabled(snap)) {
    return;
  }
  if (!(await input.hold(true))) {
    return;
  }
  try {
    await runGutterRevert(
      input.session.gate,
      snap.fileUri,
      {
        generationId: ref.generationId,
        hunkId: ref.hunkId,
        sourceState: snap.sourceState,
        action: "revert",
      },
      {
        ...liveRevertReaders(input.session),
        applyRevert: async (validated, validatedSnap) =>
          Boolean(await input.apply(validated, validatedSnap)),
      },
    );
  } finally {
    await input.hold(false);
  }
}

function publishIfDrifted(
  input: RevertRun,
  baseline: string,
  docText: string,
): void {
  const auth = input.session.authoritativeSourceState();
  const snap = input.session.snapshot;
  if (snap && auth && sourceStateEquals(snap.sourceState, auth)) {
    return;
  }
  input.session.publish(input.fileUri, baseline, docText);
}
