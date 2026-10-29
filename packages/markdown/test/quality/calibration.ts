/**
 * How fast this machine is, from a fixed piece of work: parsing a note of
 * known size. Timing budgets are written for the reference machine (an
 * Apple M-series Mac) and stretch by `speedFactor()` on slower ones, such
 * as CI runners; never below 1, so a fast machine is held to the same
 * budget.
 */
import { markdownParser } from "../../src/markdown/dialect";
import { calibrationNote, REFERENCE_PARSE_MS } from "./calibration-note";

export { calibrationNote, REFERENCE_PARSE_MS };

/**
 * Fastest parse of the calibration note once the JIT is warm, in ms: the
 * fastest run is the machine's speed; slower ones measure what else it is
 * doing at the time.
 */
export function parseMs(runs = 9): number {
  const text = calibrationNote();
  for (let warm = 0; warm < 5; warm++) {
    markdownParser.parse(text);
  }
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    markdownParser.parse(text);
    times.push(performance.now() - started);
  }
  return Math.min(...times);
}

/** How much slower than the reference machine this one is, at least 1. */
export function speedFactor(measured = parseMs()): number {
  return Math.max(1, measured / REFERENCE_PARSE_MS);
}
