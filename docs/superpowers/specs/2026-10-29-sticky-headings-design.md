# Sticky headings (stickyScroll) — design

Date: 2026-10-29  
Status: approved (chat); implement

## Goal

Pin the ATX/Setext heading ancestor chain at the top of the Lumière markdown editor while scrolling (Live Preview + Source), with click-to-jump — VS Code sticky-scroll style for Markdown outline structure. Each pin shows the heading's 1-based document line number in a gutter-aligned column (VS Code sticky scroll gutter parity), then the heading label.

## Existing code

`packages/markdown/src/plugins/stickyScroll` already implements this:

- CM extension layer; `maxLines` (default 5, max 6)
- Click jumps via `editor.navigate` + `scrollIntoView`
- Live Preview + Source

**Gap vs approved product intent:** `defaultEnabled: false` (CAPABILITIES / DESIGN also say off by default). Product decision 2026-10-29: **on by default**; settings can disable and cap depth.

## Changes

1. Set `defaultEnabled: true` in `stickyScroll/manifest.ts`.
2. Update `CAPABILITIES.md`, `DESIGN.md`, plugin README, and any settings copy that say “off by default”.
3. Keep `maxLines` default 5; ensure settings UI still exposes enable + max depth.
4. Regression: existing `model.test.ts` / `view.test.ts`; optional Host GUI smoke (scroll under H2/H3, click pin).

## Out of scope

YAML/Properties sticky keys; host chrome above the webview; Outline-only substitute.
