import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata/index";
import { noteTags } from "../../../src/markdown/metadata/tags";
import {
  readTag,
  tagMatches,
  validTag,
} from "../../../src/markdown/tags/grammar";
import { protocol } from "../../../src/plugins/tags/protocol";
import { createRenderer } from "../../../src/markdown/html";
const { renderMarkdown } = createRenderer();

/** Every tag `readTag` finds in `text`, in order, without the `#`. */
const readTags = (text: string): string[] =>
  [...text.matchAll(/#/g)].flatMap((hash) => readTag(text, hash.index) ?? []);

/** The tags the vault index records for a note, duplicates included. */
const indexedTags = (source: string): string[] =>
  metadata(source).tags.map(({ tag }) => tag);

/** The tags rendered as tag buttons. */
const renderedTags = (source: string): string[] =>
  [...renderMarkdown(source).matchAll(/data-tag="([^"]*)"/g)].map((match) =>
    match[1]!
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&"),
  );

/**
 * Measured in Obsidian 1.14.4 for every BMP code point c except line breaks
 * and surrogates, plus astral samples, each in its own paragraph: `x{c}#b`,
 * `#i{c}z`, `x #{c}z` and `x #{c}`. Hexadecimal code point ranges.
 */
const measuredCharacters = {
  /** Directly before `#`, only these start a tag. */
  startTag: "9 B-C 20 A0 1680 2000-200A 2028-2029 202F 205F 3000 FEFF",
  /** Inside a tag, these end it; `#` ends it and starts the next. */
  endTag:
    "9 B-C 20-22 24-2C 2E 3A-40 5B-5E 60 7B-7E A0 1680 2000-206F 2E00-2E7F 3000 FEFF",
  /** A tag of only these is not a tag. */
  digits: "30-39",
};
const astralSamples = [
  0x1f600, 0x1f642, 0x1f44d, 0x1f3fd, 0x1f1e8, 0x1d400, 0x20000, 0x10348,
  0xe0061, 0x1f9d1, 0x10fffd, 0x1f4a9, 0x2a6d6,
];

function inRanges(ranges: string, codePoint: number): boolean {
  return ranges.split(" ").some((range) => {
    const [from, to = from] = range.split("-").map((hex) => parseInt(hex, 16));
    return codePoint >= from! && codePoint <= to!;
  });
}

test("tags combine Markdown and YAML, and comments as in Obsidian, while excluding code, escapes and numeric tags", () => {
  const source =
    '---\ntags: [Project/Notes, "#学习", 123]\nother: "#excluded"\n---\n# Heading\n\n#project #🙂 #1984 #y1984 C#code \\#escaped `#code` %%#comment%%\n\n```md\n#fenced\n```';
  assert.deepEqual(
    noteTags(source).sort(),
    // A tag inside a %% comment counts, as Obsidian indexes it (measured).
    ["Project/Notes", "comment", "project", "y1984", "学习", "🙂"].sort(),
  );
  assert.equal(tagMatches("Project/Notes", "PROJECT"), true);
  assert.equal(tagMatches("projectile", "project"), false);
  assert.equal(validTag("1984"), false);
  assert.equal(validTag("two words"), false);
  assert.equal(validTag("Project/Notes"), true);
  assert.equal(validTag("bad\nquery"), false);
  assert.equal(
    protocol.requests.search.params.parse({ tag: "Project/Notes" }).tag,
    "Project/Notes",
  );
  assert.throws(() =>
    protocol.requests.search.params.parse({ tag: "bad\nquery" }),
  );
});

test("rendered tag controls preserve hierarchy and leave code literal", () => {
  const html = renderMarkdown(
    "> [!note] Tags\n> #project/notes and `#code`\n\n| Tag |\n| --- |\n| #学习 |",
  );
  assert.match(html, /data-tag="project\/notes"/);
  assert.match(html, /data-tag="学习"/);
  assert.doesNotMatch(html, /data-tag="code"/);
});

test("tags in footnote definitions remain searchable", () => {
  assert.deepEqual(
    noteTags("Body[^a].\n\n[^a]: #Footnote\n  with `#excluded`"),
    ["Footnote"],
  );
});

test("tags inside inline footnotes are indexed like Obsidian", () => {
  assert.deepEqual(noteTags("See ^[#project and more] here."), ["project"]);
  assert.deepEqual(noteTags("Mix ^[plain #alpha/nested] and #beta."), [
    "alpha/nested",
    "beta",
  ]);
});

test("tag characters match Obsidian over every BMP code point", () => {
  const codePoints = [];
  for (let codePoint = 0; codePoint <= 0xffff; codePoint++) {
    const lineBreak = codePoint === 0x0a || codePoint === 0x0d;
    const surrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    if (!lineBreak && !surrogate) {
      codePoints.push(codePoint);
    }
  }
  const differences = [];
  for (const codePoint of [...codePoints, ...astralSamples]) {
    const c = String.fromCodePoint(codePoint);
    const hash = c === "#";
    const ends = hash || inRanges(measuredCharacters.endTag, codePoint);
    const digit = inRanges(measuredCharacters.digits, codePoint);
    const expected: [string, string[]][] = [
      [
        `x${c}#b`,
        inRanges(measuredCharacters.startTag, codePoint) ? ["b"] : [],
      ],
      [`#i${c}z`, hash ? ["i", "z"] : ends ? ["i"] : [`i${c}z`]],
      [`x #${c}z`, ends ? [] : [`${c}z`]],
      [`x #${c}`, ends || digit ? [] : [c]],
    ];
    for (const [source, tags] of expected) {
      const found = readTags(source);
      if (found.join("\n") !== tags.join("\n")) {
        differences.push({ codePoint: codePoint.toString(16), found, tags });
      }
    }
  }
  assert.deepEqual(differences, []);
});

test("every Char probe character, before and inside a tag, as in Obsidian", () => {
  // `Char probe.md`, measured in Obsidian 1.14.4: the tag in `#i{c}z`, where
  // "ends" means `i` and "kept" means `i{c}z`. Before `#` (`x {c}#b`) none of
  // them starts a tag, CJK and full-width punctuation included.
  const probe: [character: string, inside: "ends" | "kept"][] = [
    ["!", "ends"],
    ['"', "ends"],
    ["$", "ends"],
    ["%", "ends"],
    ["&", "ends"],
    ["'", "ends"],
    ["(", "ends"],
    [")", "ends"],
    ["*", "ends"],
    ["+", "ends"],
    [",", "ends"],
    ["-", "kept"],
    [".", "ends"],
    ["/", "kept"],
    [":", "ends"],
    [";", "ends"],
    ["<", "ends"],
    ["=", "ends"],
    [">", "ends"],
    ["?", "ends"],
    ["@", "ends"],
    ["[", "ends"],
    ["\\", "ends"],
    ["]", "ends"],
    ["^", "ends"],
    ["_", "kept"],
    ["`", "ends"],
    ["{", "ends"],
    ["|", "ends"],
    ["}", "ends"],
    ["~", "ends"],
    ["–", "ends"],
    ["—", "ends"],
    ["。", "kept"],
    ["，", "kept"],
    ["、", "kept"],
    ["：", "kept"],
    ["；", "kept"],
    ["（", "kept"],
    ["）", "kept"],
    ["【", "kept"],
    ["】", "kept"],
    ["「", "kept"],
    ["」", "kept"],
    ["“", "ends"],
    ["”", "ends"],
    ["‘", "ends"],
    ["’", "ends"],
    ["《", "kept"],
    ["》", "kept"],
    ["·", "kept"],
    ["…", "ends"],
    ["！", "kept"],
    ["？", "kept"],
    ["©", "kept"],
    ["°", "kept"],
    ["→", "kept"],
    ["€", "kept"],
    ["¥", "kept"],
    ["×", "kept"],
    ["～", "kept"],
  ];
  assert.equal(probe.length, 61);
  for (const [c, inside] of probe) {
    const before = `x ${c}#b`;
    const within = `#i${c}z`;
    const tag = inside === "ends" ? "i" : `i${c}z`;
    for (const tags of [readTags, indexedTags, renderedTags]) {
      assert.deepEqual(tags(before), [], before);
      assert.deepEqual(tags(within), [tag], within);
    }
  }
});

test("tags start only where Obsidian starts them, in context", () => {
  // Measured in Obsidian 1.14.4, each source as a note of its own.
  const contexts: [source: string, tags: string[]][] = [
    // Start of text, whitespace and line breaks.
    ["#a", ["a"]],
    ["x #a", ["a"]],
    ["x\n#a", ["a"]],
    ["x  \n#a", ["a"]],
    ["\u00a0#a", ["a"]],
    ["\u3000#a", ["a"]],
    ["\u200b#a", []],
    ["x 中#qe", []],
    ['"#qc"', []],
    ["x &nbsp;#a", []],
    ["x &amp;#a", []],
    ["x &#35;a", []],
    // Right after a tag that ended at `#`.
    ["x #a#b", ["a", "b"]],
    ["#a#b#c#d", ["a", "b", "c", "d"]],
    ["x #a/#b", ["a/", "b"]],
    ["x #-#b", ["-", "b"]],
    ["x #12/#13/#14", ["12/", "13/"]],
    ["x #a#12#b", ["a"]],
    ["x #a#12a#b", ["a", "12a", "b"]],
    ["x #1#b", []],
    ["x #a##b", ["a"]],
    ["x ##b", []],
    ["x #a!#b", ["a"]],
    ["x #a–#b", ["a"]],
    // Brackets and links.
    ["[#a]", ["a"]],
    ["x[#a]", ["a"]],
    ["x [#a b]", ["a"]],
    ["x [#a\nb]", ["a"]],
    ["x [#a](http://e.com)", ["a"]],
    ["x [#a", []],
    ["x [#a\\]", []],
    ["x \\[#a]", ["a"]],
    ["x ![#a]", []],
    ["x [[#a]", ["a"]],
    ["x [[#a]]", []],
    ["x [x]#a", ["a"]],
    ["x [x][y]#a", ["a"]],
    ["x [^1]#a", ["a"]],
    ["x []#a", []],
    ["x ]#a", []],
    ["x [l](u)#a", ["a"]],
    ["x (y)#a", []],
    ["x (#a)", []],
    ["x {#a}", []],
    ["x <#a>", []],
    ["x [x](#a)", []],
    ["x [[n]]#a", ["a"]],
    ["x ![[img.png]]#a", ["a"]],
    ["x https://e.com/#a", []],
    // Emphasis, highlight and strikethrough that pair.
    ["*#a*", ["a"]],
    ["x **#a**", ["a"]],
    ["x**#a**", ["a"]],
    ["x a**#b**", ["b"]],
    ["x ***#a***", ["a"]],
    ["x _#a_", ["a"]],
    ["x __#a__", ["a"]],
    ["x ==#a==", ["a"]],
    ["x ~~#a~~", ["a"]],
    ["x *#a\nb*", ["a"]],
    ["x *#a", []],
    ["x _#a", []],
    ["x ==#a", []],
    ["x ~~#a", []],
    ["x ~#a~", []],
    ["x =#a=", []],
    ["x ****#a****", []],
    ["x ~~~#a~~~", []],
    ["x **#a*", ["a"]],
    ["x **#a***", ["a"]],
    ["x *#a**", []],
    ["x ***#a*", []],
    ["x ==#a===", ["a"]],
    ["x ~~#a~~~", ["a"]],
    ["x *x*#a", ["a"]],
    ["x **x**#a", ["a"]],
    ["x _x_#a", ["a"]],
    ["x ==x==#a", ["a"]],
    ["x ~~x~~#a", ["a"]],
    ["x *a *#b", ["b"]],
    ["x *a*b*#c", []],
    ["x *(#a)*", []],
    ["x **[#a]**", ["a"]],
    ["x #a*b*", ["a"]],
    // Underscores are tag characters, except a closing one.
    ["x #a_b_", ["a_b_"]],
    ["x _#a_b_", ["a_b"]],
    ["x _#a_b", []],
    ["x __#a_", ["a"]],
    ["x _#a__", []],
    ["x __#a__b", ["a"]],
    ["x a_#b_", ["b"]],
    ["x a_#b_c", []],
    ["x _a_#b_", ["b_"]],
    ["x _#a_#b_", ["a", "b_"]],
    ["x *#a_*", ["a_"]],
    ["x _#a/_", ["a/"]],
    // Code, math, comments, HTML and escapes.
    ["x `c`#a", ["a"]],
    ["x ``a``#b", ["b"]],
    ["x `a``#b", []],
    ["x `#a`", []],
    ["x `#a`#b`", ["b"]],
    ["x $m$#a", ["a"]],
    ["x $$m$$#a", ["a"]],
    ["x $5 and $#a", []],
    ["x $a$b$#c", []],
    ["x $#a$", []],
    ["x %%c%%#a", ["a"]],
    ["x <span>#a</span>", ["a"]],
    ["x <a b='c'>#d", ["d"]],
    ["x </b>#a", ["a"]],
    ["x <br/>#a", ["a"]],
    ["x <!-- c -->#a", ["a"]],
    ["x <!-- a ->#b", []],
    ["x <https://e.com>#a", ["a"]],
    ["x <a@b.co>#c", ["c"]],
    ["x 1>#a", []],
    ["x \\#a", []],
    ["x \\\\#a", ["a"]],
    ["x \\*#a", ["a"]],
    ["x \\\\\\#a", []],
    // Blocks: the tag starts at the start of the block's text.
    ["> #a", ["a"]],
    [">#a", ["a"]],
    ["- #a", ["a"]],
    ["-#a", []],
    ["1. #a", ["a"]],
    ["1.#a", []],
    ["- [ ]#a", ["a"]],
    ["# #a", ["a"]],
    ["> [!note]#a", ["a"]],
    ["|#a|\n|-|\n|x#b|", ["a"]],
    ["| #a | x |\n| --- | --- |\n| #b |#c|", ["a", "b", "c"]],
    ["    #a", []],
    ["\t#a", []],
    ["***#a", []],
    ["<div>#a</div>", []],
    // Digits.
    ["x #12", []],
    ["x #1.5", []],
    ["x #1_2", ["1_2"]],
    ["x #12/", ["12/"]],
    ["x #١٢", ["١٢"]],
    ["x #１２", ["１２"]],
    ["x #²", ["²"]],
  ];
  for (const [source, tags] of contexts) {
    assert.deepEqual(indexedTags(source), tags, `indexed: ${source}`);
    assert.deepEqual(renderedTags(source), tags, `rendered: ${source}`);
  }
});

test("the owner's Tags pane cases and Tag probe.md match Obsidian", () => {
  const source = [
    "# Tag probe",
    "",
    "From WorkVault: #0~#11 and #12~#23 and #5–#12 and #12/#13/#14",
    "Coloured: !!#0000ff marked!! and C of #0000ff is",
    "Symbols: #ta~b #tb+c #tc=d #td|e #te^f #tf$g #tg<h #th>i #ti`j`",
    "Punctuation after: #pa. #pb, #pc: #pd; #pe? #pf! #pg' #ph\"",
    'Before: (#qa) [#qb] "#qc" x#qd 中#qe -#qf _#qg !#qh',
    "Slashes: #sa/ #/sb #sc/d",
    "Numbers: #123 #12a #1984/",
    "Emoji: #🙂em #em🙂",
  ].join("\n");
  // Obsidian 1.14.4's `metadataCache` tags for this note, in order.
  const measured = [
    "12/",
    "13/",
    "0000ff",
    "ta",
    "tb",
    "tc",
    "td",
    "te",
    "tf",
    "tg",
    "th",
    "ti",
    "pa",
    "pb",
    "pc",
    "pd",
    "pe",
    "pf",
    "pg",
    "ph",
    "qb",
    "sa/",
    "/sb",
    "sc/d",
    "12a",
    "1984/",
    "🙂em",
    "em🙂",
  ];
  assert.deepEqual(indexedTags(source), measured);
  assert.deepEqual(renderedTags(source), measured);
});

test("frontmatter tags must be whole tags, as Obsidian counts them", () => {
  // Measured: Obsidian 1.14.4 counts these YAML `tags` values (a leading `#`
  // dropped) and ignores the rest.
  const counted = ["#fmb", "fmk/l", "fm·m", "fmt_", "fmu-", "fm，w", "fm🙂z"];
  const ignored = [
    "fma~b",
    "fmc d",
    "1984",
    "fme.f",
    "fmg#h",
    "fmi,j",
    "fmn!",
    "#fmo#p",
    "fm(v)",
    "fmx–y",
    "fm\u200bzz",
    "#",
  ];
  const yaml = [...counted, ...ignored]
    .map((value) => `  - ${JSON.stringify(value)}`)
    .join("\n");
  assert.deepEqual(
    noteTags(`---\ntags:\n${yaml}\n---\nbody`),
    counted.map((value) => value.replace(/^#/, "")),
  );
});

test("frontmatter tags are trimmed before the # is dropped, as in Obsidian", () => {
  // Measured in Obsidian 1.14.4, one note per value: what String.trim removes
  // around a value is ignored, and then one leading `#`. U+180E and U+200B
  // are not trimmed.
  const counted: Record<string, string> = {
    "fmr ": "fmr",
    " fms": "fms",
    " #fmt ": "fmt",
    "\tfmu　": "fmu",
    " fmv ": "fmv",
    "fmw᠎": "fmw᠎",
  };
  const ignored = ["# fmx", " ##fmy", "fmz​", " fm a "];
  const yaml = [...Object.keys(counted), ...ignored]
    .map((value) => `  - ${JSON.stringify(value)}`)
    .join("\n");
  assert.deepEqual(
    noteTags(`---\ntags:\n${yaml}\n---\nbody`),
    Object.values(counted),
  );
});
