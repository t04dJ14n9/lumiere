// Sketches on the desktop: the server's plugins ask for a drawing
// (src/server/ink.ts), it waits behind GET and POST /api/ink, and the
// window draws it on its canvas (src/shell/ink.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  decodeSketch,
  emptySketch,
  encodeSketch,
  type Sketch,
} from "@workshop/ink/format";
import type { InkService } from "@workshop/ink/service";
import { createApi } from "../../src/server/api";
import { WindowInk } from "../../src/server/ink";
import { UiStore } from "../../src/server/ui-state";
import { Vaults } from "../../src/server/vaults";
import type { InkWaiting, ServerEvent } from "../../src/shell/api";
import { drawForServer, type InkServer } from "../../src/shell/ink";

const DRAWN: Sketch = {
  ...emptySketch(),
  height: 560,
  strokes: [
    {
      tool: "pen",
      color: "#1f2328",
      points: [
        {
          x: 10,
          y: 20,
          t: 0,
          force: 0.5,
          altitude: 1.5,
          azimuth: 0,
          width: 3,
          opacity: 1,
        },
      ],
    },
  ],
};

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

/** The API alone, on a loopback port, with a WindowInk to wait on. */
async function api(t: test.TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-ink-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ink = new WindowInk();
  let sketchesStarted = 0;
  const handler = createApi({
    vaults: new Vaults(path.join(dir, "vaults.json")),
    ui: new UiStore(path.join(dir, "window.json")),
    ink,
    insertSketch: () => {
      sketchesStarted += 1;
    },
    version: "0.0.0-test",
  });
  const server = createServer((req, res) => {
    handler.handle(req, res).catch((error: unknown) => {
      res.writeHead(400).end(JSON.stringify({ error: String(error) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    handler.close();
    server.close();
  });
  const port = (server.address() as { port: number }).port;
  const send = (method: string, pathname: string, body?: unknown) =>
    new Promise<Reply>((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, path: pathname, method },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (text += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              body: text ? (JSON.parse(text) as unknown) : undefined,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  return { ink, send, started: () => sketchesStarted };
}

test("a drawing waits for the window, which reads it and posts it back", async (t) => {
  const { ink, send } = await api(t);
  assert.deepEqual((await send("GET", "/api/ink")).body, {});
  let changes = 0;
  ink.onChange(() => changes++);
  const drawn = ink.draw({ title: "2026-10-26 17.34" });
  assert.equal(changes, 1, "the window hears of it");
  const waiting = (await send("GET", "/api/ink")).body as InkWaiting;
  assert.equal(waiting.title, "2026-10-26 17.34");
  assert.deepEqual(decodeSketch(waiting.sketch), emptySketch());
  const reply = await send("POST", "/api/ink", {
    id: waiting.id,
    sketch: encodeSketch(DRAWN),
  });
  assert.equal(reply.status, 200);
  assert.deepEqual(await drawn, DRAWN);
  assert.equal(changes, 2);
  assert.deepEqual((await send("GET", "/api/ink")).body, {});
});

test("a cancelled drawing gives nothing, and only the drawing waiting is answered", async (t) => {
  const { ink, send } = await api(t);
  const drawn = ink.draw({ title: "Sketch", sketch: DRAWN });
  await assert.rejects(ink.draw({ title: "Another" }), /already open/);
  const waiting = (await send("GET", "/api/ink")).body as InkWaiting;
  assert.deepEqual(decodeSketch(waiting.sketch), DRAWN);
  const stranger = await send("POST", "/api/ink", { id: "ink-forged" });
  assert.equal(stranger.status, 400);
  const malformed = await send("POST", "/api/ink", { id: 7 });
  assert.equal(malformed.status, 400);
  await send("POST", "/api/ink", { id: waiting.id });
  assert.equal(await drawn, undefined);
});

test("a drawing that is not a sketch fails the plugin's request, which says so", async (t) => {
  const { ink, send } = await api(t);
  const refused = assert.rejects(
    ink.draw({ title: "Sketch" }),
    /sketch's version/,
  );
  const { id } = (await send("GET", "/api/ink")).body as InkWaiting;
  const reply = await send("POST", "/api/ink", { id, sketch: "{}" });
  assert.equal(reply.status, 400);
  await refused;
  assert.deepEqual((await send("GET", "/api/ink")).body, {});
});

test("the server stopping gives up a drawing still waiting", async () => {
  const ink = new WindowInk();
  const drawn = ink.draw({ title: "Sketch" });
  ink.close();
  assert.equal(await drawn, undefined);
});

test("the window's pencil starts Insert Sketch on the server", async (t) => {
  const { send, started } = await api(t);
  assert.equal((await send("POST", "/api/sketch", {})).status, 200);
  assert.equal(started(), 1);
});

/** A server the window talks to, in memory, and a canvas that answers as told. */
function windowParts(answers: (Sketch | undefined | Error)[]) {
  const ink = new WindowInk();
  const listeners = new Set<(event: ServerEvent) => void>();
  ink.onChange(() =>
    listeners.forEach((listener) => listener({ type: "ink" })),
  );
  const server: InkServer = {
    waiting: async () => ink.request(),
    answer: async (id, sketch) => ink.answer(id, sketch),
    events: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const opened: string[] = [];
  const canvas: InkService = {
    capabilities: async () => ({
      engine: "web",
      pressure: true,
      toolPicker: false,
    }),
    draw: async (request) => {
      opened.push(request.title);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const answer = answers.shift();
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  };
  const warnings: string[] = [];
  const stop = drawForServer({
    server,
    canvas,
    warn: (message) => warnings.push(message),
  });
  return { ink, opened, warnings, stop };
}

test("the window draws what the server asks for, once, and posts it back", async () => {
  const { ink, opened, stop } = windowParts([DRAWN, undefined]);
  assert.deepEqual(await ink.draw({ title: "First" }), DRAWN);
  assert.deepEqual(opened, ["First"], "opened once, though told twice");
  assert.equal(await ink.draw({ title: "Second" }), undefined);
  assert.deepEqual(opened, ["First", "Second"]);
  stop();
});

test("a drawing waiting when the window loads opens at once", async () => {
  const ink = new WindowInk();
  const drawn = ink.draw({ title: "Before the reload" });
  const server: InkServer = {
    waiting: async () => ink.request(),
    answer: async (id, sketch) => ink.answer(id, sketch),
    events: () => () => {},
  };
  drawForServer({
    server,
    canvas: {
      capabilities: async () => ({
        engine: "web",
        pressure: true,
        toolPicker: false,
      }),
      draw: async () => DRAWN,
    },
    warn: () => {},
  });
  assert.deepEqual(await drawn, DRAWN);
});

test("a canvas that cannot open lets the server's plugin stop waiting", async () => {
  const { ink, warnings, stop } = windowParts([new Error("No canvas here")]);
  assert.equal(await ink.draw({ title: "Sketch" }), undefined);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(warnings, ["Could not draw"]);
  stop();
});
