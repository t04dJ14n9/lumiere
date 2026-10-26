import type { Context, Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import type {} from "../vault/api";
import { NoteResources } from "./note-resources";
import { protocol } from "./protocol";
export const resourcesHost: Plugin<{ panel: PanelShell }> = {
  name: "resources",
  inject: { required: ["rpc", "vault", "workspace", "hostDocuments"] },
  provides: ["resources"],
  apply(ctx, { panel }) {
    const resources = new NoteResources({
      source: panel.document.uri,
      vault: ctx.vault,
      host: ctx,
      resourceUrl: (uri) => panel.resource(uri),
    });
    ctx.provide("resources", resources);
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "load", (params) =>
        resources.load(params.target, params.source, params.syntax),
      ),
    );
    reportFoundFiles(ctx, resources);
  },
};

/**
 * Tell the page when a file it could not show is in the vault after all:
 * synced from another device, written by another app, or by a plugin a
 * moment after it embedded the file. The index learns of a file by its
 * event, or silently while it catches up after start-up, and then says it
 * has resolved links.
 */
function reportFoundFiles(ctx: Context, resources: NoteResources): void {
  const check = () => {
    if (resources.takeFound()) {
      ctx.rpc.notify(protocol, "found", {}, { coalesce: true });
    }
  };
  ctx.effect(() =>
    ctx.vault.onDidChange((change) => {
      if (change.type === "create" || change.type === "rename") {
        check();
      }
    }),
  );
  ctx.effect(() => ctx.vault.onDidResolve(check));
}
