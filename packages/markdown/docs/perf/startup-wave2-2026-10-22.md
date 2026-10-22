# Startup / first-open wave 2 (2026-10-22)

Stacked on wave 1 (`perf/startup-first-open` @ `ef32d8f0` / PR #276).
Measured production build (`node scripts/build.mjs --production`) wave 2 tip
vs wave 1 tip on this box.

## Bundle (production)

| Asset | Wave 1 | Wave 2 | Delta |
| --- | ---: | ---: | ---: |
| Host `extension.js` | 893,573 B | 795,767 B | **−95.5 KB (−11%)** |
| `markdown-it` in host bundle | present | **absent** | host no longer ships the renderer |

Webview entry / chunk graph unchanged from wave 1 (paint-phase features already
dynamic). Residual host YAML for properties/frontmatter stays static — deferred
to a later pass when notes without frontmatter can skip it.

## Behavioural cold-path changes

1. **Defer workbench plugins** until `editor/ready`. Activation starts only
   `nativeLinks` + `obsidianCompat`; graph, marp, backlinks, outline,
   quickSwitcher, wordCount, bridge, ideContext, wiki/assets/scratch,
   gitDiffEditor, tags, okfCore, linkUpdates wait for the first editor ready.
2. **Defer panel host halves** until `editor/session-ready` (emitted after the
   panel answers the webview ready handshake). Critical for first text:
   links, tasks, properties, tags, cursorBridge. Deferred: gitGutter,
   gitBlame, suggest, search, onlineVideos, sourcesProperty.
3. **Two-phase webview features**: paint phase (tables, links, properties,
   callouts, …) before first paint; remaining features (math, diagrams,
   vim, git chrome, online videos, bridges, …) after `requestAnimationFrame`.
4. **PluginSwitch**: within one reconcile, configuration updates and stops run
   in parallel; starts stay synchronous (kernel service graph).
5. **Host without markdown-it**: `html/helpers` and `heading-extract` use a
   small escape/entity/heading-label path so vault outline / metadata no longer
   pulls markdown-it into `extension.js`.

## Harness note

`scripts/profile-open.ts` still uses monolithic `fake-host.js` and does not
model deferred workbench/panel hosts or paint-phase feature splits. Prefer
native `test/vscode/perf.spec.ts` (`mw:main|ready|features|plugins|first-paint`)
on a large note (the large cold-open fixture) over SSH for end-to-end
TTI. Owner: run that before/after once a VS Code harness is available.

## Correctness

- BH-014 / BH-015 areas untouched.
- Obsidian preset feature set unchanged; only start timing / host bundling.
- `pnpm check` green (400 unit tests).
