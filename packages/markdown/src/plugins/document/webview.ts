import type { Context, Plugin } from "@workshop/core";
import { protocol } from "./protocol";
import { ViewConnection } from "./view-connection";
export const documentWebview: Plugin<{ version: number; clientID: string }> = {
  name: "document",
  inject: { required: ["rpc"] },
  provides: ["document"],
  apply(ctx, config) {
    const connection = new ViewConnection(config, ctx.rpc, (message) =>
      ctx.emit("document/syncStatus", message),
    );
    ctx.provide("document", connection);
    registerUpdates(ctx, connection);
    registerFlush(ctx, connection);
    ctx.effect(() => () => connection.dispose());
  },
};

function registerUpdates(ctx: Context, connection: ViewConnection): void {
  ctx.effect(() =>
    ctx.rpc.on(protocol, "updates", (message) => connection.receive(message)),
  );
}

function registerFlush(ctx: Context, connection: ViewConnection): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "flush", async () => {
      await connection.flush();
      return true;
    }),
  );
}
