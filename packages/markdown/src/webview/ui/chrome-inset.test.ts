import assert from "node:assert/strict";
import test from "node:test";
import { CHROME_INSET_VARIABLE, chromeInsetTop } from "./chrome-inset";

function page(value: string | undefined) {
  return {
    documentElement: {} as HTMLElement,
    defaultView: {
      getComputedStyle: () =>
        ({
          getPropertyValue: (name: string) =>
            name === CHROME_INSET_VARIABLE ? (value ?? "") : "",
        }) as CSSStyleDeclaration,
    },
  };
}

test("the embedder's controls reach as far as the page's variable says", () => {
  assert.equal(chromeInsetTop(page("84px")), 84);
  assert.equal(chromeInsetTop(page(" 60.5px")), 60.5);
});

test("with no controls over the page, or a value that is not one, nothing moves", () => {
  assert.equal(chromeInsetTop(page(undefined)), 0);
  assert.equal(chromeInsetTop(page("auto")), 0);
  assert.equal(chromeInsetTop(page("-20px")), 0);
  assert.equal(
    chromeInsetTop({ documentElement: {} as HTMLElement, defaultView: null }),
    0,
  );
});
