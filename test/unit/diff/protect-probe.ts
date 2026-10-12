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
// Many changed words among many protected tags: the overlap check per word.
if (process.argv[2] === "many") {
  const before = Array.from({ length: 20_000 }, (_, i) => `<a> w${i}`).join(
    " ",
  );
  const after = before.replace(/w(\d+)/g, "v$1");
  const started = performance.now();
  const html = markSide(wordDiff(before, after), "after");
  process.stdout.write(
    JSON.stringify({
      ms: performance.now() - started,
      tail: html.slice(-40) + "new",
    }),
  );
  process.exit(0);
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
