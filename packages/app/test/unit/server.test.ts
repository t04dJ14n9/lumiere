// The server as the desktop app sees it: start, the token's first request,
// what a page without the token gets, the API, and stopping. The editor's
// pages need the built editor and are covered by the browser tests.
import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startServer, type RunningServer } from "../../src/server/server";
import { TOKEN_COOKIE } from "../../src/server/auth";

const TOKEN = "test-token-0123456789";
const quiet = { debug() {}, warn() {}, error() {} };

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

/** A raw request, so the Host and Origin headers are ours to set. */
function send(
  port: number,
  pathname: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method: options.method ?? "GET",
        headers: { host: `127.0.0.1:${port}`, ...options.headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

async function fixture(
  t: test.TestContext,
): Promise<{ server: RunningServer; vault: string; cookie: string }> {
  const dir = await realpath(
    await mkdtemp(path.join(tmpdir(), "lumiere-server-")),
  );
  const assets = path.join(dir, "assets");
  const vault = path.join(dir, "vault");
  await mkdir(path.join(assets, "shell"), { recursive: true });
  await mkdir(path.join(assets, "markdown"), { recursive: true });
  await mkdir(path.join(vault, "daily"), { recursive: true });
  await writeFile(
    path.join(assets, "shell", "index.html"),
    "<!doctype html><title>Lumière</title>",
  );
  await writeFile(path.join(dir, "secret.txt"), "not for pages");
  await writeFile(path.join(vault, "daily", "today.md"), "# Today");
  const server = await startServer({
    host: "127.0.0.1",
    port: 0,
    token: TOKEN,
    data: path.join(dir, "data"),
    assets,
    vaults: [vault],
    version: "0.0.0-test",
    logger: quiet,
  });
  t.after(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { server, vault, cookie: `${TOKEN_COOKIE}=${TOKEN}` };
}

test("the launch URL logs the window in once, then the cookie carries it", async (t) => {
  const { server } = await fixture(t);
  assert.equal(server.url, `http://127.0.0.1:${server.port}/?token=${TOKEN}`);
  const first = await send(
    server.port,
    new URL(server.url).pathname + new URL(server.url).search,
  );
  assert.equal(first.status, 303);
  assert.equal(first.headers.location, "/");
  const cookie = String(first.headers["set-cookie"]).split(";")[0] ?? "";
  const page = await send(server.port, "/", { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>Lumière<\/title>/);
});

test("without the token, from another site or by another name, nothing is served", async (t) => {
  const { server, cookie } = await fixture(t);
  assert.equal((await send(server.port, "/")).status, 401);
  assert.equal((await send(server.port, "/api/vaults")).status, 401);
  assert.equal(
    (await send(server.port, "/lumiere/editor?path=/x.md")).status,
    401,
  );
  assert.equal(
    (
      await send(server.port, "/api/vaults", {
        headers: { cookie, host: "rebound.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await send(server.port, "/api/vaults", {
        method: "POST",
        headers: {
          cookie,
          origin: "http://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ path: "/" }),
      })
    ).status,
    403,
  );
});

test("the shell's files stay inside the shell folder", async (t) => {
  const { server, cookie } = await fixture(t);
  for (const escape of [
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/..%2fsecret.txt",
    "/%2e%2e%2f%2e%2e%2fsecret.txt",
  ]) {
    const reply = await send(server.port, escape, { headers: { cookie } });
    assert.ok(
      reply.status === 403 || reply.status === 404,
      `${escape}: ${reply.status}`,
    );
    assert.doesNotMatch(reply.body, /not for pages/);
  }
});

test("the API lists vaults and their files, and refuses what is not a vault", async (t) => {
  const { server, vault, cookie } = await fixture(t);
  const headers = { cookie };
  assert.deepEqual(
    JSON.parse((await send(server.port, "/api/health", { headers })).body),
    {
      ok: true,
      version: "0.0.0-test",
    },
  );
  const list = JSON.parse(
    (await send(server.port, "/api/vaults", { headers })).body,
  ) as { open: string[] };
  assert.deepEqual(list.open, [vault]);
  const files = await send(
    server.port,
    `/api/files?vault=${encodeURIComponent(vault)}`,
    { headers },
  );
  assert.deepEqual(JSON.parse(files.body), {
    files: [{ path: "daily/today.md", kind: "note" }],
  });

  const outside = await send(
    server.port,
    `/api/files?vault=${encodeURIComponent(path.dirname(vault))}`,
    {
      headers,
    },
  );
  assert.equal(outside.status, 400);
  const bad = await send(server.port, "/api/vaults", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: "{nope",
  });
  assert.equal(bad.status, 400);
  assert.equal(
    (await send(server.port, "/api/nothing", { headers })).status,
    404,
  );
});

test("opening a note from outside reaches the window's event stream", async (t) => {
  const { server, vault, cookie } = await fixture(t);
  const events = await new Promise<string>((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: server.port,
        path: "/api/events",
        headers: { host: `127.0.0.1:${server.port}`, cookie },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
          if (text.includes("data: ")) {
            req.destroy();
            resolve(text);
          }
        });
      },
    );
    req.on("error", (error) => (req.destroyed ? undefined : reject(error)));
    req.end();
    // Once the stream is open, ask the server to show a note.
    setTimeout(() => {
      void send(server.port, "/api/open", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ path: path.join(vault, "daily", "today.md") }),
      });
    }, 50);
  });
  const line =
    events.split("\n").find((item) => item.startsWith("data: ")) ?? "";
  assert.deepEqual(JSON.parse(line.slice("data: ".length)), {
    type: "open",
    vault,
    path: "daily/today.md",
  });
});

