# @workshop/ink

Lumière's ink: the sketch file format, the outlines that draw it, the
`ink` host service a canvas provides, and the web canvas that provides it
in a browser. It knows nothing of Markdown or of any host. The iPad app
(`apps/ipad`) provides the service on PencilKit; the desktop and web apps
on the web canvas; the `sketch` Markdown plugin uses it. See
[docs/IPAD_PLAN.md](../../docs/IPAD_PLAN.md) section 5.

## The sketch file

A sketch is one file, `*.sketch.svg`, that shows as drawn in any SVG viewer
(Obsidian, GitHub, VS Code, a browser) and edits in Lumière.

- **The SVG** draws each stroke as a filled outline whose width follows the
  width stored at each of its points, so pressure shows everywhere. A stroke
  whose opacity changes along it (pencil shading) is cut into pieces of
  nearly equal opacity that meet exactly. A marker multiplies. The paper
  (plain, ruled, grid or dotted) is drawn behind the strokes.
- **`<metadata>`** holds the portable strokes as JSON, in a
  `lumiere:sketch` element (namespace `https://github.com/t04dJ14n9/lumiere/sketch`):

  ```json
  {
    "format": "lumiere-sketch",
    "version": 1,
    "width": 720,
    "height": 480,
    "paper": { "style": "ruled", "spacing": 32, "color": "#ffffff" },
    "fields": ["x", "y", "t", "force", "altitude", "azimuth", "width", "opacity"],
    "strokes": [{ "tool": "pen", "color": "#1f2328", "points": [12.5, 40, 0, 0.42, 1.2, 0.8, 3.1, 1] }],
    "pencilKit": { "data": "<base64>", "strokes": "1:1:9c0e2a41" }
  }
  ```

  - Each stroke's points are one flat list, in the order `fields` names.
    Readers find fields by name: a later version may add fields, and
    missing optional ones (`t`, `force`, `altitude`, `azimuth`, `opacity`)
    take defaults.
  - A point maps one to one onto PencilKit's `PKStrokePoint`: position, time
    since the stroke began (seconds), force (0 to 1, Pointer Events'
    pressure scale: PencilKit's force divided by the Pencil's maximum),
    altitude and azimuth (radians, as UIKit defines them), and the width
    and opacity the ink drew there.
  - Tools are PencilKit's inks: `pen`, `fountainPen`, `pencil`, `marker`,
    `monoline`, `watercolor`, `crayon`, `reed`. An unknown tool reads as
    `pen`.
  - Colours are `#rrggbb` or `#rrggbbaa`, as drawn on light paper.
  - `pencilKit` is PencilKit's own drawing data, so the iPad reopens a
    sketch exactly as drawn. `strokes` is the fingerprint of the strokes it
    was saved with; when they change elsewhere, the data is dropped on
    reading and the iPad rebuilds the drawing from the strokes.

## The web canvas

`webInk()` (`@workshop/ink/canvas`) is the `ink` service in a browser: a
canvas over the whole window, laid out as the iPad's (Cancel, the sketch's
name, undo, redo and Done above; the page, filling the width; the tools
floating below).

- **Input.** Pointer Events, with the samples the browser coalesced. A pen
  tablet draws with its own pressure and tilt; a mouse, trackpad or finger
  reads no pressure, so the line thins as it speeds up (`speed.ts`, on the
  model of perfect-freehand's simulated pressure). Every point keeps the raw
  input (force as read, altitude, azimuth, time) and the width and opacity
  drawn there; samples closer than 0.75 points replace the last point
  rather than pile up.
- **Inks.** Pen (thickens as it presses), pencil (shades darker as it
  presses, broader as it tilts), marker (broad and even, multiplying), each
  in three widths and six colours, and an eraser that removes whole
  strokes. A pen's eraser end erases too. The tools chosen last are kept
  while the window lives.
- **Drawn as the file draws.** The canvas fills the format's own outlines
  (`strokeFills`) and paper (`paperMarks`), so what is drawn is what the
  SVG shows.
- **The page** fills the width (at most 1.5 CSS pixels per point), scrolls,
  and grows downwards to hold what is drawn below it. Two canvases the size
  of the view, not the page, draw it: one for the page and its strokes, one
  for the stroke being drawn.
- **Like the iPad:** once a pen has drawn, a finger scrolls; a finger
  drawing when a pen comes down was a palm. Undo and redo (⌘Z, ⇧⌘Z) are the
  canvas's own. Cancel asks before dropping a drawing; Escape is Cancel and
  ⌘↩ is Done. While it is open, the window's own shortcuts wait.
- **Styled through the CSSOM**, since the windows that host it allow no
  inline `<style>`.

## Files

- `src/format/types.ts`: the sketch, its strokes, points and paper.
- `src/format/encoding.ts`: the metadata's JSON, the fingerprint and PencilKit's data.
- `src/format/validation.ts`: checks a stored sketch; nothing in a file is trusted.
- `src/format/outline.ts`: the variable-width outline of a stroke, and its SVG path.
- `src/format/paper.ts`: the page behind the strokes.
- `src/format/svg.ts`: writing and reading `*.sketch.svg`.
- `src/service/ink.ts`: the `ink` host service.
- `src/canvas/index.ts`: `webInk`, the service in a browser.
- `src/canvas/sketch-canvas.ts`: one canvas, open until Done or Cancel.
- `src/canvas/view.ts`, `palette.ts`, `styles.ts`: its elements, its tools, its looks.
- `src/canvas/pointer.ts`: the pointer on the page: drawing, erasing, a finger scrolling.
- `src/canvas/painter.ts`: the page and strokes on a canvas, from the format's shapes.
- `src/canvas/input.ts`, `speed.ts`, `nibs.ts`, `recorder.ts`: samples, pressure from speed, the inks, a stroke as it is drawn.
- `src/canvas/history.ts`, `erase.ts`, `page.ts`, `keys.ts`: undo, the eraser, the page's size and growth, the keys.

`src/format` and `src/service` are pure: no DOM, Node or host APIs. In
`src/canvas`, everything but `index.ts`, `sketch-canvas.ts`, `view.ts`,
`palette.ts`, `styles.ts`, `pointer.ts` and `painter.ts` is pure too, and
tested under Node.

## Limits

- PencilKit's textures (the pencil's grain, watercolour) are not drawn in
  the SVG; pencil shading is kept as opacity.
- Strokes are drawn as on light paper; dark themes show the paper's colour.
- A page of handwriting stores a few hundred kilobytes to a few megabytes:
  every point is kept, raw, so another engine can redraw it.
- The web canvas has no lasso, ruler or pixel eraser, and does not predict
  the pointer ahead of its samples, as PencilKit does.
