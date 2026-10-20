import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_EMBED, mountImageEmbedActions } from "./embed-actions";

type Stub = {
  classList: { add(n: string): void; contains(n: string): boolean };
  names: Set<string>;
  after?: (n: Stub) => void;
  append?: (...nodes: Stub[]) => void;
  children?: Stub[];
};

function el(initial: string[] = []): Stub {
  const names = new Set(initial);
  return {
    names,
    classList: {
      add: (n) => {
        names.add(n);
      },
      contains: (n) => names.has(n),
    },
  };
}

test("mountImageEmbedActions tags host and wraps inspect in embed-actions", () => {
  const host = el(["file-embed"]);
  const placed: Stub[] = [];
  const image = el();
  image.after = (node) => {
    placed.push(node);
  };
  const inspect = el(["inspect-image"]);

  let createdTag = "";
  const prev = globalThis.document;
  (globalThis as { document: unknown }).document = {
    createElement(tag: string) {
      createdTag = tag;
      const actions = el();
      actions.children = [];
      actions.append = (...nodes: Stub[]) => {
        actions.children!.push(...nodes);
      };
      Object.defineProperty(actions, "className", {
        get: () => [...actions.names].join(" "),
        set: (v: string) => {
          actions.names.clear();
          for (const n of v.split(/\s+/).filter(Boolean)) {
            actions.names.add(n);
          }
        },
        configurable: true,
      });
      return actions;
    },
  };

  try {
    const actions = mountImageEmbedActions(
      image as unknown as HTMLImageElement,
      host as unknown as HTMLElement,
      inspect as unknown as HTMLButtonElement,
    );
    assert.equal(createdTag, "div");
    assert.ok(host.classList.contains(IMAGE_EMBED));
    assert.ok(inspect.classList.contains("embed-action"));
    assert.ok(inspect.classList.contains("inspect-image"));
    assert.equal(actions.className, "embed-actions");
    assert.equal(placed.length, 1);
    assert.equal(placed[0], actions);
    assert.deepEqual(actions.children, [inspect]);
  } finally {
    (globalThis as { document: unknown }).document = prev;
  }
});
