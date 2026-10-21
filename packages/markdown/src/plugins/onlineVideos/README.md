# Online Videos

YouTube, Bilibili, Hugging Face, Spotify, SoundCloud, npm, Vimeo and TED links
written as images show as video cards: `![Title](https://www.youtube.com/watch?v=ID)`,
`https://youtu.be/ID`, Shorts, `/embed/` and `/live/` links (with `t=` or
`start=`), YouTube playlists (`/playlist?list=` and
`/embed/videoseries?list=`), YouTube channels (`/channel/UC…`, `/@handle`,
`/c/…`, or `/user/…`), `![](https://www.bilibili.com/video/BV…)` or
`…/video/av123`, with `?p=` for a part, bangumi `…/bangumi/play/ep…` or
`…/ss…`, Bilibili UP spaces `![](https://space.bilibili.com/{mid})`
(or `m.bilibili.com/space/{mid}`), Bilibili live rooms
`![](https://live.bilibili.com/{room})`, Hugging Face
`![](https://huggingface.co/{owner}/{model})` (or a single-segment model id;
`/tree/…` normalised away), Spotify
`open.spotify.com/{track|album|playlist|episode|show}/…`, SoundCloud
`soundcloud.com/{user}/{track}` or `…/sets/{playlist}`, and npm
`www.npmjs.com/package/{name}` (scoped `@scope/name`, optional `/v/{version}`),
and Vimeo `vimeo.com/{id}` or `player.vimeo.com/video/{id}`, and TED
`ted.com/talks/{slug}` or `embed.ted.com/talks/{slug}`.
Obsidian has no equivalent (it shows such links as broken images); local video
(`![[clip.mp4]]`) stays with Embeds.

A card shows a title (the alt text, else the provider's title, else "YouTube
video", "Bilibili video", "Bilibili space", "Bilibili live", "Hugging Face
video", "Spotify track/…", "SoundCloud track/playlist", "npm video", "Vimeo
video", or "TED talk"), the
provider with the author and length (or the ID), and **Open on
YouTube/Bilibili/Hugging Face/Spotify/SoundCloud/npm/Vimeo/TED** (or **Open space** /
**Open live on Bilibili**), which asks
the host (Links RPC `open`) to open the page in the external browser. The
card uses buttons rather than `<a href>`: VS Code's webview opens every
clicked anchor itself as well, which would open the page twice. In a trusted
workspace a YouTube card shows the video's still (`i.ytimg.com`, derived
from the ID) and a Bilibili card the video's cover, the UP's face, or the
live room's cover/keyframe. A
YouTube playlist card says **Open playlist** and may show the oEmbed
thumbnail. A YouTube channel card says **Open channel on YouTube** (no
cover — channels have no keyless oEmbed). Spotify, SoundCloud, Vimeo and TED cards may
show an oEmbed cover. Hugging Face and npm cards have no cover. In an
untrusted workspace nothing is fetched: no title, cover, still or player,
and the card says so. The caret on the link reveals its Markdown, as for
images.

**Play here** (Bilibili only) is off by default because Bilibili's player
does not play in VS Code (below). `lumiere.markdown.onlineVideos.bilibiliPlayer`
turns it back on in trusted workspaces; it then swaps in the provider's
player.

## How it works

`parse.ts` accepts only the hosts and path shapes above and validated IDs
(11 characters of `[A-Za-z0-9_-]` for YouTube videos, a `PL`/`UU`/`LL`/`FL`/
`OL`/`RD` prefix plus 10–64 characters for playlists, `UC…` / `@handle` /
`c:…` / `user:…` for channels, `BV` plus 10 alphanumerics or `av` digits for
Bilibili, `ep…` / `ss…` for bangumi, `space:{mid}` for UP spaces,
`live:{room}` for live rooms, Hugging Face model ids, Spotify
`type:22-char` ids, SoundCloud `user/slug` paths, npm package names, numeric
Vimeo ids, TED talk slugs).
`player.ts` builds the player URL from the parsed
ID on `www.youtube-nocookie.com/embed/` or `player.bilibili.com/player.html`
(`autoplay=0`), checks it against that allowlist again, and gives the frame
`sandbox="allow-scripts allow-same-origin allow-presentation"`,
`referrerpolicy="strict-origin-when-cross-origin"` and `loading="lazy"`. No
frame is ever made from the link text. The Render sanitizer and
`constrainRemoteContent` are unchanged: they still decide which iframes
written in a note's HTML survive (only https frames, sandboxed, and only in a
trusted workspace).

