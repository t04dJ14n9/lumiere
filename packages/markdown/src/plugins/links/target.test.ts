import test from "node:test";
import assert from "node:assert/strict";
import { mayCreateNote, openedVaultTarget } from "./target";
import type { VaultFile, VaultIndex } from "../vault/api";

const file = {
  path: "bundle/metrics/topic.md",
  uri: "file:///vault/bundle/metrics/topic.md",
} as VaultFile;

test("an explicit markdown miss does not fall through to another file", () => {
  let resolved = false;
  const target = openedVaultTarget(
    {
      classifyLink: () => ({ status: "unresolved" }),
      resolveLink: () => {
        resolved = true;
        return file;
      },
      file: () => file,
    } as unknown as Pick<VaultIndex, "classifyLink" | "resolveLink" | "file">,
    "metrics/topic",
    "bundle/notes/source.md",
    false,
  );
  assert.deepEqual(target, { uri: undefined, passthrough: false });
  assert.equal(resolved, false);
});

test("a resolved markdown link opens the policy file", () => {
  const target = openedVaultTarget(
    {
      classifyLink: () => ({ status: "resolved", path: file.path }),
      resolveLink: () => undefined,
      file: () => file,
    } as unknown as Pick<VaultIndex, "classifyLink" | "resolveLink" | "file">,
    "/metrics/topic",
    "bundle/notes/source.md",
    false,
  );
  assert.deepEqual(target, { uri: file.uri, passthrough: false });
});

test("a wikilink still uses vault resolution when no policy claims it", () => {
  const target = openedVaultTarget(
    {
      classifyLink: () => undefined,
      resolveLink: () => file,
      file: () => undefined,
    } as unknown as Pick<VaultIndex, "classifyLink" | "resolveLink" | "file">,
    "topic.md",
    "bundle/notes/source.md",
    true,
  );
  assert.deepEqual(target, { uri: file.uri, passthrough: true });
});

test("unclaimed markdown does not use wikilink lookup outside OKF", () => {
  let resolved = false;
  const target = openedVaultTarget(
    {
      classifyLink: () => undefined,
      resolveLink: () => {
        resolved = true;
        return file;
      },
      file: () => undefined,
    } as unknown as Pick<VaultIndex, "classifyLink" | "resolveLink" | "file">,
    "topic.md",
    "notes/source.md",
    false,
  );
  assert.deepEqual(target, { uri: undefined, passthrough: true });
  assert.equal(resolved, false);
});

test("mayCreateNote allows basename notes only", () => {
  assert.equal(mayCreateNote("Missing"), true);
  assert.equal(mayCreateNote("Missing.md"), true);
  assert.equal(mayCreateNote("Missing.markdown"), true);
  assert.equal(mayCreateNote("folder/Missing"), false);
  assert.equal(mayCreateNote("./Missing"), false);
  assert.equal(mayCreateNote("../Missing"), false);
  assert.equal(mayCreateNote("photo.png"), false);
  assert.equal(mayCreateNote(""), false);
  assert.equal(mayCreateNote("."), false);
});
