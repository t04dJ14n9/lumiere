// Writes a sample vault for trying Lumière on a device or in a browser: a
// small knowledge base of linked notes (projects, research, people, daily
// notes), the editor's feature notes (packages/markdown's test vault, under
// Features/), and PDFs with real text in Attachments/. Disposable: it is made
// for testing, never a reader's notes.
//
//   node apps/ipad/scripts/sample-vault.mjs <folder>
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outlinePdf } from "../../../packages/pdf/test/fixtures/make-fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FEATURES = path.join(
  here,
  "../../../packages/markdown/test/fixtures/vault",
);

const NOTES = {
  "Start here.md": `---
tags: [home]
---
# Start here

A small knowledge vault for trying Lumière: projects, research, people and
daily notes that link to each other, with papers as PDFs in Attachments.

## Areas

- [[Garden redesign]]: spring planting, soil and budget
- [[Kyoto trip]]: two weeks in April
- [[Photosynthesis]] and [[Soil pH]], for the garden
- [[Reading list]]: papers to read, as PDFs
- People: [[Ada Park]], [[Ken Ito]]
- Daily notes: [[2026-10-24]], [[2026-10-25]], [[2026-10-26]]

## This week

- [ ] Order compost and bark mulch #garden
- [ ] Book the ryokan in Arashiyama #travel
- [x] Read [[Light and growth.pdf]]

## Projects

| Project | Status | Due | Owner |
| --- | --- | --- | --- |
| [[Garden redesign]] | Active | 2027-03-01 | [[Ada Park]] |
| [[Kyoto trip]] | Planning | 2027-04-02 | [[Ken Ito]] |

> [!tip] Feature tour
> The notes in Features show every kind of Markdown the editor renders:
> start at [[Features/Welcome|the feature list]].
`,
  "Projects/Garden redesign.md": `---
status: active
due: 2027-03-01
budget: 1200
tags: [garden, project]
owner: "[[Ada Park]]"
---
# Garden redesign

Turn the back lawn into four raised beds and a strip of native flowers.
The plan follows [[Planting guide.pdf]], and the soil work comes from
[[Soil pH]].

## Goals

1. Four beds of 1.2 x 2.4 m, 40 cm deep
2. A pollinator strip along the fence
3. Drip watering on a timer

## Budget

| Item | Count | Each | Total |
| --- | ---: | ---: | ---: |
| Cedar boards | 24 | 18 | 432 |
| Soil and compost (m³) | 3 | 95 | 285 |
| Drip kit | 1 | 140 | 140 |
| Seeds and plugs | 1 | 210 | 210 |

## Tasks

- [x] Measure the lawn
- [x] Test the soil (pH 6.1, see [[Soil pH]])
- [ ] Order boards #garden
- [ ] Build the beds with [[Ken Ito]]
- [ ] Plant the pollinator strip in March

> [!warning] Frost
> Last frost here is mid-March. Nothing tender goes out before April.

## Log

- [[2026-10-24]]: met [[Ada Park]] about the layout
- [[2026-10-26]]: soil results back
`,
  "Projects/Kyoto trip.md": `---
status: planning
dates: 2027-04-02 to 2027-04-16
tags: [travel, project]
---
# Kyoto trip

Two weeks in April, timed for the late cherry blossom.

## Itinerary

| Days | Where | Stay |
| --- | --- | --- |
| 1-4 | Higashiyama | Machiya near Yasaka |
| 5-7 | Arashiyama | Ryokan by the river |
| 8 | Nara (day trip) | |
| 9-14 | Central Kyoto | Hotel near Shijo |

## To see

- [ ] Philosopher's Path at dawn
- [ ] Fushimi Inari, the upper shrines
- [ ] Moss garden at Saiho-ji (needs a postcard booking)
- [ ] A tea ceremony with [[Ken Ito]]'s friend

> [!note] Rail
> The Kyoto city bus pass no longer exists; a Suica card covers buses and
> subways.

\`\`\`mermaid
flowchart LR
  Kansai[Kansai airport] -->|Haruka| Kyoto
  Kyoto --> Arashiyama
  Kyoto --> Nara
  Arashiyama --> Kyoto
\`\`\`
`,
  "Research/Photosynthesis.md": `---
tags: [research, garden]
---
# Photosynthesis

Plants turn light, water and carbon dioxide into sugar and oxygen:

$$6\\,CO_2 + 6\\,H_2O \\xrightarrow{\\text{light}} C_6H_{12}O_6 + 6\\,O_2$$

The light reactions happen in the thylakoids; the Calvin cycle in the
stroma.[^1] More light helps only up to the plant's saturation point, which
is why the shade beds in [[Garden redesign]] get leafy greens.

\`\`\`mermaid
flowchart TD
  Light --> Thylakoid[Light reactions]
  Water --> Thylakoid
  Thylakoid -->|ATP, NADPH| Calvin[Calvin cycle]
  CO2 --> Calvin
  Calvin --> Sugar
  Thylakoid --> Oxygen
\`\`\`

## Related

- [[Soil pH]]: why roots cannot take up iron above pH 7
- [[Light and growth.pdf]]: the paper this note summarises

[^1]: See section 2 of [[Light and growth.pdf]].
`,
  "Research/Soil pH.md": `---
tags: [research, garden]
---
# Soil pH

Most vegetables like soil between pH 6.0 and 7.0. Our test read **6.1**, so
the beds need nothing but compost.

| Plant | Best pH |
| --- | --- |
| Blueberry | 4.5-5.5 |
| Potato | 5.0-6.0 |
| Tomato | 6.0-6.8 |
| Lettuce | 6.0-7.0 |
| Lavender | 6.5-7.5 |

> [!info] Raising and lowering
> Lime raises pH over months; sulfur lowers it. Change it slowly.

Used by [[Garden redesign]]. Background in [[Photosynthesis]].
`,
  "Research/Reading list.md": `---
tags: [research, reading]
---
# Reading list

Papers and guides kept in Attachments. A link opens the PDF in a tab.

- [x] [[Light and growth.pdf]]: light intensity and leaf growth
- [ ] [[Planting guide.pdf]]: spacing and timing for raised beds
- [ ] [[Field handbook.pdf]]: a long handbook with a table of contents
- [ ] [[Features/attachments/sample.pdf|A one-page sample]]

Notes on each go in [[Photosynthesis]] and [[Soil pH]].
`,
  "People/Ada Park.md": `---
role: Garden designer
tags: [person]
---
# Ada Park

Garden designer; drew the layout for [[Garden redesign]].

- Prefers native plants and no-dig beds
- Met on [[2026-10-24]]
`,
  "People/Ken Ito.md": `---
role: Neighbour and carpenter
tags: [person]
---
# Ken Ito

Builds the beds for [[Garden redesign]], and has a friend in Kyoto for the
[[Kyoto trip]].
`,
  "Daily/2026-10-24.md": `# Saturday 24 October

- Met [[Ada Park]] about [[Garden redesign]]: four beds, not three
- Started [[Light and growth.pdf]] #reading

> [!quote]
> The best time to plant a tree was twenty years ago.
`,
  "Daily/2026-10-25.md": `# Sunday 25 October

- Priced cedar boards; updated the budget in [[Garden redesign]]
- Looked at ryokans for the [[Kyoto trip]] #travel
- [ ] Ask [[Ken Ito]] about Saturday
`,
  "Daily/2026-10-26.md": `# Monday 26 October

- Soil results: pH 6.1, see [[Soil pH]]
- Idea: a herb bed by the kitchen door #idea
`,
  "Ideas/Inbox.md": `# Inbox

Quick thoughts to sort later.

- A rain barrel off the shed gutter #garden #idea
- Learn to sharpen chisels before the beds #idea
- Photograph the beds each month for a time-lapse
`,
};

