import test from "node:test";
import assert from "node:assert/strict";
import { enhanceEmbeds } from "../../../src/plugins/embeds/post-process";
import type {
  RenderPass,
  RenderService,
} from "../../../src/plugins/render/api";
import type { Resource, Resources } from "../../../src/plugins/resources/api";

/** As much of an element as an image embed touches. */
class FakeElement {
  tagName = "SPAN";
  dataset: Record<string, string> = {};
  className = "";
  title = "";
  textContent = "";
  innerHTML = "";
  type = "";
  src = "";
  alt = "";
  decoding = "";
  width = 0;
  height = 0;
  children: FakeElement[] = [];
  private readonly classes = new Set<string>();
  private readonly attributes = new Map<string, string>();
  classList = {
    add: (...tokens: string[]) => tokens.forEach((t) => this.classes.add(t)),
    remove: (...tokens: string[]) =>
      tokens.forEach((t) => this.classes.delete(t)),
    contains: (token: string) => this.classes.has(token),
  };
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  replaceChildren(...nodes: FakeElement[]): void {
    this.children = [...nodes];
  }
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  after(): void {}
  replaceWith(): void {}
  remove(): void {}
}

class FakeImageElement extends FakeElement {
  override tagName = "IMG";
}

function installFakeDom(): () => void {
  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = {
    document: globals.document,
    HTMLImageElement: globals.HTMLImageElement,
  };
  globals.HTMLImageElement = FakeImageElement;
  globals.document = {
    createElement: (tag: string) =>
      tag === "img" ? new FakeImageElement() : new FakeElement(),
  };
  return () => Object.assign(globals, saved);
}

function passOf(nodes: FakeElement[]): RenderPass {
  return {
    source: "",
    sourceLine: 0,
    ancestry: [],
    renderKey: "",
    documentUri: "file:///vault/Note.md",
    container: { querySelectorAll: () => nodes } as unknown as HTMLElement,
    measure: () => {},
    onDispose: () => {},
    dispose: async () => {},
  } as RenderPass;
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("an embed whose file was missing shows it in place once the file is there", async () => {
  const restoreDom = installFakeDom();
  try {
    const arrived = new Set<string>();
    const loads: string[] = [];
    const resources: Resources = {
      async load(target: string): Promise<Resource> {
        loads.push(target);
        if (!arrived.has(target)) {
          throw new Error("Resource not found");
        }
        const source = `file:///vault/${target}`;
        return { kind: "image", source, url: `${source}?v=1` };
      },
    };
    const sketch = new FakeElement();
    sketch.dataset = { resource: "Sketch.sketch.svg", wiki: "true" };
    const photo = new FakeImageElement();
    photo.dataset = { resource: "photo.png" };
    photo.title = "The plan";
    const embeds = enhanceEmbeds({
      pass: passOf([sketch, photo]),
      render: { trusted: true } as unknown as RenderService,
      resources,
      open: () => {},
    });
    await settled();
    assert.ok(sketch.classList.contains("unresolved-embed"));
    assert.equal(sketch.textContent, '"Sketch.sketch.svg" could not be found.');
    assert.ok(photo.classList.contains("unresolved-embed"));

    arrived.add("Sketch.sketch.svg");
    embeds.retryMissing();
    await settled();
    assert.deepEqual(loads.splice(0), [
      "Sketch.sketch.svg",
      "photo.png",
      "Sketch.sketch.svg",
      "photo.png",
    ]);
    assert.equal(sketch.classList.contains("unresolved-embed"), false);
    assert.equal(sketch.title, "");
    assert.equal(
      sketch.children.find((child) => child.tagName === "IMG")?.src,
      "file:///vault/Sketch.sketch.svg?v=1",
    );
    assert.ok(photo.classList.contains("unresolved-embed"), "still missing");

    arrived.add("photo.png");
    embeds.retryMissing();
    await settled();
    assert.deepEqual(loads.splice(0), ["photo.png"], "only what was missing");
    assert.equal(photo.classList.contains("unresolved-embed"), false);
    assert.equal(photo.title, "The plan", "its own title, not the error");
    assert.equal(photo.src, "file:///vault/photo.png?v=1");

    embeds.retryMissing();
    await settled();
    assert.deepEqual(loads, []);
    embeds.dispose();
  } finally {
    restoreDom();
  }
});
