import type { Plugin } from "@workshop/core";
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
  },
};
