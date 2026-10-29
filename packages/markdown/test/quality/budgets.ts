/**
 * What every change must keep: scrolling smooth and notes quick to open.
 * Each budget names the regression it guards against. Budgets in ms are for
 * the reference machine and stretch with `speedFactor()` (calibration.ts);
 * counts, bytes and pixels are exact. Results land in
 * test-results/quality.json for comparison between runs.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const budgets = {
  // ── Scrolling ────────────────────────────────────────────────────────
  /** Wheel or touch listeners on the scroll path that are not passive. A
   * single one makes Chromium wait on the page before every gesture. */
  blockingScrollListeners: 0,
  /** px the text under the reader may move while blocks above it render
   * (stepping down, after a far jump, reading upward). */
  textShiftPx: 2,
  /** Worst frame while flicking straight after a note opens (ms); 125 to
   * 151 ms in VS Code and Cursor before the scroll fixes of #410. */
  flickWorstFrameMs: 100,
  /** Frames over 50 ms in that flick. */
  flickFramesOver50: 3,
  /** Longest task while scrolling through a 1 MB note, in calibration
   * parses. Parsing the whole note inside a scroll update (fixed in #410)
   * cost about 25; sticky-scroll pin measure (default on) adds a few more
   * on CI (~20 parses observed); keep headroom under the old 25 regression. */
  largeNoteTaskParses: 22,

  // ── Opening ──────────────────────────────────────────────────────────
  /** From opening a note to its first paint, by note (ms). */
  firstPaintMs: { small: 150, large: 200, diagrams: 150 },
  /** From first paint until every feature has loaded (ms). */
  featuresAfterPaintMs: 300,
  /** The host answering a note's `ready` in a 30,000-file vault (ms). */
  readyInLargeVaultMs: 1000,
  /** Bytes the host sends an open note per vault change, on average over
   * a burst (a whole-vault list per change is megabytes). */
  bytesPerVaultChange: 2048,
  /** Host CPU per vault change in a 30,000-file vault, as a multiple of a
   * 3,000-file one: work per change must not grow with the vault. */
  vaultChangeCostRatio: 3,
  /** Per-change cost below this is noise, whatever the ratio (ms). */
  vaultChangeFloorMs: 2,
} as const;

/** Keep one measurement in test-results/quality.json (one JSON per line). */
export function record(check: string, values: Record<string, unknown>): void {
  const folder = path.resolve("test-results");
  mkdirSync(folder, { recursive: true });
  appendFileSync(
    path.join(folder, "quality.json"),
    `${JSON.stringify({ check, at: new Date().toISOString(), ...values })}\n`,
  );
}
