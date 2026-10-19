/**
 * Make `import 'vscode'` load the fake (fake-vscode.ts) in unit tests. Import
 * this before anything that imports VS Code, and load those modules with
 * `await import(...)` so the alias is in place first.
 */
import Module from "node:module";
import * as path from "node:path";

const fake = path.join(import.meta.dirname, "fake-vscode.ts");
const moduleWithResolver = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolve = moduleWithResolver._resolveFilename;
moduleWithResolver._resolveFilename = function (
  request: string,
  ...rest: unknown[]
) {
  return request === "vscode" ? fake : resolve.call(this, request, ...rest);
};
