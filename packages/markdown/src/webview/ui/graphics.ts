import createDOMPurify from "dompurify";
/** Generated graphics are still untrusted: strip active content and event attributes. */
export function sanitizeGraphics(html: string): string {
  return createDOMPurify(window).sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ["mjx-container", "use"],
    ADD_ATTR: ["xlink:href"],
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "foreignObject",
    ],
  });
}
