/** Image placeholders remain readable while resolving, on failure and on load errors. */
export function resolveDiffImages(options: {
  container: HTMLElement;
  side: "left" | "right";
  load(side: "left" | "right", target: string): Promise<string>;
}): void {
  for (const image of options.container.querySelectorAll<HTMLImageElement>(
    "img[data-resource]",
  )) {
    const target = image.dataset.resource ?? "";
    const fallback = image.ownerDocument.createElement("code");
    fallback.textContent = `![${image.alt}](${target}) — image unavailable`;
    image.after(fallback);
    image.hidden = true;
    image.loading = "eager";
    image.addEventListener(
      "load",
      () => {
        image.hidden = false;
        fallback.hidden = true;
      },
      { once: true },
    );
    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });
    void options
      .load(options.side, target)
      .then((url) => {
        if (url && image.isConnected) {
          image.src = url;
        }
      })
      .catch(() => {});
  }
}
