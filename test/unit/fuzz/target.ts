/** A text function under fuzz: one text, or a before/after pair. */
export interface Target {
  readonly arity: 1 | 2;
  /**
   * Optional child-process deadline for this target (ms). Use when a target
   * does real work per case (e.g. full markdown-it render) so the whole
   * adversarial suite needs more than the default under CI load — without
   * relaxing the per-case CASE_MS linearity check.
   */
  readonly deadlineMs?: number;
  run(a: string, b: string): unknown;
}
