import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { test } from "node:test";
import type * as vscode from "vscode";
import type { RealPaths } from "@workshop/platform";
// Types only: the module itself must load after the resolver below.
import type * as Containment from "../../src/extension/plugins/pdf/native-link-containment";
import { FileType, Uri, files } from "./support/containment-vscode-fake";

const resolver = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...rest) {
  return request === "vscode"
    ? path.join(import.meta.dirname, "support/containment-vscode-fake.ts")
    : resolve.call(this, request, ...rest);
};

/** Loaded after the resolver above points `vscode` at the fake. */
async function containedLink(
  ...args: Parameters<typeof Containment.containedLink>
): Promise<void> {
  const { containedLink } =
    await import("../../src/extension/plugins/pdf/native-link-containment");
  return containedLink(...args);
}
const uri = (scheme: string, file: string) =>
  new Uri(scheme, "", file) as unknown as vscode.Uri;

test("local files on the desktop are judged by their real paths", async () => {
  const asked: [string, string][] = [];
  const realPaths: RealPaths = {
    async isInside(root, target) {
      asked.push([root, target]);
      return target.startsWith(root);
    },
  };
  await containedLink(
    uri("file", "/vault"),
    uri("file", "/vault/paper.pdf"),
    realPaths,
  );
  await assert.rejects(
    containedLink(uri("file", "/vault"), uri("file", "/other.pdf"), realPaths),
    /escapes workspace folder/,
  );
  assert.deepEqual(asked, [
    ["/vault", "/vault/paper.pdf"],
    ["/vault", "/other.pdf"],
  ]);
});

for (const scheme of ["file", "vscode-vfs"]) {
  test(`without real paths, ${scheme}: links stay inside and pass no symbolic link`, async () => {
    files.clear();
    files.set("/vault/papers", FileType.Directory);
    files.set("/vault/papers/a.pdf", FileType.File);
    files.set("/vault/linked", FileType.Directory | FileType.SymbolicLink);
    const root = uri(scheme, "/vault");
    await containedLink(root, uri(scheme, "/vault/papers/a.pdf"), undefined);
    // A file that does not exist yet is judged by its path.
    await containedLink(root, uri(scheme, "/vault/papers/new.pdf"), undefined);
    await assert.rejects(
      containedLink(root, uri(scheme, "/vault/../secret.pdf"), undefined),
      /escapes workspace folder/,
    );
    await assert.rejects(
      containedLink(root, uri(scheme, "/vault/linked/a.pdf"), undefined),
      /Symbolic link refused/,
    );
  });
}

test("a link to another file system is refused", async () => {
  await assert.rejects(
    containedLink(
      uri("file", "/vault"),
      uri("vscode-vfs", "/vault/a.pdf"),
      undefined,
    ),
    /Local workspace links only/,
  );
});
