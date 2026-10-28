/**
 * Lumière's own server: the shell UI, its API, and the editor's pages
 * (host-node), on a loopback port, for one window. Every request passes
 * auth.ts first.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import * as path from "node:path";
import type { Duplex } from "node:stream";
import { pathToFileURL } from "node:url";
import type { Logger } from "@workshop/core";
import {
  BASE,
  createEditorRoutes,
  readCommands,
  readContributed,
  readMenus,
  serveStatic,
  startLumiere,
  type LumiereHost,
} from "@workshop/host-node";
import { createApi, type Api } from "./api";
import { admit } from "./auth";
import { UiStore } from "./ui-state";
import { Vaults } from "./vaults";

export interface ServerSetup {
  readonly host: string;
  readonly port: number;
  readonly token: string;
  readonly data: string;
  /** The built app (contract.ts, `--assets`). */
  readonly assets: string;
  readonly vaults: readonly string[];
  readonly version: string;
  readonly logger: Logger;
}

export interface RunningServer {
  /** Where the window opens, with the token for its first request. */
  readonly url: string;
  readonly port: number;
  /** Write unsaved notes, stop the plugins and close every connection; once. */
  close(): Promise<void>;
}

export async function startServer(setup: ServerSetup): Promise<RunningServer> {
  const markdown = path.join(setup.assets, "markdown");
  const lumiere = await startLumiere({
    identity: { appName: "Lumière", uriScheme: "lumiere" },
    markdown,
    contributed: await readContributed(
      path.join(setup.assets, "contributed.json"),
    ),
    menus: await readMenus(path.join(setup.assets, "menus.json")),
    commands: await readCommands(path.join(setup.assets, "commands.json")),
    data: setup.data,
    logger: setup.logger,
  });
  const editor = createEditorRoutes(lumiere, {
    markdown,
    shim: path.join(setup.assets, "page", "shim.js"),
  });
  const api = createApi(...(await loadState(setup, lumiere)), setup.version);
  const shell = path.join(setup.assets, "shell");
  let port = setup.port;
  const auth = () => ({ token: setup.token, port });

  const server = createServer((req, res) => {
    void respond({ req, res, auth: auth(), api, editor, shell }).catch(
      (error: unknown) => fail(res, error, setup.logger),
    );
  });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (
      admit(req, auth()).kind !== "admit" ||
      !editor.upgrade(req, socket, head)
    ) {
      socket.destroy();
    }
  });
  port = await listen(server, setup.host, setup.port);
  let stopping: Promise<void> | undefined;
  const stop = async () => {
    const closed = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    api.close();
    editor.close();
    server.closeAllConnections();
    await lumiere.stop();
    await closed;
  };
  const origin = `http://${setup.host.includes(":") ? `[${setup.host}]` : setup.host}:${port}`;
  return {
    url: `${origin}/?token=${encodeURIComponent(setup.token)}`,
    port,
    close() {
      stopping ??= stop();
      return stopping;
    },
  };
}

/** The vaults (the recent ones, and those given at start) and the window's layout. */
async function loadState(
  setup: ServerSetup,
  lumiere: LumiereHost,
): Promise<[Vaults, UiStore]> {
  const vaults = new Vaults(path.join(setup.data, "vaults.json"));
  await vaults.load();
  vaults.onEvent((event) => {
    if (event.type === "vaults" && event.added) {
      lumiere.addRoot(pathToFileURL(event.added).toString());
    }
  });
  for (const vault of setup.vaults) {
    await vaults.add(vault);
  }
  const ui = new UiStore(path.join(setup.data, "window.json"));
  await ui.load();
  return [vaults, ui];
}

interface Request {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly auth: { readonly token: string; readonly port: number };
  readonly api: Api;
  readonly editor: ReturnType<typeof createEditorRoutes>;
  readonly shell: string;
}

async function respond({
  req,
  res,
  auth,
  api,
  editor,
  shell,
}: Request): Promise<void> {
  const admission = admit(req, auth);
  if (admission.kind === "reject") {
    res.writeHead(admission.status).end();
    return;
  }
  if (admission.kind === "redirect") {
    res.writeHead(303, {
      location: admission.location,
      "set-cookie": admission.cookie,
    });
    res.end();
    return;
  }
  const pathname = new URL(req.url ?? "/", "http://host").pathname;
  if (pathname.startsWith("/api/")) {
    if (!(await api.handle(req, res))) {
      res.writeHead(404).end();
    }
  } else if (pathname.startsWith(BASE + "/")) {
    if (!(await editor.handle(req, res))) {
      res.writeHead(404).end();
    }
  } else {
    await serveStatic(
      res,
      shell,
      pathname === "/" ? "index.html" : pathname.slice(1),
    );
  }
}

function fail(res: ServerResponse, error: unknown, logger: Logger): void {
  logger.warn("Request failed", error);
  if (!res.headersSent) {
    res.writeHead(400, { "content-type": "application/json" });
  }
  res.end(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

function listen(
  server: ReturnType<typeof createServer>,
  host: string,
  port: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
}
