import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const embedsCss = readFileSync(
  new URL("../../../src/plugins/embeds/embeds.css", import.meta.url),
  "utf8",
);

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is styled`);
  return css.slice(start, css.indexOf("}", start));
}

test("image embeds get Obsidian embed-actions frosted chrome with VS Code tokens", () => {
  const host = rule(embedsCss, ".image-embed");
  assert.match(host, /position:\s*relative/);

  const actions = rule(embedsCss, ".image-embed .embed-actions");
  assert.match(actions, /position:\s*absolute/);
  assert.match(actions, /inset-inline-end:\s*8px/);
  assert.match(actions, /opacity:\s*0/);
  assert.match(actions, /backdrop-filter:\s*blur/);
  assert.match(actions, /box-shadow:/);
  assert.match(actions, /var\(--vscode-editor-background/);

  const action = rule(embedsCss, ".image-embed .embed-action");
  assert.match(action, /var\(--vscode-editor-foreground/);

  const selected = rule(
    embedsCss,
    ".image-embed:has(img.md-image-selected) .embed-actions,\n.image-embed .embed-action:focus-visible,\n.markdown-rendered .image-embed:hover .embed-actions",
  );
  assert.match(selected, /opacity:\s*1/);

  // Legacy floating inspect opacity rules are gone — chrome owns visibility.
  assert.doesNotMatch(embedsCss, /\.file-embed:hover \.inspect-image/);
});

import { enhanceEmbeds } from "../../../src/plugins/embeds/post-process";
import type {
  RenderPass,
  RenderService,
} from "../../../src/plugins/render/api";
import type { Resource, Resources } from "../../../src/plugins/resources/api";

test("enhanceEmbeds mounts data/http and cached vault images synchronously without loading=lazy", async () => {
  const prevDoc = globalThis.document;
  const prevImg = globalThis.HTMLImageElement;
  class FakeElement {
    tagName = "SPAN";
    dataset: Record<string, string> = {};
    className = "";
    title = "";
    textContent = "";
    innerHTML = "";
    src = "";
    alt = "";
    decoding = "";
    loading?: string;
    width = 0;
    height = 0;
    children: FakeElement[] = [];
    attrs = new Map<string, string>();
    classList = {
      classes: new Set<string>(),
      add: (...tokens: string[]) =>
        tokens.forEach((t) => this.classList.classes.add(t)),
      contains: (token: string) => this.classList.classes.has(token),
    };
    getAttribute(name: string): string | null {
      return this.attrs.get(name) ?? null;
    }
    setAttribute(name: string, value: string): void {
      this.attrs.set(name, value);
    }
    removeAttribute(name: string): void {
      this.attrs.delete(name);
      if (name === "loading") {
        delete this.loading;
      }
    }
    addEventListener(): void {}
    replaceChildren(...nodes: FakeElement[]): void {
      this.children = [...nodes];
    }
    append(...nodes: FakeElement[]): void {
      this.children.push(...nodes);
    }
    replaceWith(): void {}
    after(): void {}
    remove(): void {}
  }
  class FakeImageElement extends FakeElement {
    override tagName = "IMG";
  }
  (
    globalThis as unknown as { HTMLImageElement: typeof FakeImageElement }
  ).HTMLImageElement = FakeImageElement;
  (globalThis as unknown as { document: unknown }).document = {
    createElement(tag: string) {
      return tag.toLowerCase() === "img"
        ? new FakeImageElement()
        : new FakeElement();
    },
  };

  try {
    let loads = 0;
    const resources: Resources = {
      async load(target: string): Promise<Resource> {
        loads++;
        return {
          kind: "image",
          source: target,
          url: `vscode-webview-resource://vault/${target}`,
        };
      },
    };
    const render = { trusted: true } as unknown as RenderService;

    // 1. Remote https image mounts synchronously in enhanceEmbeds (0 microtasks).
    const remoteNode = new FakeElement();
    remoteNode.dataset = {
      resource: "https://example.com/diagram.png",
      wiki: "true",
    };
    let measured = 0;
    const makePass = (nodes: FakeElement[]): RenderPass =>
      ({
        source: "",
        sourceLine: 0,
        ancestry: [],
        renderKey: "",
        documentUri: "notes/test.md",
        container: {
          querySelectorAll: () => nodes,
        } as unknown as HTMLElement,
        measure: () => {
          measured++;
        },
        onDispose: () => {},
        dispose: async () => {},
      }) as RenderPass;

    enhanceEmbeds({
      pass: makePass([remoteNode]),
      render,
      resources,
      open: () => {},
    });
    const mountedRemote = remoteNode.children.find((c) => c.tagName === "IMG");
    assert.ok(
      mountedRemote,
      "remote image should be mounted synchronously before microtasks",
    );
    assert.equal(mountedRemote.src, "https://example.com/diagram.png");
    assert.equal(mountedRemote.decoding, "async");
    assert.equal(mountedRemote.loading, undefined);
    assert.equal(measured, 1);

    // 2. Vault image: first pass resolves via async load(), second pass mounts synchronously from cache!
    const firstVaultNode = new FakeElement();
    firstVaultNode.dataset = { resource: "assets/chart.png", wiki: "true" };
    enhanceEmbeds({
      pass: makePass([firstVaultNode]),
      render,
      resources,
      open: () => {},
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(loads, 1);
    assert.ok(firstVaultNode.children.some((c) => c.tagName === "IMG"));

    const secondVaultNode = new FakeElement();
    secondVaultNode.dataset = { resource: "assets/chart.png", wiki: "true" };
    enhanceEmbeds({
      pass: makePass([secondVaultNode]),
      render,
      resources,
      open: () => {},
    });
    // Synchronous check (before any await/microtask):
    const mountedCached = secondVaultNode.children.find(
      (c) => c.tagName === "IMG",
    );
    assert.ok(
      mountedCached,
      "cached vault image must mount synchronously during start()",
    );
    assert.equal(
      mountedCached.src,
      "vscode-webview-resource://vault/assets/chart.png",
    );
    assert.equal(
      loads,
      1,
      "cached vault image must not trigger a second RPC load",
    );
  } finally {
    (globalThis as unknown as { document: unknown }).document = prevDoc;
    (globalThis as unknown as { HTMLImageElement: unknown }).HTMLImageElement =
      prevImg;
  }
});
