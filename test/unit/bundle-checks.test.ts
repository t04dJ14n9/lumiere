import test from "node:test";
import assert from "node:assert/strict";
import { keepsBasenameCreate } from "../../scripts/bundle-checks.mjs";

test("the basename create path is found in the readable build and the minified one", () => {
  // `pnpm build`, as `pnpm test:vscode` builds it.
  assert.ok(
    keepsBasenameCreate(
      "      create: request2.wiki || mayCreateNote(path13),",
    ),
  );
  // `pnpm package`.
  assert.ok(keepsBasenameCreate("{create:e.wiki||Wt(n)}"));
  assert.ok(keepsBasenameCreate("{create:$e.wiki||Wt(n)}"));
});

test("a build without it is caught", () => {
  assert.equal(keepsBasenameCreate("create: true, wiki: false"), false);
  assert.equal(keepsBasenameCreate(""), false);
});
