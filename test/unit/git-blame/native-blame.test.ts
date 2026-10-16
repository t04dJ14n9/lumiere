import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
