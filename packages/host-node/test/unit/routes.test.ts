import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { createEditorRoutes, SOCKET_PATH } from "../../src/host/routes";
import type { LumiereHost } from "../../src/host/start";

/** A host with one panel, "p", whose page socket goes nowhere. */
function fakeHost(): LumiereHost {
  return {
    panels: {
      get: (id: string) => (id === "p" ? { id } : undefined),
      attach: () => true,
    },
    addRoot: () => {},
    stop: async () => {},
  } as unknown as LumiereHost;
}

test("closing the routes ends open page sockets, so the web server can stop", async (t) => {
  const routes = createEditorRoutes(fakeHost(), {
    markdown: "/none",
    shim: "/none",
  });
  const server = createServer((_req, res) => res.writeHead(404).end());
  server.on("upgrade", (req, socket, head) => {
    if (!routes.upgrade(req, socket, head)) {
      socket.destroy();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as { port: number };

  const page = new WebSocket(`ws://127.0.0.1:${port}${SOCKET_PATH}?panel=p`);
  await new Promise((resolve, reject) => {
    page.once("open", resolve);
    page.once("error", reject);
  });
  const pageClosed = new Promise((resolve) => page.once("close", resolve));

  routes.close();
  server.closeAllConnections();
  const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
  const deadline = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), 2000).unref(),
  );
  assert.notEqual(await Promise.race([stopped, deadline]), "timeout");
  await pageClosed;
});

test("a socket for an unknown panel or another path is not taken", async (t) => {
  const routes = createEditorRoutes(fakeHost(), {
    markdown: "/none",
    shim: "/none",
  });
  t.after(() => routes.close());
  const request = (url: string) => ({ url, headers: {} }) as never;
  assert.equal(
    routes.upgrade(
      request(`${SOCKET_PATH}?panel=nope`),
      {} as never,
      Buffer.alloc(0),
    ),
    false,
  );
  assert.equal(
    routes.upgrade(request("/other?panel=p"), {} as never, Buffer.alloc(0)),
    false,
  );
});
