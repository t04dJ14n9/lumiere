import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cyclePageColors,
  DEFAULT_PAGE_COLORS,
  parsePageColors,
  resolveEffective,
  type PageColorsSetting,
  type ThemeKind,
} from "../../src/shared/page-colors";

const KINDS: { kind: ThemeKind; name: string; follow: "normal" | "dark" }[] = [
  { kind: 1, name: "Light", follow: "normal" },
  { kind: 2, name: "Dark", follow: "dark" },
  { kind: 3, name: "HighContrast", follow: "dark" },
  { kind: 4, name: "HighContrastLight", follow: "normal" },
];

test("pageColors defaults to follow", () => {
  assert.equal(DEFAULT_PAGE_COLORS, "follow");
  for (const value of [undefined, null, "", "Dark", "auto", 42]) {
    assert.equal(parsePageColors(value), "follow");
  }
  for (const setting of ["follow", "normal", "dark"] as const) {
    assert.equal(parsePageColors(setting), setting);
  }
});

test("resolveEffective maps follow to theme kind; normal and dark stay fixed", () => {
  for (const { kind, follow } of KINDS) {
    assert.equal(resolveEffective("follow", kind), follow, `follow@${kind}`);
    assert.equal(resolveEffective("normal", kind), "normal", `normal@${kind}`);
    assert.equal(resolveEffective("dark", kind), "dark", `dark@${kind}`);
  }
});

test("Follow does not change effective mode within the same light/dark bucket", () => {
  assert.equal(resolveEffective("follow", 1), resolveEffective("follow", 4));
  assert.equal(resolveEffective("follow", 2), resolveEffective("follow", 3));
});

test("cycle order is Follow → Normal → Dark → Follow", () => {
  const order: PageColorsSetting[] = [];
  let current: PageColorsSetting = "follow";
  for (let i = 0; i < 4; i++) {
    order.push(current);
    current = cyclePageColors(current);
  }
  assert.deepEqual(order, ["follow", "normal", "dark", "follow"]);
});