/** Text pages as a PDF, Helvetica on US Letter: each page a list of lines. */
function textPdf(title, pages) {
  const objects = [];
  // An object's number is its place in the list, from 1.
  const add = (body) => objects.push(body);
  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const bold = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  );
  const kids = [];
  pages.forEach((lines, index) => {
    let y = 730;
    const ops = [];
    for (const line of [...lines, "", `${title}, page ${index + 1}`]) {
      const heading = line.startsWith("# ");
      const text = (heading ? line.slice(2) : line).replace(
        /[\\()]/g,
        (c) => `\\${c}`,
      );
      const size = heading ? 18 : 11;
      y -= heading ? 30 : 16;
      ops.push(
        `BT /${heading ? "F2" : "F1"} ${size} Tf 72 ${y} Td (${text}) Tj ET`,
      );
    }
    const content = ops.join("\n");
    const contentId = add(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> >>`,
      ),
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, index) => {
    const offset = out.length;
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Wrap a paragraph to lines of about `width` characters. */
function wrap(paragraph, width = 88) {
  const lines = [];
  let line = "";
  for (const word of paragraph.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return line ? [...lines, line] : lines;
}

const page = (...blocks) =>
  blocks.flatMap((block) =>
    block.startsWith("# ") ? [block] : [...wrap(block), ""],
  );

const PDFS = {
  "Light and growth.pdf": textPdf("Light and growth", [
    page(
      "# Light and growth",
      "A sample paper for trying Lumiere. Its text is made up for the sample vault and describes no real study.",
      "# 1. Summary",
      "Leaf area grew with light up to about 400 micromoles of photons per square metre per second, and then levelled off. Above that point, more light raised leaf temperature without adding growth.",
    ),
    page(
      "# 2. The two stages",
      "The light reactions in the thylakoid membranes split water and make ATP and NADPH. The Calvin cycle in the stroma uses them to fix carbon dioxide into sugar.",
      "When light is short, the light reactions limit the rate. When light is plentiful, the Calvin cycle and the supply of carbon dioxide limit it instead.",
    ),
    page(
      "# 3. For the garden",
      "Leafy greens reach their saturation point early, so they do well in beds with four to six hours of sun. Fruiting plants such as tomatoes need more.",
      "Water, temperature and soil pH matter as much as light: roots cannot take up iron above about pH 7, and the leaves yellow whatever the sun.",
    ),
    page("# 4. References", "None: this is a sample document."),
  ]),
  "Planting guide.pdf": textPdf("Planting guide", [
    page(
      "# Planting guide for raised beds",
      "Spacing and timing for a 1.2 by 2.4 metre bed. Sample text for the Lumiere sample vault.",
      "# Spacing",
      "Lettuce 25 cm. Carrots 5 cm in rows 20 cm apart. Bush beans 15 cm. Tomatoes 60 cm, staked. Basil 25 cm, between the tomatoes.",
    ),
    page(
      "# When to sow",
      "Peas and spinach: as soon as the soil can be worked. Lettuce and carrots: two weeks before the last frost. Beans, tomatoes and basil: after the last frost, once nights stay above 10 degrees.",
      "# Watering",
      "About 2.5 cm of water a week, more in hot weather. Drip lines under mulch lose the least to evaporation.",
    ),
  ]),
  "Field handbook.pdf": outlinePdf(),
};

const target = process.argv[2];
if (!target) {
  console.error("Usage: node apps/ipad/scripts/sample-vault.mjs <folder>");
  process.exit(1);
}
for (const [name, text] of Object.entries(NOTES)) {
  const file = path.join(target, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}
mkdirSync(path.join(target, "Attachments"), { recursive: true });
for (const [name, bytes] of Object.entries(PDFS)) {
  writeFileSync(path.join(target, "Attachments", name), bytes);
}
cpSync(FEATURES, path.join(target, "Features"), { recursive: true });
console.log(`Wrote the sample vault to ${target}`);
