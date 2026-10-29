import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createPdfRoutes, type PdfRoutes } from "../../src/host/pdf-routes";
import type { PageSocket } from "../../src/host/panel";

const PDF = "%PDF-1.4\n% a stand-in: the viewer, not the host, reads PDFs\n";

interface Fixture {
  readonly origin: string;
  readonly vault: string;
  readonly outside: string;
  readonly routes: PdfRoutes;
}

async function fixture(t: test.TestContext): Promise<Fixture> {
  const dir = await realpath(
    await mkdtemp(path.join(tmpdir(), "lumiere-pdf-")),
  );
  const vault = path.join(dir, "vault");
  const viewer = path.join(dir, "viewer");
  await mkdir(path.join(vault, "papers"), { recursive: true });
  await mkdir(viewer);
  await writeFile(path.join(vault, "papers", "A.pdf"), PDF);
  await writeFile(path.join(vault, "Note.md"), "# Note");
  await writeFile(path.join(dir, "outside.pdf"), PDF);
  await writeFile(path.join(viewer, "viewer.js"), "/* viewer */");
  const routes = createPdfRoutes({ base: "/lumiere", viewer, log: () => {} });
  const server: Server = createServer((req, res) => {
    const rest = new URL(req.url ?? "/", "http://x").pathname.slice(
      "/lumiere".length,
    );
    void routes.handle(req, res, rest).then((handled) => {
      if (!handled) {
        res.writeHead(404).end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  t.after(async () => {
    routes.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  return {
    origin: `http://127.0.0.1:${port}`,
    vault,
    outside: path.join(dir, "outside.pdf"),
    routes,
  };
}

function pageUrl(origin: string, file: string, root: string): string {
  const query = new URLSearchParams({ path: file, root });
  return `${origin}/lumiere/pdf?${query.toString()}`;
}

/** The page's end of its socket, as the shim would hold it. */
function fakeSocket() {
  const received: unknown[] = [];
  let deliver: (text: string) => void = () => {};
  let closed: () => void = () => {};
  const socket: PageSocket = {
    send: (text) => received.push(JSON.parse(text)),
    onMessage: (listener) => {
      deliver = listener;
      return () => {};
    },
    onClose: (listener) => {
      closed = listener;
      return () => {};
    },
    close: () => {},
  };
  return {
    socket,
    received,
    fromPage: (data: unknown) => deliver(JSON.stringify({ ch: "rpc", data })),
    close: () => closed(),
  };
}

async function until<T>(read: () => T | undefined): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out");
}

test("a PDF's page runs the viewer with the shim, and its bytes are served by load", async (t) => {
  const { origin, vault, routes } = await fixture(t);
  const response = await fetch(
    pageUrl(origin, path.join(vault, "papers", "A.pdf"), vault),
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  const id = /name="lumiere-panel" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(id, "the page names its panel for the shim");
  const nonce = /nonce="([^"]+)"/.exec(html)?.[1];
  assert.ok(
    html.includes(`<script nonce="${nonce}" src="/lumiere/page/shim.js">`),
  );
  assert.ok(
    html.indexOf("/lumiere/page/shim.js") <
      html.indexOf("/lumiere/pdf/viewer/viewer.js"),
    "the shim runs before the viewer",
  );
  assert.match(html, /data-pdfium-wasm="\/lumiere\/m\/webview\/pdfium.wasm"/);
  assert.match(html, /connect-src 'self' ws:\/\/127\.0\.0\.1:\d+/);
  assert.match(html, /data-toolbar="slim"/);

  const page = routes.page(id);
  assert.ok(page);
  const socket = fakeSocket();
  page.attach(socket.socket);
  socket.fromPage({ type: "ready" });
  const load = await until(
    () =>
      socket.received.find(
        (frame) =>
          (frame as { data?: { type?: string } }).data?.type === "load",
      ) as { ch: string; data: { load: number; url: string } } | undefined,
  );
  assert.equal(load.ch, "rpc");
  const bytes = await fetch(origin + load.data.url);
  assert.equal(bytes.status, 200);
  assert.equal(bytes.headers.get("content-type"), "application/pdf");
  assert.equal(await bytes.text(), PDF);
  const stale = new URL(origin + load.data.url);
  stale.searchParams.set("load", String(load.data.load + 1));
  assert.equal((await fetch(stale)).status, 404);

  socket.close();
  assert.equal(routes.page(id), undefined, "a closed page is dropped");
  assert.equal((await fetch(origin + load.data.url)).status, 404);
});

test("only a PDF inside its workspace opens", async (t) => {
  const { origin, vault, outside } = await fixture(t);
  const status = async (file: string, root = vault) =>
    (await fetch(pageUrl(origin, file, root))).status;
  assert.equal(await status(path.join(vault, "Note.md")), 400);
  assert.equal(await status(outside), 400, "outside the workspace");
  assert.equal(
    await status(path.join(vault, "papers", "..", "..", "outside.pdf")),
    400,
  );
  assert.equal(await status(path.join(vault, "papers", "Missing.pdf")), 403);
});

test("the viewer's files are served from its folder only", async (t) => {
  const { origin } = await fixture(t);
  const viewer = await fetch(`${origin}/lumiere/pdf/viewer/viewer.js`);
  assert.equal(viewer.status, 200);
  assert.equal(await viewer.text(), "/* viewer */");
  const escape = await fetch(
    `${origin}/lumiere/pdf/viewer/..%2F..%2Fvault%2FNote.md`,
  );
  assert.notEqual(escape.status, 200);
});
