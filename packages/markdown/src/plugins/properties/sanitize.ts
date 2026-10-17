import createDOMPurify from "dompurify";
export function sanitize(html: string): string {
  return createDOMPurify(window).sanitize(html, {
    // Editable controls come from this sheet's template; values are escaped.
    ADD_ATTR: ["contenteditable"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
  });
}