A `render/postProcess` listener, registered before Embeds, replaces each
`img.note-image` whose `data-resource` parses as a video with a card, and
puts the image back when the pass is disposed.

### Titles and covers

Bilibili covers, UP faces, live room covers and Hugging Face model metadata
have no URL derived
from the ID alone, and the webview CSP allows no network (`connect-src` is
the webview only), so the extension host looks them up (`host.ts`,
`details.ts`) when a trusted card asks over the `onlineVideos.details` RPC:

- Bilibili videos: `https://api.bilibili.com/x/web-interface/view?bvid=…`
  (or `aid=`), reading `data.title`, `data.owner.name`, `data.duration` and
  `data.pic`. Bilibili space: `…/x/web-interface/card?mid=…`, reading
  `data.card.name` and `data.card.face`. Bilibili live:
  `api.live.bilibili.com/room/v1/Room/get_info?room_id=…`, reading
  `data.title` and `data.user_cover` or `data.keyframe` (scaled cover with
  raw fallback when the scaler 404s). Covers and faces are fetched only
  from `i0`–`i2.hdslb.com` under `/bfs/`, scaled by Bilibili to 480×270
  (`@480w_270h_1c.jpg`, about 25 KB), limited to 512 KB, typed by its
  JPEG/PNG/GIF/WebP signature and handed to the webview as a `data:` URL,
  so `img-src` is not loosened.
- Bilibili bangumi: `https://api.bilibili.com/pgc/view/web/season` with
  `ep_id=` or `season_id=`; episode titles combine season + long title,
  duration is converted from milliseconds, cover from the episode or season.
- YouTube videos and playlists: keyless oEmbed
  (`https://www.youtube.com/oembed`) for the title and channel; the video
  still stays the ID-derived `i.ytimg.com` image. Playlists may show that
  thumbnail as a cover. A watch URL that also has `list=` stays a single
  video. Channels (`/channel/UC…`, `/@handle`, `/c/…`, `/user/…`) have no
  oEmbed — the card keeps alt text or the channel id.
- Hugging Face: keyless `https://huggingface.co/api/models/{id}` for
  `pipeline_tag` / model id and `author` (else the owner segment). No cover.
  Datasets and Spaces stay images.
- Spotify: keyless oEmbed (`https://open.spotify.com/oembed`) for title and
  cover (`i.scdn.co` / `*.spotifycdn.com`); no in-webview player.
- SoundCloud: keyless oEmbed (`https://soundcloud.com/oembed`) for title,
  author and cover (`i1`–`i4.sndcdn.com`); no in-webview player.
- Vimeo: keyless oEmbed (`https://vimeo.com/api/oembed.json`) for the title,
  author, duration and thumbnail. Thumbnails are fetched only from
  `i.vimeocdn.com` (query params allowed), limited to 512 KB, typed by
  signature and handed over as a `data:` URL; no in-webview player.
- TED: keyless oEmbed (`https://www.ted.com/services/v1/oembed.json`) for the
  title, speaker and thumbnail. Thumbnails are fetched only from
  `pi.tedcdn.com` / `pe.tedcdn.com` (query params allowed), limited to 512 KB,
  typed by signature and handed over as a `data:` URL; no in-webview player.

The host refuses the RPC in an untrusted workspace (and the webview does not
ask), checks the ID again, sends `User-Agent: MarkdownWorkshop (VS Code
extension)` (Bilibili answers 412 to browser-like agents from non-browsers),
refuses redirects, gives each lookup 5 s, runs at most four at once, caches
answers for the window (200 videos) and remembers failures for 5 minutes.
Any failure, offline included, leaves the card as it was; a failed cover
still leaves the title.

## Players in a VS Code webview

Checked in VS Code 1.141 (Electron 43, Chromium 150) on 2026-10-09:

- YouTube refuses to play: "Video player configuration error, Error 153",
  for both `youtube-nocookie.com` and `youtube.com`, with or without
  `origin`/`widget_referrer`. Webview pages are not http(s), so the player
  gets no referrer. Cards therefore offer no player for YouTube.
- Bilibili's player loads its title, length and danmaku but the video never
  buffers (`readyState` 0, media segment requests aborted), with or without
  a sandbox; the same sandboxed frame plays in Chromium, and an H.264 file
  plays inside the frame, so codecs are not the cause. **Play here** is
  therefore behind `bilibiliPlayer` (off), in case it plays in other hosts;
  the browser link stays beside it.

## Files

- `manifest.ts`: enablement and the `bilibiliPlayer` setting.
- `webview.ts`: the post-processor that swaps images for cards and asks the
  host for details (once per video per editor).
- `host.ts`: the trusted-only `details` RPC handler.
- `details.ts`: provider lookups, cover fetches, timeout, concurrency
  and cache.
- `bilibili.ts`: Bilibili view, bangumi season, UP space card and live room
  parsing, and hdslb cover URLs.
- `imageData.ts`: image signatures and cover data URLs.
- `thumbnails.ts`: oEmbed / Spotify / SoundCloud / Vimeo / TED cover URL allowlists.
- `oembed.ts`: oEmbed (incl. Vimeo duration) and Hugging Face model title/author parsing.
- `soundcloud.ts`: SoundCloud track/set URL recognition.
- `vimeo.ts`: Vimeo video URL recognition.
- `ted.ts`: TED talk URL recognition.
- `protocol.ts`: the `details` request.
- `meta.ts`: the card's author and length line.
- `parse.ts`: link recognition and ID validation.
- `player.ts`: providers, player URLs, the allowlist, frame attributes and
  thumbnails.
- `card.ts`: the card, details and the Play here swap.
- `parse.test.ts`, `player.test.ts`, `details.test.ts` (fake fetch),
  `meta.test.ts`, `host.test.ts`: unit tests;
  `test/browser/online-videos.spec.ts`: cards, covers, failures, reveal,
  Play here and trust.
- `onlineVideos.css`: cards and frames, bundled through
  `src/webview/styles/index.css`.

## Services, events and settings

The webview half injects `render` (for workspace trust) and `rpc` (Links
`open`, `onlineVideos.details`); the host half injects `rpc` and
the host service `workspace`. No services. Listens to `render/postProcess`.
`lumiere.markdown.plugins.onlineVideos.enabled` defaults to true; switched
off, the links fall back to Embeds (a remote image).
`lumiere.markdown.onlineVideos.bilibiliPlayer` defaults to false.

## Limits

Bilibili multi-part links (`?p=`) use the view API page title (series · part).
Lookups depend on Bilibili's, YouTube's, Hugging Face's, Spotify's,
SoundCloud's, npm's, Vimeo's and TED's public endpoints, which may change or
rate-limit.
YouTube playlists (`/playlist?list=` and embed videoseries), YouTube channels
(`/channel/UC…`, `/@handle`, `/c/…`, `/user/…`), Bilibili bangumi
(`/bangumi/play/ep…` / `ss…`), and Bilibili UP spaces (`space.bilibili.com/{mid}`)
render as cards. Channels, bangumi, spaces, Hugging Face, Spotify,
SoundCloud, npm, Vimeo and TED have no in-webview player (Open on provider only;
spaces use **Open space on Bilibili**). Hub redirects (legacy single-segment model
ids) fail the host lookup because redirects are refused; the card still
opens the page.
Spotify uses keyless oEmbed (`https://open.spotify.com/oembed`) for title
and CDN cover. SoundCloud uses keyless oEmbed
(`https://soundcloud.com/oembed`) for title and sndcdn cover. npm uses
the keyless registry for description and author. Vimeo uses keyless oEmbed
(`https://vimeo.com/api/oembed.json`) for title, author, duration and
`i.vimeocdn.com` cover. TED uses keyless oEmbed
(`https://www.ted.com/services/v1/oembed.json`) for title, speaker and
`pi.tedcdn.com` / `pe.tedcdn.com` cover.