test("stopping ends the window's event stream and lets the port go", async (t) => {
  const { server, cookie } = await fixture(t);
  const streamEnded = new Promise<void>((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: server.port,
        path: "/api/events",
        headers: { host: `127.0.0.1:${server.port}`, cookie },
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
        res.on("close", resolve);
      },
    );
    req.on("error", reject);
    req.end();
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const deadline = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), 3000).unref(),
  );
  assert.notEqual(await Promise.race([server.close(), deadline]), "timeout");
  await streamEnded;
});

test("notes opened before the window listens reach it, in order, when it does", async (t) => {
  const { server, vault, cookie } = await fixture(t);
  await writeFile(path.join(vault, "first.md"), "");
  for (const note of ["first.md", "daily/today.md"]) {
    const opened = await send(server.port, "/api/open", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ path: path.join(vault, note) }),
    });
    assert.equal(opened.status, 200);
  }
  const text = await new Promise<string>((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: server.port,
        path: "/api/events",
        headers: { host: `127.0.0.1:${server.port}`, cookie },
      },
      (res) => {
        let received = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          received += chunk;
          if (received.split("data: ").length > 2) {
            req.destroy();
            resolve(received);
          }
        });
      },
    );
    req.on("error", (error) => (req.destroyed ? undefined : reject(error)));
    req.end();
  });
  const paths = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => (JSON.parse(line.slice(6)) as { path: string }).path);
  assert.deepEqual(paths, ["first.md", "daily/today.md"]);
});

test("the plugins' tree views are served behind the token", async (t) => {
  const { server, cookie } = await fixture(t);
  const listed = await send(server.port, "/lumiere/views", {
    headers: { cookie },
  });
  assert.equal(listed.status, 200);
  // Outline and the other views start with the first note's page (bootstrap
  // defers them); the sidebar waits for them on the views' event stream.
  assert.ok(
    Array.isArray((JSON.parse(listed.body) as { views: unknown }).views),
  );
  assert.equal((await send(server.port, "/lumiere/views")).status, 401);
});

test("the window's layout and theme are kept, and only valid changes apply", async (t) => {
  const { server, cookie } = await fixture(t);
  const headers = { cookie, "content-type": "application/json" };
  assert.deepEqual(
    JSON.parse(
      (await send(server.port, "/api/ui", { headers: { cookie } })).body,
    ),
    {
      sidebar: true,
      outline: true,
      theme: "system",
    },
  );
  const changed = await send(server.port, "/api/ui", {
    method: "POST",
    headers,
    body: JSON.stringify({ outline: false, theme: "dark", sidebar: "maybe" }),
  });
  assert.deepEqual(JSON.parse(changed.body), {
    sidebar: true,
    outline: false,
    theme: "dark",
  });
  assert.deepEqual(
    JSON.parse(
      (await send(server.port, "/api/ui", { headers: { cookie } })).body,
    ),
    {
      sidebar: true,
      outline: false,
      theme: "dark",
    },
  );
});

test("no request can trust a vault that did not ask", async (t) => {
  const { server, vault, cookie } = await fixture(t);
  const questions = await send(server.port, "/api/trust", {
    headers: { cookie },
  });
  assert.deepEqual(JSON.parse(questions.body), []);
  const granted = await send(server.port, "/api/trust", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ vault, allowed: true }),
  });
  assert.equal(granted.status, 400);
  const unauthenticated = await send(server.port, "/api/trust");
  assert.equal(unauthenticated.status, 401);
});
