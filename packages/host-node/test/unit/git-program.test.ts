import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { findGit, type GitSearch } from "../../src/host/git-program";

function search(overrides: Partial<GitSearch>): GitSearch & { asked: number } {
  const searched = {
    platform: "darwin" as NodeJS.Platform,
    path: "",
    asked: 0,
    async hasDeveloperTools() {
      searched.asked++;
      return true;
    },
    ...overrides,
  };
  return searched;
}

test("outside macOS the PATH's git is git itself", async () => {
  assert.equal(await findGit(search({ platform: "linux" })), "git");
  assert.equal(await findGit(search({ platform: "win32" })), "git");
});

test("on macOS an installed git comes first, and Xcode is not asked about", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-git-path-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = path.join(dir, "git");
  await writeFile(git, "#!/bin/sh\n");
  await chmod(git, 0o755);
  const searched = search({ path: [dir, "/usr/bin"].join(path.delimiter) });
  assert.equal(await findGit(searched), git);
  assert.equal(searched.asked, 0);
});

test("on macOS no git anywhere is no git", async () => {
  assert.equal(await findGit(search({ path: "" })), undefined);
});

test("on macOS Xcode's stand-in is git only with the developer tools", async (t) => {
  if (!existsSync("/usr/bin/git")) {
    t.skip("no /usr/bin/git here");
    return;
  }
  const without = search({
    path: "/usr/bin",
    hasDeveloperTools: async () => false,
  });
  // Running it would offer to install the tools instead.
  assert.equal(await findGit(without), undefined);
  assert.equal(await findGit(search({ path: "/usr/bin" })), "/usr/bin/git");
});
