import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import type { ChildProcess, spawn } from "node:child_process";
import {
  createSpawnBlameRunner,
  discoverGitRoot,
  runBlameLine,
} from "../../../src/host/git-blame";
import type { GitBlameRunner } from "../../../src/host/git-blame";
import { RepositoryWatch } from "../../../src/host/git-watch";
import {
  bindDiscoveredRoot,
  canonicalPath,
  resolveCommonDir,
  resolveGitDir,
  watchGitMetadata,
} from "../../../src/host/git-discovered-watch";

const oid = "a".repeat(40);
const porcelain = (commit = oid) =>
  `${commit} 1 1 1\nauthor Dev\nauthor-mail <dev@example.com>\nauthor-time 1700000000\nsummary Initial\nboundary\n\talpha\n`;
const options = (runGit: GitBlameRunner) => ({
  cwd: "/repo",
  relativePath: "note.md",
  line: 1,
  snapshot: { contents: "alpha\n", version: 1 },
  knownClean: false,
  generationAtStart: 0,
  getGeneration: () => 0,
  runGit,
  timeoutMs: 5000,
});

async function repo() {
  const root = await mkdtemp(join(tmpdir(), "mw-blame-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  git("init");
  git("config", "user.email", "dev@example.com");
  git("config", "user.name", "Dev");
  const file = join(root, "note.md");
  await writeFile(file, "alpha\nbeta\ngamma\n");
  git("add", "note.md");
  git("commit", "-m", "Initial");
  const initialOid = git("rev-parse", "HEAD");
  git("config", "user.email", "eve@example.com");
  git("config", "user.name", "Eve");
  await writeFile(file, "alpha\nbeta-touched\ngamma\n");
  git("add", "note.md");
  git("commit", "-m", "Touch beta");
  return { root, initialOid, betaOid: git("rev-parse", "HEAD") };
}

test("dirty insert above caret blames snapshot alpha, not disk beta by Eve", async () => {
  const { root, initialOid, betaOid } = await repo();
  try {
    const runGit = createSpawnBlameRunner();
    const base = { ...options(runGit), cwd: root, line: 2 };
    const clean = await runBlameLine({ ...base, knownClean: true });
    assert.equal(clean.status, "ok");
    if (clean.status === "ok") {
      assert.equal(clean.blame.commit, betaOid);
      assert.equal(clean.blame.authorName, "Eve");
    }
    const dirty = await runBlameLine({
      ...base,
      snapshot: { contents: "NEW\nalpha\nbeta-touched\ngamma\n", version: 2 },
    });
    assert.equal(dirty.status, "ok");
    if (dirty.status === "ok") {
      assert.equal(dirty.blame.line, 2);
      assert.equal(dirty.blame.commit, initialOid);
      assert.equal(dirty.blame.subject, "Initial");
      assert.equal(dirty.blame.authorName, "Dev");
      assert.equal(dirty.blame.boundary, true);
    }
    const added = await runBlameLine({
      ...base,
      line: 1,
      snapshot: { contents: "NEW\nalpha\nbeta-touched\ngamma\n", version: 2 },
    });
    assert.equal(added.status, "uncommitted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dirty argv forwards stdin and timeout; clean argv omits contents", async () => {
  const calls: Parameters<GitBlameRunner>[0][] = [];
  const runGit: GitBlameRunner = async (request) => {
    calls.push(request);
    return { stdout: porcelain(), stderr: "" };
  };
  await runBlameLine(options(runGit));
  assert.equal(calls[0]?.stdin, "alpha\n");
  assert.equal(calls[0]?.timeoutMs, 5000);
  assert.ok(calls[0]?.args.includes("--contents"));
  await runBlameLine({ ...options(runGit), knownClean: true });
  assert.equal(calls[1]?.stdin, undefined);
  assert.equal(calls[1]?.args.includes("--contents"), false);
});

// Node process/stream events are separate from the typed kernel event catalogue.
function emitProcessEvent(
  emitter: EventEmitter,
  event: string,
  ...args: unknown[]
): void {
  emitter.emit(event, ...args);
}

function fakeChild() {
  const child = new EventEmitter() as ChildProcess;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = new EventEmitter();
  const writes: string[] = [];
  let ended = false;
  let killed = false;
  Object.assign(stdout, { setEncoding() {} });
  Object.assign(stderr, { setEncoding() {} });
  Object.assign(stdin, {
    write(text: string) {
      writes.push(text);
    },
    end() {
      ended = true;
    },
  });
  Object.assign(child, {
    stdout,
    stderr,
    stdin,
    kill() {
      killed = true;
      return true;
    },
  });
  const launch = (() => child) as unknown as typeof spawn;
  return {
    child,
    stdout,
    stdin,
    launch,
    writes,
    ended: () => ended,
    killed: () => killed,
  };
}

test("production runner explicitly writes snapshot bytes and closes stdin", async () => {
  const fake = fakeChild();
  const promise = createSpawnBlameRunner(fake.launch)({
    args: [],
    cwd: "/",
    stdin: "α\n",
    timeoutMs: 5000,
  });
  assert.deepEqual(fake.writes, ["α\n"]);
  assert.equal(fake.ended(), true);
  emitProcessEvent(fake.stdout, "data", porcelain());
  emitProcessEvent(fake.child, "close", 0);
  assert.equal((await promise).stdout, porcelain());
});

test("production runner enforces timeout and kills the child", async () => {
  const fake = fakeChild();
  await assert.rejects(
    createSpawnBlameRunner(fake.launch)({ args: [], cwd: "/", timeoutMs: 5 }),
    /timed out/,
  );
  assert.equal(fake.killed(), true);
});

test("production runner rejects excess output and stdin errors", async () => {
  for (const mode of ["buffer", "stdin"]) {
    const fake = fakeChild();
    const pending = createSpawnBlameRunner(fake.launch)({
      args: [],
      cwd: "/",
      timeoutMs: 5000,
      maxBuffer: 4,
    });
    if (mode === "buffer") {
      emitProcessEvent(fake.stdout, "data", "too long");
    } else {
      emitProcessEvent(fake.stdin, "error", new Error("EPIPE"));
    }
    await assert.rejects(pending);
    assert.equal(fake.killed(), true);
  }
});

test("SHA-256 zero OID is uncommitted through the runner parse path", async () => {
  const result = await runBlameLine(
    options(async () => ({ stdout: porcelain("0".repeat(64)), stderr: "" })),
  );
  assert.equal(result.status, "uncommitted");
});

test("mid-blame generation bump is stale on success and failure", async () => {
  for (const fails of [false, true]) {
    let generation = 0;
    const result = await runBlameLine({
      ...options(async () => {
        generation++;
        if (fails) {
          throw new Error("checkout");
        }
        return { stdout: porcelain(), stderr: "" };
      }),
      getGeneration: () => generation,
    });
    assert.equal(result.status, "stale");
    assert.equal(result.repoGeneration, 1);
  }
});

function changeSource() {
  const listeners = new Set<() => void>();
  return {
    event(listener: () => void) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    fire() {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function watchedRepository() {
  const change = changeSource();
  const watch = new RepositoryWatch();
  const repository = {
    rootUri: { toString: () => "file:///repo", fsPath: "/repo" },
    state: { onDidChange: change.event },
  };
  const opened = changeSource();
  const closed = changeSource();
  watch.attach({
    repositories: [repository],
    onDidOpenRepository: opened.event,
    onDidCloseRepository: closed.event,
  } as never);
  return { watch, change, root: "file:///repo" };
}

test("NativeGitAccess production watcher binding makes an in-flight blame stale (B5)", async () => {
  const { watch, change, root } = watchedRepository();
  let resolve!: (value: { stdout: string; stderr: string }) => void;
  const pending = runBlameLine({
    ...options(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
    generationAtStart: watch.repoGeneration(root),
    getGeneration: () => watch.repoGeneration(root),
  });
  change.fire();
  resolve({ stdout: porcelain(), stderr: "" });
  const result = await pending;
  assert.equal(result.status, "stale");
  assert.equal(result.repoGeneration, 1);
  watch.dispose();
});

test("one underlying repository event advances once before two subscribers", () => {
  const { watch, change, root } = watchedRepository();
  const seen: number[] = [];
  watch.subscribe(() => seen.push(watch.repoGeneration(root)));
  watch.subscribe(() => seen.push(watch.repoGeneration(root)));
  change.fire();
  assert.deepEqual(seen, [1, 1]);
  assert.equal(watch.repoGeneration(root), 1);
  change.fire();
  assert.deepEqual(seen, [1, 1, 2, 2]);
  watch.dispose();
});

test("watch attachment is idempotent; detaching releases the production callback", () => {
  const { watch, change, root } = watchedRepository();
  const seen: number[] = [];
  const unsubscribe = watch.subscribe(() =>
    seen.push(watch.repoGeneration(root)),
  );
  watch.invalidate();
  assert.deepEqual(seen, [1]);
  watch.detach();
  change.fire();
  assert.deepEqual(seen, [1]);
  unsubscribe();
  watch.dispose();
});

test("empty/invalid/oversize snapshots never spawn; timeout errors soft-hide", async () => {
  let calls = 0;
  const runGit: GitBlameRunner = async () => {
    calls++;
    throw new Error("timeout");
  };
  assert.equal(
    (await runBlameLine({ ...options(runGit), line: 0 })).status,
    "empty",
  );
  assert.equal(
    (
      await runBlameLine({
        ...options(runGit),
        snapshot: { contents: "", version: 1 },
      })
    ).status,
    "empty",
  );
  assert.equal(
    (
      await runBlameLine({
        ...options(runGit),
        snapshot: { contents: "x".repeat(1_000_001), version: 1 },
      })
    ).status,
    "unavailable",
  );
  assert.equal(calls, 0);
  assert.equal((await runBlameLine(options(runGit))).status, "unavailable");
});

test("known-identical-to-disk optimization still classifies dirty worktree lines as uncommitted", async () => {
  const { root } = await repo();
  try {
    const contents = "alpha\nunsaved on disk\ngamma\n";
    await writeFile(join(root, "note.md"), contents);
    const result = await runBlameLine({
      ...options(createSpawnBlameRunner()),
      cwd: root,
      line: 2,
      knownClean: true,
      snapshot: { contents, version: 4 },
    });
    assert.equal(result.status, "uncommitted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discoverGitRoot finds the work tree from a nested path without vscode.git", async () => {
  const { root } = await repo();
  try {
    const runGit = createSpawnBlameRunner();
    const nested = join(root, "notes");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "home.md"), "hello\n");
    assert.equal(await discoverGitRoot(nested, runGit), root);
    assert.equal(
      await discoverGitRoot(join(nested, "missing-dir"), runGit),
      undefined,
    );
    const outside = await mkdtemp(join(tmpdir(), "mw-blame-none-"));
    try {
      assert.equal(await discoverGitRoot(outside, runGit), undefined);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
    // Empty-window / parent-prompt path: blame using only the discovered root.
    const discovered = await discoverGitRoot(nested, runGit);
    assert.ok(discovered);
    const contents = "alpha\nbeta-touched\ngamma\n";
    const result = await runBlameLine({
      ...options(runGit),
      cwd: discovered!,
      relativePath: "note.md",
      line: 1,
      snapshot: { contents, version: 1 },
    });
    assert.equal(result.status, "ok");
    if (result.status === "ok") {
      assert.equal(result.blame.authorName, "Dev");
      assert.equal(result.blame.line, 1);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("enrollDiscovered advances generation and notifies like API onDidChange (B1)", () => {
  const watch = new RepositoryWatch();
  const change = changeSource();
  const root = "file:///discovered-repo";
  const seen: number[] = [];
  watch.subscribe(() => seen.push(watch.repoGeneration(root)));
  watch.enrollDiscovered(root, change.event);
  assert.equal(watch.repoGeneration(root), 0);
  assert.deepEqual(seen, []);
  change.fire();
  assert.deepEqual(seen, [1]);
  assert.equal(watch.repoGeneration(root), 1);
  watch.enrollDiscovered(root, change.event); // idempotent
  change.fire();
  assert.deepEqual(seen, [1, 2]);
  watch.detach();
  change.fire();
  assert.deepEqual(seen, [1, 2]);
  watch.dispose();
});

test("invalidate includes discovered roots for identity-cache epochs", () => {
  const watch = new RepositoryWatch();
  const change = changeSource();
  const root = "file:///discovered-repo";
  watch.enrollDiscovered(root, change.event);
  const seen: number[] = [];
  watch.subscribe(() => seen.push(watch.repoGeneration(root)));
  watch.invalidate();
  assert.deepEqual(seen, [1]);
  watch.dispose();
});

test("bindDiscoveredRoot bumps generation after terminal amend without note edit (B1)", async () => {
  const { root } = await repo();
  const rootUri = `file://${root}`;
  const watch = new RepositoryWatch();
  try {
    assert.equal(resolveGitDir(root), join(root, ".git"));
    const binding = bindDiscoveredRoot(watch, rootUri, root);
    assert.ok(binding);
    assert.equal(watch.repoGeneration(rootUri), 0);
    const seen: number[] = [];
    watch.subscribe(() => seen.push(watch.repoGeneration(rootUri)));

    // Amend author/subject from a "terminal" without touching the note text.
    execFileSync(
      "git",
      [
        "commit",
        "--amend",
        "--author=Amender <amender@example.com>",
        "-m",
        "Amended subject",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          GIT_COMMITTER_NAME: "Amender",
          GIT_COMMITTER_EMAIL: "amender@example.com",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && watch.repoGeneration(rootUri) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      watch.repoGeneration(rootUri) >= 1,
      "expected FS metadata watch to advance generation after amend",
    );
    assert.ok(seen.length >= 1);
    assert.ok(seen[0]! >= 1);
    binding!.dispose();
    const after = watch.repoGeneration(rootUri);
    // Production detachWatch closes FS + enroll together; after detach, further
    // amends must not advance this root's generation.
    watch.detach();
    execFileSync("git", ["commit", "--amend", "-m", "Again"], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(watch.repoGeneration(rootUri), after);
  } finally {
    watch.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("watchGitMetadata fires when HEAD is rewritten", async () => {
  const { root } = await repo();
  try {
    const gitDir = resolveGitDir(root);
    assert.ok(gitDir);
    let fires = 0;
    const watcher = watchGitMetadata(gitDir!, () => {
      fires++;
    });
    execFileSync(
      "git",
      ["commit", "--amend", "-m", "Rewrite HEAD", "--no-edit"],
      {
        cwd: root,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && fires === 0) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(fires >= 1, "expected HEAD/refs watch to fire on amend");
    watcher.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("directory metadata watch survives successive atomic config replaces", async () => {
  const { root } = await repo();
  const rootUri = `file://${root}`;
  const watch = new RepositoryWatch();
  try {
    const binding = bindDiscoveredRoot(watch, rootUri, root);
    assert.ok(binding);
    execFileSync("git", ["config", "user.email", "one@example.com"], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const firstDeadline = Date.now() + 3000;
    while (Date.now() < firstDeadline && watch.repoGeneration(rootUri) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const afterFirst = watch.repoGeneration(rootUri);
    assert.ok(afterFirst >= 1, "first config replace must advance generation");
    execFileSync("git", ["config", "user.email", "two@example.com"], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const secondDeadline = Date.now() + 3000;
    while (
      Date.now() < secondDeadline &&
      watch.repoGeneration(rootUri) === afterFirst
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      watch.repoGeneration(rootUri) > afterFirst,
      "second config replace must advance generation after inode replace",
    );
    binding!.dispose();
  } finally {
    watch.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("canonicalPath keeps symlink alias notes inside the discovered root", async () => {
  const { root } = await repo();
  const parent = await mkdtemp(join(tmpdir(), "mw-blame-alias-"));
  try {
    const alias = join(parent, "alias");
    await symlink(root, alias);
    const noteViaAlias = join(alias, "note.md");
    const relativePath = relative(
      canonicalPath(root),
      canonicalPath(noteViaAlias),
    );
    assert.equal(relativePath, "note.md");
    assert.equal(
      relative(root, noteViaAlias).startsWith("..") ||
        isAbsolute(relative(root, noteViaAlias)),
      true,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("linked worktree watches shared commondir config changes", async () => {
  const { root } = await repo();
  const parent = await mkdtemp(join(tmpdir(), "mw-blame-wt-"));
  const linked = join(parent, "linked");
  try {
    execFileSync("git", ["worktree", "add", linked, "HEAD"], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const gitDir = resolveGitDir(linked);
    assert.ok(gitDir);
    const common = resolveCommonDir(gitDir!);
    assert.ok(common, "linked worktree exposes commondir");
    const rootUri = `file://${linked}`;
    const watch = new RepositoryWatch();
    const binding = bindDiscoveredRoot(watch, rootUri, linked);
    assert.ok(binding);
    // Config lives in the shared (common) git dir, not the private worktree dir.
    execFileSync("git", ["config", "user.email", "wt@example.com"], {
      cwd: linked,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && watch.repoGeneration(rootUri) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      watch.repoGeneration(rootUri) >= 1,
      "commondir config change must invalidate the linked worktree root",
    );
    binding!.dispose();
    watch.dispose();
  } finally {
    try {
      execFileSync("git", ["worktree", "remove", "--force", linked], {
        cwd: root,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      /* Best-effort cleanup. */
    }
    await rm(parent, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
