import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_EMBED } from "./embed-actions";
import { inspectButtonBesideImage } from "./image-selection";

type Stub = {
  classList: { contains(n: string): boolean };
  names: Set<string>;
  parentElement: Stub | null;
  closest: (sel: string) => Stub | null;
  querySelector: (sel: string) => Stub | null;
  click?: () => void;
};

function el(initial: string[] = [], opts: Partial<Stub> = {}): Stub {
  const names = new Set(initial);
  const stub: Stub = {
    names,
    classList: {
      contains: (n) => names.has(n),
    },
    parentElement: null,
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    ...opts,
  };
  return stub;
}

test("inspect button is found on the image-embed host beside the image", () => {
  let clicked = 0;
  const inspect = el(["inspect-image", "embed-action"], {
    click() {
      clicked += 1;
    },
  });
  const host = el([IMAGE_EMBED], {
    querySelector(sel: string) {
      return sel === "button.inspect-image" ? inspect : null;
    },
  });
  const image = el([], {
    closest(sel: string) {
      return sel === `.${IMAGE_EMBED}` ? host : null;
    },
    parentElement: host,
  });

  const found = inspectButtonBesideImage(image as unknown as HTMLImageElement);
  assert.equal(found, inspect);
  found?.click();
  assert.equal(clicked, 1);
});

test("an image without an inspect control returns null", () => {
  const host = el([IMAGE_EMBED], {
    querySelector() {
      return null;
    },
  });
  const image = el([], {
    closest(sel: string) {
      return sel === `.${IMAGE_EMBED}` ? host : null;
    },
    parentElement: host,
  });
  assert.equal(
    inspectButtonBesideImage(image as unknown as HTMLImageElement),
    null,
  );
});
