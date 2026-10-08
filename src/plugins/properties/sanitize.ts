import createDOMPurify from "dompurify";
export function sanitize(html: string): string {
  return createDOMPurify(window).sanitize(html, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
  });
}
