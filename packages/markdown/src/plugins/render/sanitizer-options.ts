/**
 * DOMPurify options for rendered Markdown (DESIGN §19).
 *
 * Links in any scheme keep their `href`. The host's link pipeline (DESIGN
 * §16) opens web and mail links, routes `vscode:` links to their extension
 * and asks before opening any other application scheme (`zotero:`,
 * `obsidian:`), as Obsidian does. DOMPurify's default allowlist would strip
 * those hrefs and leave dead links in callouts, tables, embeds and code
 * block processor output. Script and `data:` URLs are still removed, except
 * the `data:` images DOMPurify always allows.
 */
export function sanitizerOptions(trusted: boolean) {
  return {
    ADD_TAGS: trusted ? ["iframe"] : [],
    FORBID_TAGS: ["script", "style", "form", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
    ALLOW_UNKNOWN_PROTOCOLS: true,
  };
}
