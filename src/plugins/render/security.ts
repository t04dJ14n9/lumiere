/** Remote content follows host trust even after sanitization permits its tags. */
export function constrainRemoteContent(
  container: HTMLElement,
  trusted: boolean,
): void {
  for (const frame of container.querySelectorAll("iframe")) {
    if (!trusted || !/^https:\/\//i.test(frame.getAttribute("src") ?? "")) {
      frame.remove();
    } else {
      frame.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-presentation",
      );
      frame.loading = "lazy";
    }
  }
  if (trusted) {
    return;
  }
  for (const media of container.querySelectorAll("[src]")) {
    if (/^https?:/i.test(media.getAttribute("src") ?? "")) {
      media.removeAttribute("src");
    }
  }
}
