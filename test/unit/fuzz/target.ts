/** A text function under fuzz: one text, or a before/after pair. */
export interface Target {
  readonly arity: 1 | 2;
  run(a: string, b: string): unknown;
}
