/**
 * The sketch plugin's page half. Sketches already show as images (embeds);
 * this makes a tap on one open it for editing, where the host can draw, and
 * shows the new drawing once it is saved.
 */
import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../render/api";
import type {} from "../resources/api";
import type { TappedEmbed } from "./edit";
import { protocol } from "./protocol";
import { sketchTaps } from "./taps";

/** The canvas stays open as long as the reader draws. */
const EDIT_TIMEOUT = 12 * 60 * 60 * 1000;

export const sketchWebview: Plugin = {
  name: "sketch",
  inject: { required: ["editor", "rpc"] },
  apply(ctx) {
    let canDraw = false;
    let isEditing = false;
    // Whichever starts last, the host's word or this question reaches the other.
    ctx.effect(() =>
      ctx.rpc.on(protocol, "ready", () => {
        canDraw = true;
      }),
    );
    void ctx.rpc.call(protocol, "available", {}).then(
      (available) => {
        canDraw ||= available;
      },
      // No host half: this host has no canvas, and sketches stay images.
      () => {},
    );
    ctx.effect(() =>
      ctx.editor.extend(
        sketchTaps({
          canEdit: () => canDraw && !isEditing,
          edit: (embed) => {
            isEditing = true;
            void editAndShow(ctx, embed).finally(() => {
              isEditing = false;
            });
          },
        }),
      ),
    );
  },
};

/** Never rejects: a failed edit is logged, and the note shows what it showed. */
async function editAndShow(ctx: Context, embed: TappedEmbed): Promise<void> {
  try {
    const saved = await ctx.rpc.call(protocol, "edit", embed, {
      timeout: EDIT_TIMEOUT,
    });
    if (saved) {
      ctx.emit("resources/changed");
      ctx.emit("render/changed");
    }
  } catch (error) {
    ctx.logger.warn("Could not edit the sketch", error);
  }
}
