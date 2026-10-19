import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePdfCandidates } from "../../src/shared/pdf-target-resolution";

test("an ambiguous PDF path asks instead of taking the first workspace root", async () => {
  let offered: readonly string[] = [];
  const result = await resolvePdfCandidates(
    ["root1/a.pdf", "root2/a.pdf"],
    (value) => value,
    async () => true,
    async (choices) => {
      offered = choices;
      return choices[1];
    },
  );
  assert.deepEqual(offered, ["root1/a.pdf", "root2/a.pdf"]);
  assert.deepEqual(result, { status: "found", target: "root2/a.pdf" });
});

test("missing files and directories cannot become valid candidates", async () => {
  const result = await resolvePdfCandidates(
    ["missing.pdf", "directory.pdf", "good.pdf"],
    (value) => value,
    async (value) => value === "good.pdf",
    async () => {
      throw new Error("No ambiguity");
    },
  );
  assert.deepEqual(result, { status: "found", target: "good.pdf" });
  assert.deepEqual(
    await resolvePdfCandidates(
      ["missing.pdf"],
      (value) => value,
      async () => false,
      async () => undefined,
    ),
    { status: "missing" },
  );
});

test("cancelling an ambiguous PDF picker never falls back to its first candidate", async () => {
  assert.deepEqual(
    await resolvePdfCandidates(
      ["a", "b"],
      (value) => value,
      async () => true,
      async () => undefined,
    ),
    { status: "cancelled" },
  );
});

test("duplicate candidates do not cause a picker", async () => {
  assert.deepEqual(
    await resolvePdfCandidates(
      ["a", "a"],
      (value) => value,
      async () => true,
      async () => {
        throw new Error("duplicate");
      },
    ),
    { status: "found", target: "a" },
  );
});

test("a selected file is checked again after the picker and must belong to its choices", async () => {
  let selecting = false;
  assert.deepEqual(
    await resolvePdfCandidates(
      ["a", "b"],
      (value) => value,
      async () => !selecting,
      async () => {
        selecting = true;
        return "b";
      },
    ),
    { status: "missing" },
  );
  assert.deepEqual(
    await resolvePdfCandidates(
      ["a", "b"],
      (value) => value,
      async () => true,
      async () => "outside",
    ),
    { status: "missing" },
  );
});
