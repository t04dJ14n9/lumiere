import type { Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import { contributionId } from "../../shared/setting-schema";
import { isCursorHost } from "./cursor";
import { protocol } from "./protocol";

/**
 * The panel's side of Cursor Chat and Edit: tells the webview whether it
 * runs in Cursor, and runs the Chat or Edit command when it asks.
 */
export const cursorBridgePanelHost: Plugin<{ panel: PanelShell }> = {
  name: "cursorBridge",
  inject: { required: ["rpc", "agentHost", "hostCommands"] },
  apply(ctx) {
    const { rpc, agentHost, hostCommands } = ctx;
    ctx.effect(() =>
      rpc.handle(protocol, "isCursor", async () =>
        isCursorHost(agentHost.appName),
      ),
    );
    ctx.effect(() =>
      rpc.handle(protocol, "handOff", async ({ mode }) => {
        await hostCommands.execute(contributionId(`cursorBridge.${mode}`));
        return true;
      }),
    );
  },
};
