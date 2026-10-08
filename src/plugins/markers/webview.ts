import { getSyncedVersion, sendableUpdates } from "@codemirror/collab";
import type { Context, Infer, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../livePreview/api";
import { protocol as documentProtocol } from "../document/protocol";
import { protocol, type snapshot } from "./protocol";
import { markerState, setMarkers, WireMarkerHistory } from "./view-state";
import { markerDecorations, markerTheme } from "./decorations";
export const markersWebview: Plugin = {
  name: "markers",
  inject: { required: ["editor", "rpc"], optional: ["livePreview"] },
  apply(ctx) {
    registerMarkerDecorations(ctx);
    registerMarkerUpdates(ctx);
  },
};
function registerMarkerDecorations(ctx: Context): void {
  const activate = (owner: string, markerId: string) => {
    void ctx.rpc
      .call(protocol, "activate", { owner, markerId })
      .catch((error) => ctx.logger.warn("Marker action failed", error));
  };
  ctx.effect(() =>
    ctx.editor.extend([
      markerState,
      markerTheme,
      markerDecorations(
        activate,
        (state, position) =>
          ctx.livePreview?.visiblePosition?.(state, position) ?? {
            position,
            block: false,
          },
      ),
    ]),
  );
}
function registerMarkerUpdates(ctx: Context): void {
  const history = new WireMarkerHistory();
  let live = true;
  let revision = -1;
  let pending: Infer<typeof snapshot> | undefined;
  const apply = () => {
    if (!live || !pending) {
      return;
    }
    const state = ctx.editor.view.state;
    const mapped = history.map(
      pending,
      getSyncedVersion(state),
      sendableUpdates(state),
    );
    if (!mapped) {
      return;
    }
    revision = pending.revision;
    pending = undefined;
    ctx.editor.view.dispatch({ effects: setMarkers.of(mapped) });
  };
  const receive = (value: Infer<typeof snapshot>) => {
    if (
      !live ||
      value.revision < revision ||
      (pending && value.revision < pending.revision)
    ) {
      return;
    }
    pending = value;
    apply();
  };
  ctx.effect(() => () => {
    live = false;
  });
  ctx.effect(() => ctx.rpc.on(protocol, "changed", receive));
  ctx.effect(() =>
    ctx.rpc.on(documentProtocol, "updates", (update) => {
      history.record(update.version, update.updates);
      apply();
    }),
  );
  void ctx.rpc
    .call(protocol, "current", {})
    .then(receive)
    .catch((error) => {
      if (live) {
        ctx.logger.warn("Markers unavailable", error);
      }
    });
}
