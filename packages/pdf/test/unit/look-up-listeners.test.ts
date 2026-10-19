import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as words from "../../src/shared/look-up";

function harness() {
  const listeners = new Map<
    string,
    (event: { clientX: number; clientY: number }) => void
  >();
  const messages: { word: string | null; open: boolean }[] = [];
  let timer: (() => void) | undefined;
  let dispose = () => {};
  let top = 0;
  let pending: (() => void)[] | undefined;
  const element = {
    hasAttribute: () => true,
    getAttribute: () => "0",
    getBoundingClientRect: () => ({ left: 0, top, width: 100 }),
  };
  const engine = {
    getPageGlyphs: () => ({
      toPromise: async () => [
        { origin: { x: 0, y: 0 }, size: { width: 8, height: 10 } },
        {
          isSpace: true,
          origin: { x: 8, y: 0 },
          size: { width: 2, height: 10 },
        },
        { origin: { x: 10, y: 0 }, size: { width: 8, height: 10 } },
      ],
    }),
    getTextSlices: (_pdf: unknown, ranges: { charIndex: number }[]) => ({
      toPromise: () =>
        new Promise<string[]>((resolve) => {
          const complete = () =>
            resolve([ranges[0]!.charIndex === 0 ? "alpha" : "beta"]);
          if (pending) {
            pending.push(complete);
          } else {
            complete();
          }
        }),
    }),
  };
  const modules: Record<string, unknown> = {
    react: {
      useCallback: (callback: unknown) => callback,
      useRef: (current: unknown) => ({ current }),
      useEffect: (effect: () => () => void) => {
        dispose = effect();
      },
    },
    "@embedpdf/core/react": {
      useRegistry: () => ({ registry: { getEngine: () => engine } }),
    },
    "../shared/look-up": words,
    "./host": {
      postToHost: (message: { word: string | null; open: boolean }) =>
        messages.push(message),
    },
  };
  const source = readFileSync(
    new URL("../../src/webview/look-up.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = {
    exports: {} as { useLookUp(pdf: unknown, enabled: boolean): () => void },
  };
  const evaluate = runInNewContext(
    `(function(require,module,exports){${output}\n})`,
    {
      document: {
        elementsFromPoint: () => [element],
        addEventListener: (
          name: string,
          fn: (event: { clientX: number; clientY: number }) => void,
        ) => listeners.set(name, fn),
        removeEventListener: (name: string) => listeners.delete(name),
      },
      setTimeout: (fn: () => void) => {
        timer = fn;
        return 1;
      },
      clearTimeout: () => {
        timer = undefined;
      },
    },
  ) as (
    require: (name: string) => unknown,
    module: unknown,
    exports: unknown,
  ) => void;
  evaluate(
    (name) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
    module,
    module.exports,
  );
  const open = module.exports.useLookUp(
    { pages: [{ index: 0, size: { width: 100 }, rotation: 0 }] },
    true,
  );
  return {
    open,
    messages,
    emit: (name: string, x = 2) =>
      listeners.get(name)?.({ clientX: x, clientY: 5 }),
    hover: () => {
      const run = timer;
      timer = undefined;
      run?.();
    },
    movePage: () => {
      top = 30;
    },
    hold: () => {
      pending = [];
      return pending;
    },
    dispose: () => dispose(),
  };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("context click resolves the exact neighboring word and owns it over later hover", async () => {
  const h = harness();
  h.emit("pointermove");
  h.hover();
  await tick();
  assert.equal(h.messages.at(-1)?.word, "alpha");
  h.emit("contextmenu", 12);
  h.emit("pointermove", 2);
  h.hover();
  await tick();
  assert.equal(h.messages.at(-1)?.word, "beta");
  h.dispose();
});
test("scroll and changed geometry invalidate an in-flight clicked word", async () => {
  const h = harness();
  const pending = h.hold();
  h.emit("contextmenu");
  await tick();
  h.movePage();
  h.emit("scroll");
  pending.forEach((done) => done());
  await tick();
  assert.equal(h.messages.at(-1)?.word, null);
  h.dispose();
});
test("newer clicks win out of order and disposed listeners never publish", async () => {
  const h = harness();
  const pending = h.hold();
  h.emit("contextmenu");
  await tick();
  h.emit("contextmenu", 12);
  await tick();
  pending[1]!();
  await tick();
  pending[0]!();
  await tick();
  assert.equal(h.messages.at(-1)?.word, "beta");
  h.emit("contextmenu");
  await tick();
  const count = h.messages.length;
  h.dispose();
  pending[2]!();
  await tick();
  assert.equal(h.messages.length, count);
});

test("the native command resolves the saved click, not a later hover point", async () => {
  const h = harness();
  h.emit("contextmenu", 12);
  h.emit("pointermove", 2);
  h.open();
  await tick();
  assert.equal(h.messages.at(-1)?.word, "beta");
  assert.equal(h.messages.at(-1)?.open, true);
  h.emit("scroll");
  const count = h.messages.length;
  h.open();
  await tick();
  assert.equal(h.messages.length, count);
  h.dispose();
});
