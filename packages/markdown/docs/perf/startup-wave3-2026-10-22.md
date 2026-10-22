# Startup / first-open wave 3 (2026-10-22)

Stacked on wave 2 (`perf/startup-first-open-2` @ `8c52e74e` / PR #277).
Measured production build (`node scripts/build.mjs --production`) on this box.

## Bundle (production)

| Asset | Wave 2 | Wave 3 | Delta |
| --- | ---: | ---: | ---: |
| Host `extension.js` | 795,767 B | 680,884 B | **−114.9 KB (−14%)** |
| Host `yaml-runtime.cjs` (lazy) | — | 115,233 B | loaded only after a `---` fence |
| Host + YAML (notes with FM) | 795,767 B | 796,117 B | ≈ same once YAML is needed |

## Behavioural cold-path changes

1. **`headerParts` without YAML** — fence detection lives in `header-parts.ts`
   with no `yaml` import. Notes that do not start with `---` never touch the
   YAML runtime.
2. **Lazy host YAML chunk** — `loadYaml()` `require`s `markdown/yaml-runtime.cjs`
   (esbuild `lazy-yaml` plugin, same pattern as the agent-bridge server).
   Activation and no-frontmatter opens skip evaluating the YAML package.
3. **Single `parseDocument` on metadata** — `frontmatterLinks` accepts the
   document from `frontmatter().yaml`, so vault/editor metadata no longer
   parses the same fence twice. On WorkVault `AI 活动平台上云.md` (~19.5 KB /
   393-line frontmatter): ~2.8 ms single vs ~6.6 ms double on this box.

## Large-note note

That WorkVault note **has** a large frontmatter fence, so YAML still loads on
first open; the win there is the deferred host parse of `extension.js` plus
the avoided second `parseDocument`. Notes without a fence skip YAML entirely.

BH-014 link-update paths still see the same `frontmatterLinks` results (covered
by unit tests). Residual: further TTI needs native `mw:*` over SSH; YAML edit
paths still call `loadYaml()` as today once a fence exists.

## Correctness

- Obsidian fence / properties / frontmatterLinks behaviour unchanged.
- `pnpm check` green.
