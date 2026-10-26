// On a touch screen WebKit treats the first tap on an element as hovering
// it; if that hover reveals anything, the tap is spent on the reveal and
// never reaches the element (the iPad's "first tap does nothing"). So a
// :hover rule that shows something (opacity, visibility, display) only
// applies where there is hover: inside @media (hover: hover).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "../../src");

/** The :hover rules in `css` that reveal something outside @media (hover: hover). */
function hoverReveals(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
  const found: string[] = [];
  const heads: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      heads.push(text.slice(start, i).trim());
      start = i + 1;
    } else if (text[i] === "}") {
      const head = heads.pop() ?? "";
      const body = text.slice(start, i);
      const reveals =
        /(^|;)\s*(opacity\s*:\s*(?!0\s*(;|!|$))[\d.]+|visibility\s*:\s*visible|display\s*:\s*(?!none)\w+)/.test(
          body.trim(),
        );
      const guarded = heads.some((outer) =>
        /@media[^{]*\(\s*hover\s*:\s*hover\s*\)/.test(outer),
      );
      if (
        !head.startsWith("@") &&
        head.includes(":hover") &&
        reveals &&
        !guarded
      ) {
        found.push(head.replace(/\s+/g, " "));
      }
      start = i + 1;
    } else if (text[i] === ";" && heads.length === 0) {
      start = i + 1;
    }
  }
  return found;
}

test("the scan finds a hover reveal, and lets a guarded one or a colour change be", () => {
  assert.deepEqual(hoverReveals(".a:hover .b { opacity: 1; }"), [
    ".a:hover .b",
  ]);
  assert.deepEqual(
    hoverReveals("@media (hover: hover) { .a:hover .b { opacity: 1; } }"),
    [],
  );
  assert.deepEqual(
    hoverReveals(".a:hover { background: red; opacity: 0; }"),
    [],
  );
});

test("on a touch screen, hovering reveals nothing in the editor", () => {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter(
    (file) => file.endsWith(".css"),
  );
  assert.ok(files.length > 5, "the editor's stylesheets");
  const reveals = files.flatMap((file) =>
    hoverReveals(readFileSync(path.join(SRC, file), "utf8")).map(
      (selector) => `${file}: ${selector}`,
    ),
  );
  assert.deepEqual(reveals, []);
});
