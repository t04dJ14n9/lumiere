import test from "node:test";
import assert from "node:assert/strict";
import { openedVaultTarget } from "./target";
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
