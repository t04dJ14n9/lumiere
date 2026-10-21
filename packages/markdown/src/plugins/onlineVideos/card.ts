import type { VideoDetails } from "./protocol";
import { videoMeta } from "./meta";
import type { OnlineVideo } from "./parse";
import { playerAttributes, providers, thumbnailUrl } from "./player";

interface CardOptions {
  /** The image's alt text, if any. */
  label: string;
  trusted: boolean;
  /** Offer "Play here" (a trusted workspace and the provider's setting). */
  player: boolean;
  /** Title, author, length and cover from the host, in a trusted workspace. */
  details?: Promise<VideoDetails>;
  signal: AbortSignal;
  measure(): void;
  /** Open the video page in the external browser. */
  open(href: string): void;
}

/**
 * A card for an online video: the title (alt text, else the provider's
 * title) with the provider, author and length or ID, a cover in a trusted
 * workspace, and a button that opens the page in the external browser.
 * Buttons, not anchors: VS Code's webview opens every clicked `<a href>`
 * itself as well. "Play here" swaps in a player frame built from the
 * validated ID.
 */

function mediaNoun(video: OnlineVideo): string {
  if (video.provider === "spotify") {
    return video.id.split(":")[0]!;
  }
  if (video.provider === "soundcloud") {
    return video.id.includes("/sets/") ? "playlist" : "track";
  }
  return video.kind === "playlist" ? "playlist" : "video";
}

export function videoCard(
  video: OnlineVideo,
  options: CardOptions,
): HTMLElement {
  const provider = providers[video.provider];
  const card = element("span", "mw-video");
  card.dataset.provider = video.provider;
  const label = options.label.trim();
  const title = element(
    "span",
    "mw-video-title",
    label || `${provider.name} ${mediaNoun(video)}`,
  );
  const meta = element(
    "span",
    "mw-video-meta",
    videoMeta(provider.name, video.id, {}, video.kind),
  );
  meta.title = video.id;
  const thumbnail = options.trusted ? thumbnailUrl(video) : undefined;
  if (thumbnail) {
    card.append(cover(video, thumbnail, title.textContent!, options));
  }
  const body = element("span", "mw-video-body");
  body.append(title, meta);
  const actions = element("span", "mw-video-actions");
  if (
    options.trusted &&
    options.player &&
    provider.embeddable &&
    video.kind !== "playlist"
  ) {
    actions.append(playButton(card, video, options));
  }
  const open = opener(video, "mw-video-open", options);
  open.textContent =
    video.kind === "playlist"
      ? `Open playlist on ${provider.name}`
      : `Open on ${provider.name}`;
  actions.append(open);
  body.append(actions);
  if (!options.trusted) {
    body.append(
      element(
        "span",
        "mw-video-note",
        "Players, covers and titles are off in an untrusted workspace.",
      ),
    );
  }
  card.append(body);
  void options.details?.then(
    (details) =>
      showDetails({ card, title, meta, video, label, details, options }),
    () => undefined,
  );
  return card;
}

function showDetails({
  card,
  title,
  meta,
  video,
  label,
  details,
  options,
}: {
  card: HTMLElement;
  title: HTMLElement;
  meta: HTMLElement;
  video: OnlineVideo;
  label: string;
  details: VideoDetails;
  options: CardOptions;
}): void {
  if (options.signal.aborted) {
    return;
  }
  if (!label && details.title) {
    title.textContent = details.title;
  }
  meta.textContent = videoMeta(
    providers[video.provider].name,
    video.id,
    details,
    video.kind,
  );
  if (
    details.cover &&
    !card.querySelector(".mw-video-thumb, .mw-video-frame")
  ) {
    card.prepend(cover(video, details.cover, title.textContent!, options));
  }
  card.classList.add("has-details");
  options.measure();
}

function cover(
  video: OnlineVideo,
  src: string,
  title: string,
  options: CardOptions,
): HTMLElement {
  const link = opener(video, "mw-video-thumb", options);
  link.setAttribute(
    "aria-label",
    `Open ${title} on ${providers[video.provider].name}`,
  );
  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("load", options.measure, { signal: options.signal });
  image.addEventListener("error", () => link.remove(), {
    signal: options.signal,
  });
  link.append(image, element("span", "mw-video-badge", "▶"));
  return link;
}

function playButton(
  card: HTMLElement,
  video: OnlineVideo,
  options: CardOptions,
): HTMLElement {
  const play = document.createElement("button");
  play.type = "button";
  play.className = "mw-video-play";
  play.textContent = "Play here";
  play.addEventListener(
    "click",
    () => {
      card.prepend(player(video));
      card.querySelector(".mw-video-thumb")?.remove();
      card.classList.add("is-playing");
      play.remove();
      options.measure();
    },
    { signal: options.signal },
  );
  return play;
}

function player(video: OnlineVideo): HTMLElement {
  const frame = document.createElement("iframe");
  for (const [name, value] of Object.entries(playerAttributes(video))) {
    frame.setAttribute(name, value);
  }
  const shell = element("span", "mw-video-frame");
  shell.append(frame);
  return shell;
}

function opener(
  video: OnlineVideo,
  className: string,
  options: CardOptions,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = video.page;
  button.addEventListener("click", () => options.open(video.page), {
    signal: options.signal,
  });
  return button;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}
