import test from "node:test";
import assert from "node:assert/strict";
import { dshPalette, readDshTheme } from "../../src/client/theme";

test("DSH's tokens fill every palette role", () => {
  const palette = dshPalette((name) => `dsh:${name}`, true, "DSH Sans");
  assert.equal(palette.background, "dsh:bg-base");
  assert.equal(palette.accent, "dsh:link");
  assert.equal(palette.dark, true);
  for (const [role, value] of Object.entries(palette)) {
    assert.ok(value !== "", `${role} is empty`);
  }
});

test("readDshTheme detects data-ds-dark-theme on either documentElement or body", () => {
  const prevDocument = globalThis.document;
  const prevGetComputedStyle = globalThis.getComputedStyle;
  try {
    let htmlDark = true;
    let bodyDark = false;
    globalThis.document = {
      documentElement: {
        hasAttribute: (attr: string) =>
          attr === "data-ds-dark-theme" && htmlDark,
      },
      body: {
        hasAttribute: (attr: string) =>
          attr === "data-ds-dark-theme" && bodyDark,
      },
    } as unknown as Document;
    globalThis.getComputedStyle = (() => ({
      fontFamily: "DSH Sans",
      getPropertyValue: () => "",
    })) as unknown as typeof getComputedStyle;

    assert.equal(readDshTheme().dark, true);

    htmlDark = false;
    bodyDark = true;
    assert.equal(readDshTheme().dark, true);

    htmlDark = false;
    bodyDark = false;
    assert.equal(readDshTheme().dark, false);
  } finally {
    globalThis.document = prevDocument;
    globalThis.getComputedStyle = prevGetComputedStyle;
  }
});
