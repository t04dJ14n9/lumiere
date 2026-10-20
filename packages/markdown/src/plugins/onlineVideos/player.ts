import type { OnlineVideo, VideoProvider } from "./parse";

interface Provider {
  readonly name: string;
  /** The only origin a player frame may load. */
  readonly origin: string;
  readonly path: string;
  /** Paths a player frame may load under `origin`. */
  readonly pathPattern: RegExp;
  /**
   * Whether the card may offer "Play here" (Bilibili, behind the
   * `bilibiliPlayer` setting). YouTube refuses every embed in a VS Code
   * webview with error 153: the webview origin is not http(s), so the player
   * gets no referrer to check. Hugging Face and PyPI have no in-webview player.
   */
  readonly embeddable: boolean;
}

export const providers: Readonly<Record<VideoProvider, Provider>> = {
  youtube: {
    name: "YouTube",
    origin: "https://www.youtube-nocookie.com",
    path: "/embed/",
    pathPattern: /^\/embed\/[A-Za-z0-9_-]{11}$/,
    embeddable: false,
  },
  bilibili: {
    name: "Bilibili",
    origin: "https://player.bilibili.com",
    path: "/player.html",
    pathPattern: /^\/player\.html$/,
    embeddable: true,
  },
  huggingface: {
    name: "Hugging Face",
    origin: "https://huggingface.co",
    path: "/",
    pathPattern:
      /^\/(?:[A-Za-z0-9][A-Za-z0-9._-]{0,99}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,99})?)$/,
    embeddable: false,
  },
  pypi: {
    name: "PyPI",
    origin: "https://pypi.org",
    path: "/project/",
    pathPattern: /^\/project\/[A-Za-z0-9._-]+\/?$/,
    embeddable: false,
  },
};

/** Player frames may run scripts and go full screen, nothing else. */
export const PLAYER_SANDBOX =
  "allow-scripts allow-same-origin allow-presentation";

export function playerUrl(video: OnlineVideo): string {
  const provider = providers[video.provider];
  if (video.provider === "huggingface") {
    throw new Error("Hugging Face has no in-webview player");
  }
  if (video.provider === "pypi") {
    throw new Error("PyPI has no in-webview player");
  }
  if (video.provider === "youtube") {
    const url = new URL(`${provider.path}${video.id}`, provider.origin);
    url.searchParams.set("rel", "0");
    if (video.start) {
      url.searchParams.set("start", String(video.start));
    }
    return url.href;
  }
  const url = new URL(provider.path, provider.origin);
  if (video.id.startsWith("BV")) {
    url.searchParams.set("bvid", video.id);
  } else {
    url.searchParams.set("aid", video.id.slice(2));
  }
  url.searchParams.set("p", String(video.part ?? 1));
  url.searchParams.set("autoplay", "0");
  return url.href;
}

/** True only for a URL `playerUrl` could have produced. */
export function isPlayerUrl(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return Object.values(providers).some(
    (provider) =>
      url.origin === provider.origin &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      provider.pathPattern.test(url.pathname),
  );
}

export function playerAttributes(video: OnlineVideo): Record<string, string> {
  const src = playerUrl(video);
  if (!isPlayerUrl(src)) {
    throw new Error(`Refusing player URL ${src}`);
  }
  return {
    src,
    sandbox: PLAYER_SANDBOX,
    allow: "fullscreen; picture-in-picture; encrypted-media",
    allowfullscreen: "",
    referrerpolicy: "strict-origin-when-cross-origin",
    loading: "lazy",
    title: `${providers[video.provider].name} video ${video.id}`,
  };
}

/** YouTube's still for the video; other covers need an API call, so none. */
export function thumbnailUrl(video: OnlineVideo): string | undefined {
  return video.provider === "youtube"
    ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
    : undefined;
}
