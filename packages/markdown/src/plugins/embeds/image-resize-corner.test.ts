import test from "node:test";
import assert from "node:assert/strict";
import { setImageSelectedChrome } from "./image-resize-corner";

type Stub = {
  classList: {
    add(n: string): void;
    remove(n: string): void;
    contains(n: string): boolean;
  };
  names: Set<string>;
  remove?: () => void;
  setAttribute?: (n: string, v: string) => void;
  attrs?: Record<string, string>;
  parentElement?: Stub | null;
  after?: (n: Stub) => void;
  children?: Stub[];
  querySelector?: (sel: string) => Stub | null;
  isImg?: boolean;
};

function el(initial: string[] = [], opts: Partial<Stub> = {}): Stub {
  const names = new Set(initial);
  const stub: Stub = {
    names,
    classList: {
      add: (n) => {
        names.add(n);
      },
      remove: (n) => {
        names.delete(n);
      },
      contains: (n) => names.has(n),
    },
    ...opts,
  };
  return stub;
}

function installDocument(onCreate: (corner: Stub) => void): () => void {
  const prev = globalThis.document;
  (globalThis as { document: unknown }).document = {
    createElement(tag: string) {
      assert.equal(tag, "span");
      const corner = el();
      corner.attrs = {};
      corner.setAttribute = (n, v) => {
        corner.attrs![n] = v;
      };
      Object.defineProperty(corner, "className", {
        get: () => [...corner.names].join(" "),
        set: (v: string) => {
          corner.names.clear();
          for (const n of v.split(/\s+/).filter(Boolean)) {
            corner.names.add(n);
          }
        },
        configurable: true,
      });
      onCreate(corner);
      return corner;
    },
  };
  return () => {
    (globalThis as { document: unknown }).document = prev;
  };
}

test("select adds image-embed host + one aria-hidden corner; deselect clears both", () => {
  const kids: Stub[] = [];
  const host = el(["file-embed"], {
    get children() {
      return kids;
    },
    querySelector(sel: string) {
      if (sel === "img.md-image-selected") {
        return (
          kids.find(
            (c) => c.isImg && c.classList.contains("md-image-selected"),
          ) ?? null
        );
      }
      return null;
    },
  } as Partial<Stub>);
  // Re-bind getters onto host (spread lost them)
  Object.defineProperty(host, "children", { get: () => kids });
  host.querySelector = (sel: string) => {
    if (sel === "img.md-image-selected") {
      return (
        kids.find(
          (c) => c.isImg && c.classList.contains("md-image-selected"),
        ) ?? null
      );
    }
    return null;
  };

  const image = el([], {
    isImg: true,
    parentElement: host,
    after(node: Stub) {
      kids.push(node);
    },
  });
  kids.push(image);

  let created: Stub | undefined;
  const restore = installDocument((corner) => {
    created = corner;
    corner.remove = () => {
      const i = kids.indexOf(corner);
      if (i >= 0) {
        kids.splice(i, 1);
      }
    };
  });

  try {
    setImageSelectedChrome(image as unknown as HTMLImageElement, true);
    assert.ok(image.classList.contains("md-image-selected"));
    assert.ok(host.classList.contains("image-embed"));
    assert.ok(created);
    assert.equal([...created!.names].join(" "), "image-resize-corner");
    assert.equal(created!.attrs!["aria-hidden"], "true");
    assert.equal(kids.filter((c) => c !== image).length, 1);

    setImageSelectedChrome(image as unknown as HTMLImageElement, false);
    assert.ok(!image.classList.contains("md-image-selected"));
    assert.ok(!host.classList.contains("image-embed"));
    assert.ok(host.classList.contains("file-embed"));
    assert.equal(kids.filter((c) => c !== image).length, 0);
  } finally {
    restore();
  }
});

test("select is idempotent: a second mark does not add another corner", () => {
  const kids: Stub[] = [];
  const host = el(["image-embed"], {});
  Object.defineProperty(host, "children", { get: () => kids });
  host.querySelector = () => null;

  const image = el([], {
    parentElement: host,
    after(node: Stub) {
      kids.push(node);
    },
  });

  const restore = installDocument((corner) => {
    corner.remove = () => {
      const i = kids.indexOf(corner);
      if (i >= 0) {
        kids.splice(i, 1);
      }
    };
  });
  try {
    setImageSelectedChrome(image as unknown as HTMLImageElement, true);
    setImageSelectedChrome(image as unknown as HTMLImageElement, true);
    assert.equal(kids.length, 1);
    // Pre-existing image-embed was not tagged by us — deselect must keep it
    setImageSelectedChrome(image as unknown as HTMLImageElement, false);
    assert.ok(host.classList.contains("image-embed"));
  } finally {
    restore();
  }
});
