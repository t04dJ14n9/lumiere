import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { settingsUnavailableIn } from "@workshop/markdown/portable";
import { NodeGitAccess } from "../../src/host/git";
import { NODE_HOST_OFFERS } from "../../src/host/inert";

/**
 * A throwaway folder; left as tmpdir names it (on macOS a symbolic link
 * away from where git says the repository is), so containment and git's
 * resolved paths have to agree.
 */
async function scratch(t: test.TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-git-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** git in `cwd`, with no signing or hooks from the machine's own config. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/** A repository whose note.md says "one" at HEAD. */
async function repository(t: test.TestContext): Promise<{
  dir: string;
  note: string;
  uri: string;
  access: NodeGitAccess;
}> {
  const dir = await scratch(t);
  git(dir, "init", "--quiet");
  git(dir, "config", "user.name", "Ada");
  git(dir, "config", "user.email", "ada@example.com");
  const note = path.join(dir, "note.md");
  await writeFile(note, "one\n");
  git(dir, "add", "note.md");
  git(dir, "commit", "--quiet", "-m", "First");
  const access = new NodeGitAccess({ roots: () => [fileUri(dir)] });
  t.after(() => access.dispose());
  return { dir, note, uri: fileUri(note), access };
}

function fileUri(file: string): string {
  return pathToFileURL(file).toString();
}

async function until(done: () => boolean, what: string): Promise<void> {
  for (let waited = 0; waited < 5000; waited += 50) {
    if (done()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`never saw ${what}`);
}

test("blame names the commit of a committed line and none for an edited one", async (t) => {
  const { dir, uri, access } = await repository(t);
  const head = git(dir, "rev-parse", "HEAD");
  const snapshot = { contents: "new\none\n", version: 2 };
  const committed = await access.blameLine(uri, 2, snapshot);
  assert.equal(committed.status, "ok");
  if (committed.status === "ok") {
    assert.equal(committed.blame.commit, head);
    assert.equal(committed.blame.authorName, "Ada");
    assert.equal(committed.blame.subject, "First");
  }
  // Line 1 is only in the editor: blame follows the page, not the disk.
  const edited = await access.blameLine(uri, 1, snapshot);
  assert.equal(edited.status, "uncommitted");
});

test("the baseline is the note at HEAD or in the index, with LF endings", async (t) => {
  const { dir, note, uri, access } = await repository(t);
  const head = git(dir, "rev-parse", "HEAD");
  await writeFile(note, "two\r\n");
  git(dir, "add", "note.md");
  await writeFile(note, "three\n");
  assert.deepEqual(await access.baseline(uri, "HEAD"), {
    status: "ok",
    baseline: { text: "one\n", label: `HEAD (${head.slice(0, 7)})` },
  });
  assert.deepEqual(await access.baseline(uri, "index"), {
    status: "ok",
    baseline: { text: "two\n", label: "Index" },
  });
});

test("a note git does not know is untracked; past the diff limits, too large", async (t) => {
  const { dir, access } = await repository(t);
  const fresh = path.join(dir, "fresh.md");
  await writeFile(fresh, "new\n");
  assert.deepEqual(await access.baseline(fileUri(fresh), "HEAD"), {
    status: "untracked",
  });
  assert.deepEqual(await access.baseline(fileUri(fresh), "index"), {
    status: "untracked",
  });
  const long = path.join(dir, "long.md");
  await writeFile(long, "x\n".repeat(20_001));
  git(dir, "add", "long.md");
  git(dir, "commit", "--quiet", "-m", "Long");
  assert.deepEqual(await access.baseline(fileUri(long), "HEAD"), {
    status: "tooLarge",
  });
});

test("a repository with no commit has nothing at HEAD", async (t) => {
  const dir = await scratch(t);
  git(dir, "init", "--quiet");
  const note = path.join(dir, "note.md");
  await writeFile(note, "one\n");
  const access = new NodeGitAccess({ roots: () => [fileUri(dir)] });
  t.after(() => access.dispose());
  assert.deepEqual(await access.baseline(fileUri(note), "HEAD"), {
    status: "untracked",
  });
});

test("stage adds the note as it is on disk", async (t) => {
  const { dir, note, uri, access } = await repository(t);
  await writeFile(note, "staged\n");
  assert.equal(await access.stage(uri), true);
  assert.equal(git(dir, "show", ":note.md"), "staged");
});

test("identity is the repository's author", async (t) => {
  const { uri, access } = await repository(t);
  assert.deepEqual(await access.identity(uri), {
    userName: "Ada",
    userEmail: "ada@example.com",
  });
});

test("a commit is heard, and the repository's generation moves first", async (t) => {
  const { dir, note, uri, access } = await repository(t);
  // The repository is watched once a note in it was asked about.
  await access.baseline(uri, "HEAD");
  const before = access.repoGeneration(uri);
  const seen: number[] = [];
  const stop = access.onDidChange(() => seen.push(access.repoGeneration(uri)));
  t.after(stop);
  await writeFile(note, "two\n");
  git(dir, "commit", "--quiet", "-am", "Second");
  await until(() => seen.length > 0, "the commit");
  assert.ok((seen[0] ?? 0) > before);
});

test("a question answered after stopping starts no watch, so the host can exit", async (t) => {
  const { uri, access } = await repository(t);
  const watches = () =>
    process.getActiveResourcesInfo().filter((name) => name === "FSEventWrap")
      .length;
  const before = watches();
  const late = access.baseline(uri, "HEAD");
  access.dispose();
  await late;
  assert.equal(watches(), before);
});

test("a note outside the workspace roots is never asked about", async (t) => {
  const { uri } = await repository(t);
  const elsewhere = await scratch(t);
  const access = new NodeGitAccess({ roots: () => [fileUri(elsewhere)] });
  t.after(() => access.dispose());
  assert.deepEqual(await access.baseline(uri, "HEAD"), {
    status: "unavailable",
  });
  const blame = await access.blameLine(uri, 1, {
    contents: "one\n",
    version: 1,
  });
  assert.equal(blame.status, "unavailable");
  assert.equal(await access.identity(uri), undefined);
  assert.equal(await access.stage(uri), false);
  assert.equal(access.toGitUri(), undefined);
});

test("a note in no repository, or with no git at all, is unavailable", async (t) => {
  const dir = await scratch(t);
  await mkdir(path.join(dir, "notes"));
  const note = path.join(dir, "notes", "plain.md");
  await writeFile(note, "one\n");
  const roots = () => [fileUri(dir)];
  const plain = new NodeGitAccess({ roots });
  t.after(() => plain.dispose());
  assert.deepEqual(await plain.baseline(fileUri(note), "index"), {
    status: "unavailable",
  });
  const noGit = new NodeGitAccess({
    roots,
    runGit: async () => {
      throw Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
    },
  });
  t.after(() => noGit.dispose());
  const blame = await noGit.blameLine(fileUri(note), 1, {
    contents: "one\n",
    version: 1,
  });
  assert.deepEqual(blame, { status: "unavailable", repoGeneration: 0 });
  assert.equal(await noGit.stage(fileUri(note)), false);
});

test("this host offers Git, so blame and the gutter keep their settings", () => {
  const hidden = settingsUnavailableIn(NODE_HOST_OFFERS);
  assert.equal(hidden.has("lumiere.markdown.plugins.gitBlame.enabled"), false);
  assert.equal(hidden.has("lumiere.markdown.plugins.gitGutter.enabled"), false);
  assert.equal(hidden.has("lumiere.markdown.plugins.gitInline.enabled"), false);
  // The rendered diff opens in VS Code's window, which no Node host has.
  assert.equal(
    hidden.has("lumiere.markdown.plugins.gitDiffEditor.enabled"),
    true,
  );
});
