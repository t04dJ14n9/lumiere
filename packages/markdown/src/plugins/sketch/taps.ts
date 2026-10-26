/**
 * A tap (or click) on a sketch in Live Preview opens it for editing, as a
 * tap on a drawing does in Notes. Embeds would select the image on the same
 * press; this listens on the editor's outer element in the capture phase,
 * so it sees the press first and keeps it from embeds only for sketches.
 */
import type { Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { isSketchPath } from "@workshop/ink/format";
import type { TappedEmbed } from "./edit";

/** The part of an element `sketchEmbedOf` reads, so tests need no DOM. */
export interface EmbedElement {
  readonly tagName: string;
  closest(selector: string): {
    getAttribute(name: string): string | null;
  } | null;
}

/**
 * The sketch an image shows, by its link as written in the note: a wiki
 * embed's span or a Markdown image carries it as `data-resource`.
 */
export function sketchEmbedOf(element: EmbedElement): TappedEmbed | undefined {
  if (element.tagName !== "IMG") {
    return undefined;
  }
  const holder = element.closest("[data-resource]");
  const target = holder?.getAttribute("data-resource");
  if (!holder || !target || !isSketchPath(target.replace(/[#?].*$/, ""))) {
    return undefined;
  }
  return {
    target,
    syntax:
      holder.getAttribute("data-wiki") === "true" ? "wikilink" : "markdown",
  };
}

export interface SketchTaps {
  /** Whether a tap may open the canvas now (a host that can draw, none open). */
  canEdit(): boolean;
  edit(embed: TappedEmbed): void;
}

export function sketchTaps(taps: SketchTaps): Extension {
  return ViewPlugin.define((view) => {
    const press = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        view.state.readOnly ||
        !(event.target instanceof Element) ||
        !taps.canEdit()
      ) {
        return;
      }
      const embed = sketchEmbedOf(event.target);
      if (!embed) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      taps.edit(embed);
    };
    view.dom.addEventListener("mousedown", press, { capture: true });
    return {
      destroy() {
        view.dom.removeEventListener("mousedown", press, { capture: true });
      },
    };
  });
}
