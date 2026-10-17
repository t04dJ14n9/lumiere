// Serves the built viewer and the fixture PDFs to the browser tests.
//   /                      harness.html, which stands in for VS Code
//   /dist/webview/<file>   the built viewer
//   /fixtures/<file>.pdf   test/fixtures/generated
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
);
const port = Number(process.env.PORT ?? 8990);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".map": "application/json",
};

function resolve(url) {
  const pathname = decodeURIComponent(
    new URL(url, "http://localhost").pathname,
  );
  if (pathname === "/") {
    return path.join(root, "test/browser/harness.html");
  }
  if (pathname.startsWith("/dist/webview/")) {
    return path.join(root, pathname);
  }
  if (pathname.startsWith("/fixtures/")) {
    return path.join(
      root,
      "test/fixtures/generated",
      pathname.slice("/fixtures/".length),
    );
  }
  return undefined;
}

createServer((request, response) => {
  const file = resolve(request.url ?? "/");
  if (!file || !file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-type": types[path.extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(response);
}).listen(port, () =>
  console.log(`Viewer test server on http://localhost:${port}`),
);
