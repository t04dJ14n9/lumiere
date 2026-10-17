import type { Context } from "@workshop/core";
import type { FullDiffRequest } from "../gitGutter/api";
import { titledComparison, urisForSides } from "./comparison";
import { fileName } from "./host";

interface ComparisonShape {
  readonly original: string;
  readonly modified: string;
  readonly column: number | undefined;
  readonly preview: boolean;
}

/** Open the peek snapshot's base → target, honoring diffEditor native | rendered. */
export async function openFullDiff<Prepared extends { stop(): void }>(input: {
  ctx: Context;
  life: { live: boolean };
  request: FullDiffRequest;
  prepare(comparison: ComparisonShape): Promise<Prepared | undefined>;
  present(comparison: ComparisonShape, prepared: Prepared): void;
}): Promise<void> {
  const { git, diffViews: views } = input.ctx;
  const uris = urisForSides(
    input.request.fileUri,
    input.request.base,
    input.request.target,
    (uri, ref) => git.toGitUri(uri, ref),
  );
  if (!uris) {
    return;
  }
  const mode = input.ctx.settings.get<string>(
    "gitDiffEditor.diffEditor",
    "native",
  );
  const name = titledComparison(
    fileName(input.request.fileUri),
    input.request.base.kind,
    input.request.target.kind,
  );
  if (mode !== "rendered") {
    await views.openNative(uris.original, uris.modified, name, undefined);
    return;
  }
  const comparison = {
    original: uris.original,
    modified: uris.modified,
    column: undefined,
    preview: false,
  };
  const prepared = await input.prepare(comparison);
  if (!prepared || !input.life.live) {
    prepared?.stop();
    return;
  }
  input.present(comparison, prepared);
}
