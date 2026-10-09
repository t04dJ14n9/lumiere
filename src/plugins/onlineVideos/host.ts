import type { Plugin } from "../../kernel";
import { RpcError } from "../../shared/rpc/lifecycle";
import type { PanelShell } from "../../shared/runtime";
import { VideoDetailsSource } from "./details";
import { protocol } from "./protocol";

// One cache for the window, shared by every open note.
let source: VideoDetailsSource | undefined;

/** Looks up titles and covers for video cards, only in a trusted workspace. */
export const onlineVideosHost: Plugin<{ panel: PanelShell }> = {
  name: "onlineVideos",
  inject: { required: ["rpc", "workbench"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "details", ({ provider, id }) => {
        if (!ctx.workbench.isTrusted?.()) {
          throw new RpcError(
            "WorkspaceUntrusted",
            "Video details need a trusted workspace",
          );
        }
        source ??= new VideoDetailsSource({
          fetch: (url, init) => fetch(url, init),
        });
        return source.get(provider, id);
      }),
    );
  },
};
