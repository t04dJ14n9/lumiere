# Startup / first-open wave 11 (2026-10-22)

Stacked on #285 / `main` tip `be30d581` (Host GUI: glyphs ~0.6 s, Live
Preview interactive ~1.0 s, Properties gap ~0.4 s). Target: cut interactive
further under ~1.0 s toward Obsidian-feel, keeping glyphs in the ~0.6 s class.

## Why not #286 / #287 / #288

| Wave | Cut | Host GUI |
| --- | --- | --- |
| #286 | `modulepreload` chrome.js + chrome before first-paint rAF + defer cursorBridge | interactive **~1.0 → ~1.3 s** |
| #287 | dynamic `import("yaml")` off editor static (−104 KB) + chrome before rAF + defer cursorBridge + lazy createRenderer | glyphs ~0.8 s, interactive **~1.3 s** |
| #288 | serialize `chromeChunks.then(() => preloadPaintFeatures())` | same **~0.6 / ~1.0 / ~0.4 s** as #285 (**no win**) |

Do **not** revive modulepreload chrome, boot skeletons, earlier-chrome-without-rAF,
ripping YAML off the editor static graph, or paint-after-chrome wire serialization.
Wave 10 proved the remaining gap is not a chrome/paint download race alone.

## Profile (glyphs → interactive on #285)

Host GUI on the large cold-open fixture: outline + word-count ~0.5 s
(editor blank); glyphs as **raw frontmatter** ~0.6 s; Properties widget +
**rendered heading + body** together ~1.0 s.

On this tip, `FIRST_PAINT_PARSE_CHARS` (= `VIEWPORT_BLOCK_MARGIN * 2` = 10 KB)
cuts **mid-frontmatter** (fence ends ~20 KB; first `#` heading at ~20 013):

| Tree | Frontmatter node | First ATX heading | Parse (box) |
| --- | --- | --- | ---: |
| #285 first-paint (10 KB) | `[0, ~10028]` truncated | **absent** | ~1.7 ms |
| Idle full `parseMarkdown` | `[0, 20011]` complete | `@20013` | ~122 ms |

So after glyphs, interactive still waits on `documentTreeCompleter`
(`requestIdleCallback` timeout 120 ms + full-doc Lezer walk) before the tree
has a closed YAML fence and the opening heading. Properties chrome configure
can run earlier, but it has nothing complete to mount over — matching the
~0.4 s Properties + render-settle gap. Wire-only reorder (#288) cannot close
that.

Sync `yaml` stays on the editor graph (#287 regress). Chrome vs paint preload
split from #285 stays.

## Strategy (wave 11)

1. **Frontmatter-aware first-paint parse** — `firstPaintParseEnd()` uses
   yaml-free `headerParts()` on a bounded probe. When a note opens with a
   complete `---` / `---` fence, the prefix budget becomes
   `max(FIRST_PAINT_PARSE_CHARS, fenceEnd + FIRST_PAINT_BODY_AFTER_FRONTMATTER)`,
   capped at `FIRST_PAINT_PARSE_MAX` (64 KB). large fixture → ~30 KB prefix
   (~14 ms parse here) with complete Frontmatter + heading + opening body.
2. **Align `blockHotRanges` create** with the same end so first-screen blocks
   after a tall fence are live when Properties collapses the YAML.
3. Idle completer still finishes the rest of large notes off the critical path.
4. **No** modulepreload chrome, **no** `#mw-boot` skeleton, **no** YAML graph
   rip, **no** paint-after-chrome serialization, **no** cursorBridge reshuffle
   in this wave.

## Expected Host GUI gate

Cold-open the large cold-open fixture on this tip:

- Prefer interactive **&lt; 1.0 s** vs #285 (~1.0 s), glyphs still ~0.6 s class
- ≤ 1.0 s with a clearly smaller Properties gap / earlier body may still ship
- Pure no-win (same ~0.6 / ~1.0 / ~0.4) closes without merge

Integ pid left alone; coordinator remasures. No Cloud Agents / Codex.

## Marks

`mw:main` → `mw:ready` → `mw:plugins` → `mw:first-paint` (rAF; prefix tree
already includes complete FM when present) → `mw:properties` → `mw:features`.

## Correctness

- Notes without a YAML fence keep the 10 KB opening band.
- Pathological fences stop at 64 KB; idle completer completes the remainder.
- Unit: `document-tree.test.ts` (long-FM extend + truncate without FM);
  deferred-block suite; `pnpm typecheck` in `@workshop/markdown`.
