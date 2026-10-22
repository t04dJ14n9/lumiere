/**
 * Lumière's editor routes (host-node) on DSH's own web server, behind DSH's
 * browser authentication: a request DSH would refuse never reaches them.
 */
import type { IncomingMessage } from "node:http";
import {
  BASE,
  SOCKET_PATH,
  createEditorRoutes,
  type EditorAssets,
  type LumiereHost,
} from "@workshop/host-node";
import type { DshContext } from "./dsh";

export function registerRoutes(
  ctx: DshContext,
  host: LumiereHost,
  assets: EditorAssets,
): void {
  const routes = createEditorRoutes(host, assets);
  const reject = (req: IncomingMessage) => ctx.connection.requestRejection(req);
  ctx.effect(() =>
    ctx.webServer.register({
      kind: "prefix",
      path: BASE,
      handler: async (req, res) => {
        const status = reject(req);
        if (status) {
          res.writeHead(status).end();
          return;
        }
        const handled = await routes
          .handle(req, res)
          .catch((error: unknown) => {
            ctx.logger?.("lumiere").error("Lumière route failed", error);
            if (!res.headersSent) {
              res.writeHead(500, { "content-type": "text/plain" });
            }
            // The message can name a filesystem path. The log has it; the browser does not.
            res.end("Internal error");
            return true;
          });
        if (!handled) {
          res.writeHead(404).end();
        }
      },
    }),
  );
  ctx.effect(() => {
    const stop = ctx.webServer.registerUpgrade({
      path: SOCKET_PATH,
      handler: (req, socket, head) => {
        if (reject(req) || !routes.upgrade(req, socket, head)) {
          socket.destroy();
        }
      },
    });
    return () => {
      stop();
      routes.close();
    };
  });
}
