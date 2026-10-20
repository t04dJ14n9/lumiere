import test from "node:test";
import assert from "node:assert/strict";
import { tagUnresolvedAnchors } from "./tag-unresolved-anchors";

function anchor(href: string, cls = ""): HTMLAnchorElement {
  const names = new Set(cls.split(/\s+/).filter(Boolean));
  const el = {
    href,
    attrs: { href } as Record<string, string>,
    classList: {
      add: (n: string) => {
        names.add(n);
      },
      remove: (n: string) => {
        names.delete(n);
      },
      toggle: (n: string, force?: boolean) => {
        if (force === undefined) {
          if (names.has(n)) {
            names.delete(n);
          } else {
            names.add(n);
          }
          return;
        }
        if (force) {
          names.add(n);
        } else {
          names.delete(n);
        }
      },
      contains: (n: string) => names.has(n),
      get value() {
        return [...names].join(" ");
      },
    },
    getAttribute(name: string) {
      return this.attrs[name] ?? null;
    },
  };
  return el as unknown as HTMLAnchorElement;
}

test("tagUnresolvedAnchors dims vault misses and clears externals", () => {
  const missing = anchor("Missing");
  const wiki = anchor("Gone", "internal-link");
  const ok = anchor("Here");
  const external = anchor("https://example.com", "is-unresolved");
  const root = {
    querySelectorAll: () => [missing, wiki, ok, external],
  } as unknown as ParentNode;

  tagUnresolvedAnchors(root, new Set(["missing", "gone"]));

  assert.ok(missing.classList.contains("is-unresolved"));
  assert.ok(wiki.classList.contains("is-unresolved"));
  assert.ok(!ok.classList.contains("is-unresolved"));
  assert.ok(!external.classList.contains("is-unresolved"));
});
