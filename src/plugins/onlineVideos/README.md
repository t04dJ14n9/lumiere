# Online Videos

YouTube and Bilibili links written as images show as video cards:
`![Title](https://www.youtube.com/watch?v=ID)`, `https://youtu.be/ID`,
Shorts, `/embed/` and `/live/` links (with `t=` or `start=`), and
`![](https://www.bilibili.com/video/BV…)` or `…/video/av123`, with `?p=` for
a part. Obsidian has no equivalent (it shows such links as broken images);
local video (`![[clip.mp4]]`) stays with Embeds.

A card shows the alt text as its title (else "YouTube video" or "Bilibili
video"), the provider and ID, and **Open on YouTube/Bilibili**, which asks the
host (Links RPC `open`) to open the page in the external browser. The card
uses buttons rather than `<a href>`: VS Code's webview opens every clicked
anchor itself as well, which would open the page twice. In a trusted workspace a YouTube
card also shows the video's still, and a Bilibili card offers **Play here**,
which swaps in the provider's player. In an untrusted workspace there is no
player and no remote image, and the card says so. The caret on the link
reveals its Markdown, as for images.

## How it works

`parse.ts` accepts only the hosts and path shapes above and validated IDs
(11 characters of `[A-Za-z0-9_-]` for YouTube, `BV` plus 10 alphanumerics or
`av` digits for Bilibili). `player.ts` builds the player URL from the parsed
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

## Players in a VS Code webview

Checked in VS Code 1.141 (Electron 43, Chromium 150) on 2026-10-09:

- YouTube refuses to play: "Video player configuration error, Error 153",
  for both `youtube-nocookie.com` and `youtube.com`, with or without
  `origin`/`widget_referrer`. Webview pages are not http(s), so the player
  gets no referrer. Cards therefore offer no player for YouTube.
- Bilibili's player loads its title, length and danmaku but the video never
  buffers (`readyState` 0, media segment requests aborted), with or without
  a sandbox; the same sandboxed frame plays in Chromium, and an H.264 file
  plays inside the frame, so codecs are not the cause. **Play here** stays
  because it may play in other hosts; the browser link stays beside it.

## Files

- `manifest.ts`: enablement.
- `webview.ts`: the post-processor that swaps images for cards.
- `parse.ts`: link recognition and ID validation.
- `player.ts`: providers, player URLs, the allowlist, frame attributes and
  thumbnails.
- `card.ts`: the card and the Play here swap.
- `parse.test.ts`, `player.test.ts`: unit tests;
  `test/browser/online-videos.spec.ts`: cards, reveal, Play here and trust.
- `onlineVideos.css`: cards and frames, bundled through
  `src/webview/styles/index.css`.

## Services, events and settings

Injects `render` (for workspace trust) and `rpc` (Links `open`); provides
no services. Listens to
`render/postProcess`. `markdownWorkbench.plugins.onlineVideos.enabled`
defaults to true; switched off, the links fall back to Embeds (a remote
image).

## Limits

No Bilibili covers or titles (they need Bilibili's API). Playlists,
channels, Bilibili bangumi and other providers are left as images.
