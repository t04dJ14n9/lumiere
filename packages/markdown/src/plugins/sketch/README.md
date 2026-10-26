# Sketches

Draw in a note with Apple Pencil: Insert Sketch opens a canvas over the
note, and Done saves the drawing beside the note and embeds it. Tapping a
sketch opens it again. Obsidian has no equivalent of its own; its
Excalidraw and Ink plugins are the nearest, and Apple Notes' drawings are
the model for how it feels.

## How it works

A sketch is a `*.sketch.svg` file (`@workshop/ink/format`): an SVG every
viewer shows, with the strokes and their pressure kept inside it. The host
half needs a canvas, the `ink` host service, which only some hosts have
(the iPad's PencilKit); elsewhere it waits, and sketches show as images.

- **Insert Sketch** (the right-click menu, and the iPad's edit menu) opens
  the canvas, then writes the drawing to the attachment folder as
  `2026-10-22 14.03.sketch.svg` and embeds it at the caret, in a paragraph
  of its own so Live Preview shows it as a block. Nothing is written if the
  canvas is cancelled.
- **A tap on a sketch** in Live Preview: the page names the embed's link,
  the host resolves it from the note, opens the canvas on the drawing and
  writes the new one over the file. The page then emits
  `resources/changed` and `render/changed`, so the note shows it.

## Files

- `manifest.ts`: the command, its menu item, and the `canDraw` context key.
- `protocol.ts`: the page's questions (`available`, `edit`) and the host's `ready`.
- `host.ts`: the window-level host half: the command, each note's page, the menu key.
- `insert.ts`: Insert Sketch: draw, save in the attachment folder, embed.
- `edit.ts`: editing the sketch an embed shows.
- `placement.ts`: the folder, the file name, the embed's text and where it goes.
- `taps.ts`: which taps are on sketches, taken before embeds selects the image.
- `webview.ts`: the page half: asks whether the host can draw, sends taps.

## Services, events and settings

The host half (once per window) injects `ink`, `editors`, `vaults`,
`hostCommands`, `hostDocuments`, `workspace`, `settings` and `dialogs`; it
waits where the host provides no `ink`. It registers
`lumiere.markdown.insertSketch` and sets the `lumiere.markdown.sketch.canDraw`
context key while it runs. The page half injects `editor` and `rpc`, and
emits `resources/changed` and `render/changed` after a sketch is saved.
`lumiere.markdown.plugins.sketch.enabled` defaults to true. The folder and
link form follow the Links plugin's `attachmentFolder`, `useWikilinks` and
`newLinkFormat` (Obsidian's Files and links settings).

## Limits

- Only where the host has a canvas: the iPad. The desktop and web apps and
  VS Code show sketches as images, without Insert Sketch.
- The canvas opens over the whole note, not in place (docs/IPAD_PLAN.md 5.5).
- A sketch embedded in the middle of a line opens on a tap, but keeps showing
  its old drawing until the line is redrawn.
- Sketches are not resized from the note; a page grows downwards on the canvas.
