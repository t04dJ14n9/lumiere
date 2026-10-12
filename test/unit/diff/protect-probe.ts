/**
 * Run by protect-perf.test.ts in a child process with a hard timeout, so a
 * superlinear stall fails the test instead of hanging the suite.
 * argv: <case>. Prints the elapsed milliseconds and the marked tail.
 */
import { markSide, wordDiff } from "../../../src/shared/diff";

const N = 80_000;
const cases: Record<string, string> = {
  word: "prose " + "x".repeat(N) + " ",
  lt: "prose " + "<".repeat(N) + " ",
  brackets: "prose " + "[".repeat(N) + " ",
  link: "prose " + "](".repeat(N / 2) + " ",
  math: "prose " + "$ a".repeat(N / 3) + " ",
  spaces: "prose a" + " ".repeat(N) + "b ",
  backticks: "prose " + "`".repeat(10_000) + "x ".repeat(50_000),
  table: "| " + "a".repeat(N) + " |",
  urlish: "prose " + "a:/".repeat(N / 3) + " ",
  urls: "x" + " a://b".repeat(N / 6) + " ",
};
const emit = (started: number, html: string) => {
  process.stdout.write(
    JSON.stringify({
      ms: performance.now() - started,
      head: html.slice(0, 40),
      tail: html.slice(-40),
      wrappers: html.split("<ins ").length - 1,
    }),
  );
  process.exit(0);
};
const mode = process.argv[2]!;
// R4-B1: a long whitespace run inside a changed segment, through wordDiff.
if (mode === "trim-ins" || mode === "trim-del") {
  const long = "prose a" + " ".repeat(N) + "b";
  const segments =
    mode === "trim-ins"
      ? wordDiff("prose old", long)
      : wordDiff(long, "prose old");
  const started = performance.now();
  const side = mode === "trim-ins" ? "after" : "before";
  emit(
    started,
    markSide(segments, side)
      .replaceAll("<del ", "<ins ")
      .replaceAll("</del>", "</ins>"),
  );
}
// Many changed words among many protected tags: one overlap query per word.
if (mode === "many") {
  const segments = Array.from({ length: 15_000 }, (_, i) => [
    { type: "equal" as const, text: "<a> " },
    { type: "delete" as const, text: `w${i}` },
    { type: "insert" as const, text: `v${i}` },
    { type: "equal" as const, text: " " },
  ]).flat();
  const started = performance.now();
  emit(started, markSide(segments, "after"));
}
const prefix = cases[process.argv[2]!]!;
const started = performance.now();
const html = markSide(
  [
    { type: "equal", text: prefix },
    { type: "delete", text: "old" },
    { type: "insert", text: "new" },
  ],
  "after",
);
process.stdout.write(
  JSON.stringify({ ms: performance.now() - started, tail: html.slice(-40) }),
);
