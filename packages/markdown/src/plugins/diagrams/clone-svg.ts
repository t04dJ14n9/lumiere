let cloneSerial = 0;

/** Fresh id for a lightbox SVG clone so Mermaid theme CSS can stay scoped. */
export function uniqueCloneSvgId(originalId: string | null): string {
  const base = originalId && originalId.length > 0 ? originalId : "mermaid";
  cloneSerial += 1;
  return `${base}-inspect-${cloneSerial}`;
}

/**
 * Mermaid injects theme rules scoped to the root SVG id (`#id .node rect`).
 * A clone that drops the id loses those fills (black nodes on a dark dialog).
 * Rewrite every `#oldId` selector token to `#newId` inside `<style>` text.
 */
export function rewriteSvgThemeId(
  styleText: string,
  oldId: string,
  newId: string,
): string {
  if (!oldId || oldId === newId) {
    return styleText;
  }
  return styleText.split(`#${oldId}`).join(`#${newId}`);
}

/**
 * Clone an SVG for the diagram lightbox: keep a unique id and rewrite
 * Mermaid's id-scoped theme CSS so fills/labels still resolve.
 */
export function cloneDiagramSvg(svg: Element): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const oldId = clone.getAttribute("id");
  // Theme selectors are `#originalId …`. Keep an id on the clone (a unique
  // one, to avoid duplicate ids in the document) and rewrite style text.
  const newId = uniqueCloneSvgId(oldId);
  clone.setAttribute("id", newId);
  if (oldId) {
    for (const style of clone.querySelectorAll("style")) {
      const text = style.textContent;
      if (text) {
        style.textContent = rewriteSvgThemeId(text, oldId, newId);
      }
    }
  }
  return clone;
}
