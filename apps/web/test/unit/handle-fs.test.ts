// A vault in a folder handle hands a file over as the browser's own File,
// which is read from disk only as far as it is used (a video's ranges).
import test from "node:test";
import assert from "node:assert/strict";
import { HandleFileSystem } from "../../src/handle-fs";

type Tree = { readonly [name: string]: File | Tree };

/** A folder handle over `tree`, as far as reading needs one. */
function folder(tree: Tree): FileSystemDirectoryHandle {
  const missing = () =>
    Promise.reject(new DOMException("Not found", "NotFoundError"));
  return {
    getDirectoryHandle: (name: string) => {
      const entry = tree[name];
      return entry && !(entry instanceof File)
        ? Promise.resolve(folder(entry))
        : missing();
    },
    getFileHandle: (name: string) => {
      const entry = tree[name];
      return entry instanceof File
        ? Promise.resolve({ getFile: async () => entry })
        : missing();
    },
  } as unknown as FileSystemDirectoryHandle;
}

test("a file is handed over as its File, not read", async () => {
  const clip = new File([new Uint8Array(1000)], "clip.webm");
  const vault = new HandleFileSystem(
    folder({ attachments: { "clip.webm": clip } }),
  );
  assert.equal(await vault.readBlob("attachments/clip.webm"), clip);
  await assert.rejects(vault.readBlob("attachments/other.webm"), {
    code: "FileNotFound",
  });
  await assert.rejects(vault.readBlob("elsewhere/clip.webm"), {
    code: "FileNotFound",
  });
});
