import { WidgetType } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import { headerParts } from "../../markdown/properties/header-parts";
import { blockRenderers } from "./registry";
import type { BlockRenderer } from "./api";

/**
 * Collapsed Properties chrome height (padding + heading) from
 * `properties/estimated-height` COLLAPSED — kept local so livePreview does
 * not import the properties plugin. Reserves space until the real sheet
 * mounts so the heading does not jump from raw YAML line-count to sheet.
 */
const PLACEHOLDER_HEIGHT = 69;

/** Bound fence probes so match never slices a multi-MB note. */
const FRONTMATTER_PROBE_MAX = 64 * 1024;

/**
 * True when the Lezer Frontmatter node spans a complete `---` / `---` fence.
 * Truncated first-paint trees cut mid-YAML (`node.to` before the closing
 * fence); matching those would hide only the opening band and leave the rest
 * of the fence as raw glyphs.
 */

export function completeFrontmatter(
  state: EditorState,
  node: SyntaxNodeRef,
): boolean {
  if (node.name !== "Frontmatter" || node.from !== 0) {
    return false;
  }
  // Probe the note (not just node.to): a truncated first-paint Frontmatter
  // node ends mid-YAML while headerParts on the real fence still finds the
  // closing marker further down. Lezer's node.to omits the trailing EOL that
  // headerParts includes in `end`.
  const header = headerParts(
    state.doc.sliceString(0, Math.min(state.doc.length, FRONTMATTER_PROBE_MAX)),
  );
  if (!header) {
    return false;
  }
  return node.to >= header.end - header.eol.length;
}

/** Properties (or any later chrome) owns Frontmatter once registered. */
export function propertiesRendererRegistered(state: EditorState): boolean {
  return state
    .facet(blockRenderers)
    .some((renderer) => renderer.kind === "properties");
}

/**
 * Collapse a complete YAML fence before the Properties feature chunk
 * configures. Heading + body enter the viewport from core Live Preview alone;
 * Properties replaces this widget when its renderer registers.
 */
export function frontmatterPlaceholderRenderer(): BlockRenderer {
  return {
    kind: "frontmatter-placeholder",
    nodes: ["Frontmatter"],
    editing: "widget",
    match: (node, state) =>
      !propertiesRendererRegistered(state) && completeFrontmatter(state, node),
    widget: () => new FrontmatterPlaceholder(),
  };
}

class FrontmatterPlaceholder extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "hybrid-properties mw-frontmatter-placeholder";
    wrapper.setAttribute("aria-hidden", "true");
    // Mirror collapsed Properties chrome so CSS already on the editor sheet
    // paints a familiar bar; the real PropertyWidget replaces this on configure.
    wrapper.innerHTML =
      '<div class="properties metadata-container is-collapsed">' +
      '<div class="metadata-properties-heading" data-properties-heading>' +
      '<span class="metadata-properties-title">Properties</span></div></div>';
    const reserve = this.estimatedHeight;
    if (reserve > 0 && wrapper.style) {
      wrapper.style.minHeight = `${reserve}px`;
    }
    return wrapper;
  }

  override get estimatedHeight(): number {
    return PLACEHOLDER_HEIGHT;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}
