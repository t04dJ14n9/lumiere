import createDOMPurify from "dompurify";

const purifiers = new WeakMap<
  Window & typeof globalThis,
  ReturnType<typeof createDOMPurify>
>();

function getPurifier(
  win: Window & typeof globalThis,
): ReturnType<typeof createDOMPurify> {
  let instance = purifiers.get(win);
  if (!instance) {
    instance = createDOMPurify(win);
    purifiers.set(win, instance);
  }
  return instance;
}

/** Generated graphics are still untrusted: strip active content and event attributes. */
export function sanitizeGraphics(html: string): string {
  return getPurifier(window).sanitize(html, {
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
