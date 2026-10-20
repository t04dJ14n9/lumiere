import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { IMAGE_EMBED } from "./embed-actions";
import {
  editImage,
  editingImage,
  escapeImage,
  inspectButtonBesideImage,
  selectedImage,
  selectImage,
} from "./image-selection";

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

test("Escape while editing image source clears edit and re-selects the embed", () => {
  const doc = "before ![[pic.png]] after";
  const range = { from: 7, to: 19 };
  let state = EditorState.create({
    doc,
    selection: { anchor: range.from + 3 },
    extensions: [selectedImage, editingImage],
  });
  state = state.update({
    effects: [editImage.of(range), selectImage.of(null)],
  }).state;
  assert.deepEqual(state.field(editingImage), range);
  assert.equal(state.field(selectedImage), null);

  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;

  assert.equal(escapeImage(view), true);
  assert.equal(state.field(editingImage), null);
  assert.deepEqual(state.field(selectedImage), range);
  assert.equal(state.selection.main.head, range.from);
});

test("Escape on a selected image clears the outline", () => {
  const doc = "![[pic.png]]";
  const range = { from: 0, to: 12 };
  let state = EditorState.create({
    doc,
    selection: { anchor: 0 },
    extensions: [selectedImage, editingImage],
  });
  state = state.update({ effects: selectImage.of(range) }).state;

  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;

  assert.equal(escapeImage(view), true);
  assert.equal(state.field(selectedImage), null);
});
