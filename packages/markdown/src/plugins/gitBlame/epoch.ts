export interface BlameEpoch {
  readonly docVersion: number;
  readonly caretLine: number;
  readonly repoGeneration: number;
}

export function shouldApplyBlame(
  response: BlameEpoch,
  current: BlameEpoch,
): boolean {
  return (
    response.docVersion === current.docVersion &&
    response.caretLine === current.caretLine &&
    response.repoGeneration === current.repoGeneration
  );
}

export function shouldInvalidateCaret(previous: number, next: number): boolean {
  return previous !== next;
}
