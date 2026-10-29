import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SketchFormatError,
  encodeSketch,
  isSketchPath,
  sketchFromSvg,
  sketchToSvg,
  strokePathData,
  strokeSvg,
  withPencilKit,
} from "../../src/format";
import { horizontalStroke, point, sketchOf } from "./helpers";

test("a sketch survives being written as SVG and read back", () => {
  const sketch = withPencilKit(
    {
      ...sketchOf([
        horizontalStroke([2, 8, 2]),
        horizontalStroke([5], "marker"),
      ]),
      paper: { style: "ruled", spacing: 32, color: "#fffdf5" },
    },
    "UEtEcmF3aW5n",
  );
  assert.deepEqual(sketchFromSvg(sketchToSvg(sketch)), sketch);
});

test("the SVG draws each stroke as the outline of its stored widths", () => {
  const stroke = horizontalStroke([2, 12, 2]);
  const svg = sketchToSvg(sketchOf([stroke]));
  assert.ok(svg.includes(`d="${strokePathData(stroke.points)}"`));
  assert.ok(svg.includes(`fill="#1f2328"`));
  assert.ok(!svg.includes("stroke-width"), "strokes are filled, not stroked");
});

test("the SVG is a standalone image of the sketch's size", () => {
  const svg = sketchToSvg({ ...sketchOf([]), width: 640, height: 360.5 });
  assert.match(
    svg,
    /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="640" height="360\.5" viewBox="0 0 640 360\.5">/,
  );
  assert.ok(svg.trimEnd().endsWith("</svg>"));
  assert.ok(svg.includes(`<rect width="640" height="360.5" fill="#ffffff"/>`));
});

test("a pencil stroke keeps its shading as pieces of different opacity", () => {
  const stroke = {
    tool: "pencil" as const,
    color: "#202020",
    points: [0.2, 0.2, 0.5, 0.9, 0.9].map((opacity, index) =>
      point(index * 10, 0, { opacity }),
    ),
  };
  const svg = strokeSvg(stroke);
  assert.match(svg, /^<g fill="#202020">/);
  const opacities = [...svg.matchAll(/fill-opacity="([\d.]+)"/g)].map((m) =>
    Number(m[1]),
  );
  assert.deepEqual(opacities, [0.2, 0.5, 0.9]);
  assert.equal(svg.match(/<path/g)?.length, 3);
});

test("a colour's alpha becomes the fill's opacity, and markers multiply", () => {
  const stroke = {
    tool: "marker" as const,
    color: "#ffd70080",
    points: [point(0, 0, { opacity: 0.5 }), point(10, 0, { opacity: 0.5 })],
  };
  const svg = strokeSvg(stroke);
  assert.match(svg, /fill="#ffd700" fill-opacity="0.251"/);
  assert.match(svg, /mix-blend-mode:multiply/);
});

test("paper styles draw as lines, a grid or dots, and none draws nothing", () => {
  const page = (
    style: "plain" | "ruled" | "grid" | "dotted",
    color = "#ffffff",
  ) =>
    sketchToSvg({
      ...sketchOf([]),
      width: 100,
      height: 70,
      paper: { style, spacing: 30, color },
    });
  assert.ok(!page("plain").includes("<path"));
  assert.ok(page("ruled").includes(`d="M0 30.5H100M0 60.5H100"`));
  assert.ok(page("grid").includes("M30.5 0V70M60.5 0V70M90.5 0V70"));
  assert.ok(page("dotted").includes(`M30 30h0M60 30h0M90 30h0M30 60h0`));
  assert.ok(!page("plain", "none").includes("<rect"));
});

test("the metadata cannot close its CDATA early, whatever the strings hold", () => {
  const sketch = {
    ...sketchOf([]),
    pencilKit: { data: "AAAA", strokes: "]]><script/>" },
  };
  const svg = sketchToSvg(sketch);
  const start = svg.indexOf("<![CDATA[") + "<![CDATA[".length;
  const cdata = svg.slice(start, svg.indexOf("]]>", start));
  assert.ok(!cdata.includes(">") && !cdata.includes("<"));
  assert.equal(
    JSON.parse(cdata).pencilKit.strokes,
    "]]><script/>",
    "the JSON still means the same",
  );
});

test("metadata written back by an SVG editor as escaped text still reads", () => {
  const sketch = sketchOf([horizontalStroke([3, 3])]);
  const json = encodeSketch(sketch)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:ns0="https://github.com/t04dJ14n9/lumiere/sketch">
  <metadata id="m1">
    <ns0:sketch>${json}</ns0:sketch>
  </metadata>
</svg>`;
  assert.deepEqual(sketchFromSvg(svg), sketch);
});

test("an SVG drawn elsewhere is not a sketch", () => {
  assert.throws(
    () =>
      sketchFromSvg(
        `<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>`,
      ),
    SketchFormatError,
  );
  assert.throws(
    () => sketchFromSvg(`<svg><metadata><rdf:RDF/></metadata></svg>`),
    SketchFormatError,
  );
  assert.throws(
    () =>
      sketchFromSvg(
        `<svg><metadata><sketch>&#x110000;</sketch></metadata></svg>`,
      ),
    SketchFormatError,
  );
});

test("sketch files are named *.sketch.svg, in any case", () => {
  assert.ok(isSketchPath("Sketches/2026-10-22 14.03.sketch.svg"));
  assert.ok(isSketchPath("A.Sketch.SVG"));
  assert.ok(!isSketchPath("diagram.svg"));
  assert.ok(!isSketchPath("notes.sketch.svg.md"));
});
