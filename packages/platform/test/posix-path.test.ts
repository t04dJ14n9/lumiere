import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  isAbsoluteFilePath,
  isInsidePosixPath,
  posixBasename,
  posixDirname,
  posixExtname,
  relativePosixPath,
} from "../src/posix-path";

const PATHS = [
  "",
  "/",
  "//",
  "///",
  "a",
  "a/",
  "a/b",
  "/a",
  "/a/",
  "/a/b",
  "/a/b/",
  "/a//b",
  "/a//",
  "//a",
  "///a",
  "/a/./b",
  "/a/../b",
  "/notes/My Note.md",
  "/notes/archive.tar.gz",
  "/notes/.bashrc",
  "/notes/.",
  "/notes/..",
  "/notes/...",
  "/notes/a.",
  "/notes/a..",
  "/notes/.a.",
  "/notes/..a",
  "/c:/Users/x/paper.pdf",
];

test("basename, dirname and extname match path.posix", () => {
  for (const value of PATHS) {
    assert.equal(posixBasename(value), path.posix.basename(value), value);
    assert.equal(posixDirname(value), path.posix.dirname(value), value);
    assert.equal(posixExtname(value), path.posix.extname(value), value);
  }
});

test("containment matches path.posix.relative not leaving the root", () => {
  const roots = ["/", "/vault", "/vault/", "/vault/sub", "/a/./vault/../vault"];
  const targets = [
    "/",
    "/vault",
    "/vault/",
    "/vault/a.md",
    "/vault/sub/b.md",
    "/vault/../other/a.md",
    "/vault/./a.md",
    "/vault/..a.md",
    "/vault-other/a.md",
    "/vaultx",
    "/vault/sub/../../x",
    "/vault/sub/../x",
    "/../vault/a.md",
  ];
  for (const root of roots) {
    for (const target of targets) {
      const relative = path.posix.relative(root, target);
      assert.equal(relativePosixPath(root, target), relative);
      const expected = !(
        relative === ".." ||
        relative.startsWith("../") ||
        path.posix.isAbsolute(relative)
      );
      assert.equal(
        isInsidePosixPath(root, target),
        expected,
        `${root} ⊇ ${target}`,
      );
    }
  }
});

test("absolute paths follow the platform's rules", () => {
  const values = [
    "",
    "/a",
    "a",
    "./a",
    "C:\\a",
    "C:/a",
    "c:a",
    "C:",
    "\\\\server\\share",
    "\\a",
    "1:\\a",
  ];
  for (const value of values) {
    assert.equal(
      isAbsoluteFilePath(value, "win32"),
      path.win32.isAbsolute(value),
      value,
    );
    assert.equal(
      isAbsoluteFilePath(value, "darwin"),
      path.posix.isAbsolute(value),
      value,
    );
  }
});
