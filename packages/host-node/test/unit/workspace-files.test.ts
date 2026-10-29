import assert from "node:assert/strict";
import test from "node:test";
import type { HostFiles } from "../../src/host/platform";
import { createWorkspaceFiles } from "../../src/host/workspace";

/**
 * Files as host-web keeps them: `save` replaces a file and refuses a
 * missing one, as the HostFiles contract allows; `create` makes one.
 */
function strictFiles() {
  const texts = new Map<string, string>();
  const files = {
    isInside: (root: string, uri: string) => uri.startsWith(`${root}/`),
    contain: async () => {},
    uriOf: (path: string) => `file://${path}`,
    mkdir: async () => {},
    create: async (uri: string) => {
      if (!texts.has(uri)) {
        texts.set(uri, "");
      }
    },
    save: async (uri: string, text: string) => {
      if (!texts.has(uri)) {
        throw Object.assign(new Error(`${uri} does not exist`), {
          code: "FileNotFound",
        });
      }
      texts.set(uri, text);
    },
  } as unknown as HostFiles;
  return { files, texts };
}

test("writeText makes a new file where save alone only replaces one", async () => {
  const { files, texts } = strictFiles();
  const workspace = createWorkspaceFiles(files, () => ["file:///vault"]);

  await workspace.writeText("file:///vault/Sketches/new.sketch.svg", "<svg/>");
  assert.equal(texts.get("file:///vault/Sketches/new.sketch.svg"), "<svg/>");

  await workspace.writeText(
    "file:///vault/Sketches/new.sketch.svg",
    "<svg>2</svg>",
  );
  assert.equal(
    texts.get("file:///vault/Sketches/new.sketch.svg"),
    "<svg>2</svg>",
  );

  await assert.rejects(workspace.writeText("file:///elsewhere/a.md", "x"));
  assert.equal(texts.has("file:///elsewhere/a.md"), false);
});
