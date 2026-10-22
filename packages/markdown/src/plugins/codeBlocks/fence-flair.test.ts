import assert from "node:assert/strict";
import test from "node:test";
import { FENCE_HOVERED, fenceOpenLine, setFenceHover } from "./fence-flair";

class FakeClassList {
  constructor(private readonly names: Set<string>) {}
  contains(name: string): boolean {
    return this.names.has(name);
  }
  add(name: string): void {
    this.names.add(name);
  }
  remove(name: string): void {
    this.names.delete(name);
  }
}

type FakeLine = {
  classList: FakeClassList;
  previousElementSibling: FakeLine | null;
  closest(selector: string): FakeLine | null;
};

function line(classes: string, previous: FakeLine | null = null): FakeLine {
  const names = new Set(classes.split(/\s+/).filter(Boolean));
  names.add("cm-line");
  const el: FakeLine = {
    classList: new FakeClassList(names),
    previousElementSibling: previous,
    closest(selector: string) {
      return selector === ".cm-line" ? el : null;
    },
  };
  return el;
}

const asElement = (el: FakeLine | null) => el as unknown as Element | null;

test("fenceOpenLine walks up code lines to the opening fence", () => {
  const open = line("md-code-line md-code-fence md-code-fence-open");
  const body = line("md-code-line", open);
  const close = line("md-code-line md-code-fence md-code-fence-close", body);
  assert.equal(fenceOpenLine(asElement(open)), open);
  assert.equal(fenceOpenLine(asElement(body)), open);
  assert.equal(fenceOpenLine(asElement(close)), open);
});

test("fenceOpenLine ignores indented code and plain lines", () => {
  const plain = line("");
  const indented = line("md-code-line md-code-indented", plain);
  assert.equal(fenceOpenLine(asElement(plain)), null);
  assert.equal(fenceOpenLine(asElement(indented)), null);
  assert.equal(fenceOpenLine(null), null);
});

test("setFenceHover marks only the active opening fence", () => {
  const openA = line("md-code-line md-code-fence md-code-fence-open");
  const openB = line("md-code-line md-code-fence md-code-fence-open");
  const marked = new Set<FakeLine>();
  const root = {
    querySelectorAll(selector: string) {
      assert.equal(selector, `.md-code-fence-open.${FENCE_HOVERED}`);
      return [...marked] as unknown as NodeListOf<Element>;
    },
  } as ParentNode;
  for (const open of [openA, openB]) {
    const list = open.classList;
    const add = list.add.bind(list);
    const remove = list.remove.bind(list);
    list.add = (name: string) => {
      add(name);
      if (name === FENCE_HOVERED) {
        marked.add(open);
      }
    };
    list.remove = (name: string) => {
      remove(name);
      if (name === FENCE_HOVERED) {
        marked.delete(open);
      }
    };
  }
  setFenceHover(root, asElement(openA) as HTMLElement);
  assert.ok(openA.classList.contains(FENCE_HOVERED));
  assert.ok(!openB.classList.contains(FENCE_HOVERED));
  setFenceHover(root, asElement(openB) as HTMLElement);
  assert.ok(!openA.classList.contains(FENCE_HOVERED));
  assert.ok(openB.classList.contains(FENCE_HOVERED));
  setFenceHover(root, null);
  assert.ok(!openA.classList.contains(FENCE_HOVERED));
  assert.ok(!openB.classList.contains(FENCE_HOVERED));
});
