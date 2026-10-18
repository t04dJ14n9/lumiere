import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as locations from "../../src/shared/pdf-location";
import * as targets from "../../src/shared/pdf-target-resolution";
import { OPEN_LOCATION_COMMAND_ID } from "../../src/extension/plugins/pdf/registered-commands";
import * as platform from "@workshop/platform";

class Uri {
  readonly path: string;
  readonly fragment: string;
  constructor(file: string, fragment = "") {
    this.path = file;
    this.fragment = fragment;
  }
  static file(file: string): Uri {
    return new Uri(file);
  }
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri(path.join(base.path, ...parts));
  }
  static parse(value: string): Uri {
    const url = new URL(value);
    // Decode %23 etc. so fsPath matches the real file (VS Code Uri does this).
    return new Uri(decodeURIComponent(url.pathname), url.hash.slice(1));
  }
  get fsPath(): string {
    return this.path;
  }
  with(change: { fragment: string }): Uri {
    return new Uri(this.path, change.fragment);
  }
  toString(): string {
    const encoded = this.path.replaceAll("#", "%23").replaceAll("?", "%3F");
    return `file://${encoded}${this.fragment ? `#${this.fragment}` : ""}`;
  }
}

class Disposable {
  private callback: (() => void) | undefined;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  dispose(): void {
    const callback = this.callback;
    this.callback = undefined;
    callback?.();
  }
}

class CancellationTokenSource {
  readonly token = { isCancellationRequested: false };
  cancel(): void {
    this.token.isCancellationRequested = true;
  }
  dispose(): void {
    /* No platform resources in this controlled fake. */
  }
}

interface OpenRequest {
  file: string;
  resolve(): void;
  reject(error: Error): void;
}

/** Actual command module; only the VS Code transport is replaced with controlled promises. */
function harness() {
  let invoke:
    ((target?: unknown, location?: unknown) => Promise<boolean>) | undefined;
  const opened: OpenRequest[] = [];
  const jumps: { file: string; page: number }[] = [];
  const warnings: string[] = [];
  const vscode = {
    Uri,
    Disposable,
    CancellationTokenSource,
    FileType: { File: 1, Directory: 2 },
    workspace: {
      workspaceFolders: [],
      fs: { stat: async () => ({ type: 1 }) },
    },
    window: {
      showInputBox: async () => undefined,
      showQuickPick: async () => undefined,
      showWarningMessage: async (message: string) => {
        warnings.push(message);
      },
    },
    commands: {
      registerCommand: (_id: string, callback: typeof invoke) => {
        invoke = callback;
        return new Disposable(() => undefined);
      },
      executeCommand: (id: string, file: Uri) => {
        assert.equal(id, "vscode.openWith");
        return new Promise<void>((resolve, reject) => {
          opened.push({ file: file.path, resolve, reject });
        });
      },
    },
  };
  const modules: Record<string, unknown> = {
    "@workshop/platform": platform,
    vscode,
    "../../../shared/pdf-location": locations,
    "../../../shared/pdf-target-resolution": targets,
    "./panels": { VIEW_TYPE: "pdfWorkshop.viewer" },
    "./registered-commands": { OPEN_LOCATION_COMMAND_ID },
  };
  const source = readFileSync(
    new URL("../../src/extension/plugins/pdf/commands.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(
    `(function(require, module, exports) { ${output}\n})`,
  ) as (
    require: (id: string) => unknown,
    module: { exports: Record<string, unknown> },
    exports: Record<string, unknown>,
  ) => void;
  evaluate(
    (id) => {
      assert.ok(id in modules, `Unexpected runtime dependency: ${id}`);
      return modules[id];
    },
    module,
    module.exports,
  );
  const register = module.exports.registerOpenLocation as (
    panels: unknown,
    os: { platform: string },
  ) => Disposable;
  const registration = register(
    {
      waitFor: async (file: Uri) => ({
        goTo: (location: { page: number }) => {
          jumps.push({ file: file.path, page: location.page });
        },
      }),
    },
    { platform: process.platform },
  );
  return {
    opened,
    jumps,
    warnings,
    registration,
    invoke: (file: string, page = 2) => invoke!(file, { page }),
    /** Open from a single durable link; page/box come from the URI fragment. */
    invokeLink: (link: string) => invoke!(link),
  };
}

async function microtasks(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
}

test("a slow open A cannot overtake newer C, and obsolete queued B never dispatches", async () => {
  const state = harness();
  const a = state.invoke("/a.pdf", 2);
  await microtasks();
  assert.deepEqual(
    state.opened.map((request) => request.file),
    ["/a.pdf"],
  );
  const b = state.invoke("/b.pdf", 3);
  const c = state.invoke("/c.pdf", 4);
  await microtasks();
  assert.deepEqual(
    state.opened.map((request) => request.file),
    ["/a.pdf"],
  );
  state.opened[0]!.resolve();
  await microtasks();
  assert.deepEqual(
    state.opened.map((request) => request.file),
    ["/a.pdf", "/c.pdf"],
  );
  state.opened[1]!.resolve();
  assert.deepEqual(await Promise.all([a, b, c]), [false, false, true]);
  assert.deepEqual(state.jumps, [{ file: "/c.pdf", page: 4 }]);
  state.registration.dispose();
});

test("disposing the command invalidates in-flight arrival and skips queued native opens", async () => {
  const state = harness();
  const a = state.invoke("/a.pdf");
  await microtasks();
  const b = state.invoke("/b.pdf");
  await microtasks();
  state.registration.dispose();
  state.opened[0]!.resolve();
  assert.deepEqual(await Promise.all([a, b]), [false, false]);
  assert.deepEqual(
    state.opened.map((request) => request.file),
    ["/a.pdf"],
  );
  assert.deepEqual(state.jumps, []);
});

test("a rejected older native open does not poison the queue for the newest request", async () => {
  const state = harness();
  const a = state.invoke("/a.pdf").catch((error: unknown) => error);
  await microtasks();
  const b = state.invoke("/b.pdf", 7);
  await microtasks();
  state.opened[0]!.reject(new Error("old editor failed"));
  await microtasks();
  assert.deepEqual(
    state.opened.map((request) => request.file),
    ["/a.pdf", "/b.pdf"],
  );
  state.opened[1]!.resolve();
  const failed = await a;
  assert.ok(failed instanceof Error);
  assert.match(failed.message, /old editor failed/);
  assert.equal(await b, true);
  assert.deepEqual(state.jumps, [{ file: "/b.pdf", page: 7 }]);
  state.registration.dispose();
});

test("a durable locator with # in the filename round-trips through openLocation", async () => {
  const state = harness();
  const link =
    "file:///work/papers/report%23draft.pdf#page=3&viewrect=10,20,20,20";
  const done = state.invokeLink(link);
  await microtasks();
  assert.deepEqual(
    state.opened.map((request) => request.file),
    ["/work/papers/report#draft.pdf"],
  );
  state.opened[0]!.resolve();
  assert.equal(await done, true);
  assert.deepEqual(state.jumps, [
    { file: "/work/papers/report#draft.pdf", page: 3 },
  ]);
  state.registration.dispose();
});
