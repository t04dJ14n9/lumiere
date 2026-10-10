/** Set while a pinch commits its zoom, so the step animation does not replay the gesture. */
let committing = false;

export function isCommittingPinch(): boolean {
  return committing;
}

export function setCommittingPinch(value: boolean): void {
  committing = value;
}
