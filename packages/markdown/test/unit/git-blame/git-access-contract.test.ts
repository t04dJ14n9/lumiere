// test/unit/git-blame/git-access-contract.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type { GitAccess } from "../../../src/shared/git";

function fakeGit(): GitAccess & { bump: () => void; generation: number } {
  let generation = 0;
  const listeners = new Set<() => void>();
  return {
    generation: 0,
    bump() {
      generation += 1;
      this.generation = generation;
      for (const listener of listeners) {
        listener();
      }
    },
    async baseline() {
      return { status: "unavailable" };
    },
    onDidChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async stage() {
      return false;
    },
    toGitUri() {
      return undefined;
    },
    repoGeneration() {
      return generation;
    },
    async identity() {
      return { userName: "You", userEmail: "you@example.com" };
    },
    async blameLine(_uri, line, _snapshot) {
      return {
        status: "ok",
        repoGeneration: generation,
        blame: {
          commit: "a".repeat(40),
          shortCommit: "aaaaaaa",
          authorName: "Ada",
          authorEmail: "ada@example.com",
          authorDate: 1600000000,
          subject: "Hi",
          line,
        },
      };
    },
  };
}

test("GitAccess.repoGeneration bumps independently of caret", () => {
  const git = fakeGit();
  assert.equal(git.repoGeneration("file:///x.md"), 0);
  git.bump();
  assert.equal(git.repoGeneration("file:///x.md"), 1);
});

test("blameLine result carries repoGeneration", async () => {
  const git = fakeGit();
  git.bump();
  const result = await git.blameLine("file:///x.md", 1, {
    contents: "a\n",
    version: 1,
  });
  assert.equal(result.repoGeneration, 1);
});
