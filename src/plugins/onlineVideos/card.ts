import type { OnlineVideo } from "./parse";
import { playerAttributes, providers, thumbnailUrl } from "./player";

interface CardOptions {
  /** The image's alt text, if any. */
  label: string;
  trusted: boolean;
  signal: AbortSignal;
  measure(): void;
  /** Open the video page in the external browser. */
  open(href: string): void;
}

/**
 * A card for an online video: the title (alt text) or provider and ID, the
 * YouTube still in a trusted workspace, and a link the links plugin opens in
 * the external browser. Providers that play in a webview add "Play here",
 * which swaps in a player frame built from the validated ID.
 */
export function videoCard(
  video: OnlineVideo,
  options: CardOptions,
): HTMLElement {
  const provider = providers[video.provider];
  const card = element("span", "mw-video");
  card.dataset.provider = video.provider;
  const title = options.label.trim() || `${provider.name} video`;
  const thumbnail = options.trusted ? thumbnailUrl(video) : undefined;
  if (thumbnail) {
    card.append(thumbnailLink(video, thumbnail, title, options));
  }
  const body = element("span", "mw-video-body");
  body.append(
    element("span", "mw-video-title", title),
    element("span", "mw-video-meta", `${provider.name} · ${video.id}`),
  );
  const actions = element("span", "mw-video-actions");
  if (options.trusted && provider.playsInWebview) {
    actions.append(playButton(card, video, options));
  }
  const open = opener(video, "mw-video-open", options);
  open.textContent = `Open on ${provider.name}`;
  actions.append(open);
  body.append(actions);
  if (!options.trusted) {
    body.append(
      element(
        "span",
        "mw-video-note",
        "Players and thumbnails are off in an untrusted workspace.",
      ),
    );
  }
  card.append(body);
  return card;
}

function thumbnailLink(
  video: OnlineVideo,
  thumbnail: string,
  title: string,
  options: CardOptions,
): HTMLElement {
  const link = opener(video, "mw-video-thumb", options);
  link.setAttribute(
    "aria-label",
    `Open ${title} on ${providers[video.provider].name}`,
  );
  const image = document.createElement("img");
  image.src = thumbnail;
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
