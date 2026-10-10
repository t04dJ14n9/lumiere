import assert from "node:assert/strict";
import test from "node:test";
import { createLanguageLoader } from "./language-loader";

test("notes without a requested language and unknown languages load no grammars", async () => {
  let loaded = 0;
  const load = createLanguageLoader(
    new Map([
      [
        "typescript",
        async () => {
          loaded++;
        },
      ],
    ]),
    new Map(),
  );
  assert.equal(loaded, 0);
  await load("");
  await load("not-a-language");
  await load("constructor");
  assert.equal(loaded, 0);
  await load("typescript");
  assert.equal(loaded, 1);
});

test("aliases and concurrent requests share a single language load", async () => {
  const loaded: string[] = [];
  const loaders = new Map(
    ["typescript", "python", "rust"].map(
      (language) =>
        [
          language,
          async () => {
            loaded.push(language);
          },
        ] as const,
    ),
  );
  const load = createLanguageLoader(loaders, new Map([["ts", "typescript"]]));
  await Promise.all([load("ts"), load("typescript"), load("ts")]);
  await load("typescript");
  assert.deepEqual(loaded, ["typescript"]);
  await load("python");
  assert.deepEqual(loaded, ["typescript", "python"]);
});

test("failed grammar requests can retry", async () => {
  let attempts = 0;
  const load = createLanguageLoader(
    new Map([
      [
        "rust",
        async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error("unavailable");
          }
        },
      ],
    ]),
    new Map(),
  );
  await assert.rejects(load("rust"), /unavailable/);
  await load("rust");
  assert.equal(attempts, 2);
});
