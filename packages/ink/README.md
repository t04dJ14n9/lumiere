# @workshop/ink

Lumière's ink: the sketch file format, the outlines that draw it, and the
`ink` host service a canvas provides. It knows nothing of Markdown or of any
host; the iPad app (`apps/ipad`) provides the service on PencilKit, and the
`sketch` Markdown plugin uses it. See [docs/IPAD_PLAN.md](../../docs/IPAD_PLAN.md)
section 5.

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

## Files

- `src/format/types.ts`: the sketch, its strokes, points and paper.
- `src/format/encoding.ts`: the metadata's JSON, the fingerprint and PencilKit's data.
- `src/format/validation.ts`: checks a stored sketch; nothing in a file is trusted.
- `src/format/outline.ts`: the variable-width outline of a stroke, and its SVG path.
- `src/format/paper.ts`: the page behind the strokes.
- `src/format/svg.ts`: writing and reading `*.sketch.svg`.
- `src/service/ink.ts`: the `ink` host service.

`src/format` and `src/service` are pure: no DOM, Node or host APIs.

## Limits

- PencilKit's textures (the pencil's grain, watercolour) are not drawn in
  the SVG; pencil shading is kept as opacity.
- Strokes are drawn as on light paper; dark themes show the paper's colour.
- A page of handwriting stores a few hundred kilobytes to a few megabytes:
  every point is kept, raw, so another engine can redraw it.
