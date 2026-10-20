import test from "node:test";
import assert from "node:assert/strict";

/** Just enough DOM for building the popup. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  type = "";
  onclick: (() => void) | null = null;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  constructor(readonly tagName: string) {}
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

test("the link preview is a card with icon actions in its corner", async () => {
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => new FakeElement(tag),
  };
  const { createPreviewPopup } = await import("./popup");
  let opened = 0;
  const { popup, body, open } = createPreviewPopup({
    href: "Project%20plan",
    open: () => opened++,
    close: () => undefined,
  }) as unknown as {
    popup: FakeElement;
    body: FakeElement;
    open: FakeElement;
  };
  assert.equal(popup.className, "link-preview popover hover-popover");
  const [toolbar] = popup.children;
  assert.equal(toolbar?.className, "link-preview-actions");
  assert.deepEqual(
    toolbar?.children.map((button) => [
      button.textContent,
      button.attributes.get("aria-label"),
    ]),
    [
      ["↗", "Open Project plan"],
      ["×", "Close link preview"],
    ],
  );
  open.onclick?.();
  assert.equal(opened, 1);
  assert.equal(body.className, "link-preview-body");
  delete (globalThis as { document?: unknown }).document;
});

test("setPreviewBody toggles Obsidian mod-empty for unavailable previews", async () => {
  class Body {
    className = "link-preview-body";
    textContent = "";
    readonly classList = {
      toggle: (name: string, force?: boolean) => {
        const on = force ?? !this.className.split(/\s+/).includes(name);
        const parts = this.className.split(/\s+/).filter(Boolean);
        const next = on
          ? [...new Set([...parts, name])]
          : parts.filter((part) => part !== name);
        this.className = next.join(" ");
      },
    };
    replaceChildren(): void {
      this.textContent = "";
    }
  }
  const { setPreviewBody } = await import("./popup");
  const body = new Body() as unknown as HTMLElement;
  setPreviewBody(body, "Loading…", "loading");
  assert.equal(body.textContent, "Loading…");
  assert.doesNotMatch(body.className, /\bmod-empty\b/);
  setPreviewBody(body, "No preview available", "empty");
  assert.equal(body.textContent, "No preview available");
  assert.match(body.className, /\bmod-empty\b/);
  setPreviewBody(body, "", "ready");
  assert.doesNotMatch(body.className, /\bmod-empty\b/);
});
