# Startup / first-open wave 14 (2026-10-22)

Stacked on #292 / `main` tip `b8439dc0` (Host GUI after wave 13: glyphs
~0.5 s, **body-first** heading+body ~0.8 s, Properties sheet ~0.9 s).
Target: further cut without regressing those. Prefer body &lt;0.8 s, or
Properties ≤ body, **or kill raw-FM first paint** (glyphs still raw YAML
before the placeholder collapses).

## Closed waves — do not repeat

| Wave | Cut | Host GUI |
| --- | --- | --- |
| #286 | `modulepreload` chrome + earlier Properties | interactive **~1.3 s** REGRESS |
| #287 | dynamic YAML off editor static + earlier chrome | interactive **~1.3 s** REGRESS |
| #288 | serialize paint preload **after chrome resolve** | same **~0.6 / ~1.0 / ~0.4** (**no win**) |
| #289 | extend first-paint parse through YAML fence | **~0.8 s / ~1.1 s REGRESS** |

REA / #289: **do not widen `FIRST_PAINT_PARSE_CHARS`**. More sync Lezer before
paint delays glyphs; heading still arrived with interactive, not earlier alone.

## Profile (after #292)

| Time | What |
| --- | --- |
| ~0.5 s | glyphs = **raw frontmatter** (prefix tree; tall fence &gt; 10 KB band) |
| ~0.8 s | idle completer finishes fence → placeholder collapses → heading + body |
| ~0.9 s | real Properties sheet replaces placeholder |

Wave 12/13 already decoupled body from Properties and pulled the sheet near
body. The remaining raw-FM flash is because the placeholder **refused**
truncated first-paint `Frontmatter` nodes — matching `node.to` alone would
hide only the opening band and leave the rest of the fence as raw glyphs.
Waiting for `documentTreeCompleter` fixed correctness but left ~0.3 s of YAML
on screen.

## Strategy (wave 14)

1. **Collapse complete fences on truncated first-paint trees** — when
   yaml-free `headerParts()` finds a closing `---` past the prefix
   `Frontmatter` node, the placeholder **matches** and sets
   `range()` to `{ from: 0, to: header.end }` so the decoration covers the
   full fence (including text beyond the prefix tree).
2. **No larger first-paint Lezer parse** — `FIRST_PAINT_PARSE_CHARS` unchanged;
   not #289. Cost is a bounded string probe (already used by the placeholder)
   plus one `Decoration.replace` span.
3. **Deferred shell height** — `frontmatter-placeholder` reserves the collapsed
   chrome height (~69 px) when outside the hot band, not a YAML-source line
   estimate.
4. **No** modulepreload chrome, **no** boot skeleton, **no** YAML graph rip,
   **no** paint-after-chrome-resolve serialization, **no** chrome-before-rAF.

## Host GUI gate

Cold-open the same large tall-fence fixture on this tip:

- Prefer **no raw-FM flash** at glyphs (placeholder chrome instead of YAML),
  **without** glyphs regress past ~0.5 s, body regress past ~0.8 s, or
  Properties regress past ~0.9 s
- Body &lt;0.8 s or Properties ≤ body is a bonus if it appears without those
  regresses
- Pure no-win (raw YAML still first paint) or any regress → close without merge

Integ pid left alone; coordinator remasures. No Cloud Agents / Codex. Live
Preview only.

## Marks

`mw:main` → `mw:ready` → `mw:plugins` → `mw:first-paint` (placeholder may
already cover the full fence) → idle completer (heading decorations) →
`mw:properties` → `mw:features`.

## Correctness

- Unclosed fences still show as source (no `headerParts` end → no match).
- Notes without a YAML fence unchanged.
- Properties / Sources takeover unchanged once chrome configures.
- Unit: `frontmatter-placeholder.test.ts` (truncated accept + range past tree,
  unclosed reject, properties takeover); `pnpm typecheck` in
  `@workshop/markdown`.
