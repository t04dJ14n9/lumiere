# Startup / first-open wave 12 (2026-10-22)

Stacked on #285 / `main` tip `be30d581` (Host GUI: glyphs ~0.6 s, Live
Preview interactive ~1.0 s, Properties gap ~0.4 s). Target: cut interactive
**under ~1.0 s** toward Obsidian-feel, keeping glyphs in the ~0.6 s class.

## Closed waves — do not repeat

| Wave | Cut                                                       | Host GUI                                 |
| ---- | --------------------------------------------------------- | ---------------------------------------- |
| #286 | `modulepreload` chrome + earlier Properties               | interactive **~1.3 s** REGRESS           |
| #287 | dynamic YAML off editor static (−104 KB) + earlier chrome | interactive **~1.3 s** REGRESS           |
| #288 | serialize paint preload after chrome                      | same **~0.6 / ~1.0 / ~0.4** (**no win**) |
| #289 | extend first-paint parse through YAML fence               | **~0.8 s / ~1.1 s REGRESS**              |

#289 proved: more sync Lezer work before first paint delays glyphs. Heading
still arrived **with** interactive, not earlier alone — so the ~0.4 s gap is
**Properties chrome + decorate/render settle**, not “missing ATXHeading1 in
the prefix tree”.

## Profile (glyphs → interactive on #285)

Host GUI cold-open of a large note with a tall YAML fence:

| Time   | What                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| ~0.5 s | outline + word count; editor blank                                                       |
| ~0.6 s | glyphs = **raw frontmatter** (prefix tree; fence larger than the 10 KB first-paint band) |
| ~1.0 s | Properties widget + **rendered heading + body** together                                 |

Until Properties replaces the `Frontmatter` node, raw YAML keeps the opening
heading below the fold. Idle `documentTreeCompleter` can close the fence well
before Properties configures, but without a block renderer the heading still
cannot enter the viewport. Wire-only reorder (#288) and larger first-paint
parse (#289) cannot close that visibility gap safely.

## Strategy (wave 12)

1. **Frontmatter placeholder in core Live Preview** — register a
   `frontmatter-placeholder` block renderer on the base slot. It matches only a
   **complete** `---` / `---` fence (`headerParts`, yaml-free) and only while
   no `kind: "properties"` renderer is in the facet. It replaces the fence with
   a collapsed Properties-chrome stub (~69 px reserve) so heading + body can
   paint from core LP **before** the Properties feature chunk configures.
2. **Properties fills in async** — when chrome configure installs
   `PropertyPresentation`, the placeholder’s `match` returns false and the real
   sheet takes over (same facet rebuild path as other renderer swaps).
3. **Completer after first paint** — `documentTreeCompleter` waits two
   animation frames before scheduling idle full parse (timeout **32 ms**, was 120) so full-doc Lezer work does not contend with glyphs (#289 lesson) but
   still finishes soon enough for the placeholder to collapse the fence.
4. **No** modulepreload chrome, **no** boot skeleton, **no** YAML graph rip,
   **no** paint-after-chrome serialization, **no** larger first-paint parse,
   **no** chrome-before-rAF.

## Host GUI gate (document the split)

Cold-open the same large tall-fence note on this tip:

- Prefer **body-first interactive &lt; 1.0 s**: rendered heading + body after the
  placeholder collapses the fence, **even if Properties trails**.
- Glyphs should stay in the **~0.6 s** class (raw FM until the completer +
  placeholder run — no extra sync parse on `documentTree` create).
- Report Properties-ready separately when it no longer coincides with body.
- Pure no-win (same ~0.6 / ~1.0 / ~0.4 with heading still tied to Properties)
  or glyphs/interactive regress → close without merge.

Integ pid left alone; coordinator remasures. No Cloud Agents / Codex.

## Marks

`mw:main` → `mw:ready` → `mw:plugins` → `mw:first-paint` (rAF) →
(placeholder may collapse FM once the idle tree is complete) →
`mw:properties` (chrome configure; real sheet replaces placeholder) →
`mw:features`.

## Correctness

- Truncated first-paint Frontmatter nodes do **not** match (no half-fence hide).
- Notes without a YAML fence are unchanged.
- Properties / Sources / caret-guard behaviour unchanged once chrome configures.
- Unit: `frontmatter-placeholder.test.ts`; `pnpm typecheck` in
  `@workshop/markdown`.
