# Mermaid Obsidian visual parity follow-up (host chrome + fonts)

**Date:** 2026-10-31 (Asia/Shanghai)  
**Status:** Approved for implementation (Approach 2 — full host parity)  
**Repo:** Workshop / Lumière (`https://github.com/t04dJ14n9/lumiere`)  
**Issue:** [#463](https://github.com/t04dJ14n9/lumiere/issues/463)  
**Owner agent:** Mermaid Parity (one bot per PR)  
**Prior design:** `docs/superpowers/specs/2026-10-30-mermaid-obsidian-visual-parity-design.md` (#460)  
**Shipped:** #445 lightbox id keep · #446 useMaxWidth + SVG max-width · #460 CSS invert + `--font-mermaid` token · #462 `contain:inline-size` + overflow-y hidden  
**REA pack:** `/workspace/mermaid-parity-rea/463/` (static + live `computed-dark.json` / `computed-light.json` / `COMPUTED.md`)

## Goal

One PR that makes Lumière Live Preview Mermaid **host chrome** match Obsidian 1.14.4 measured facts: note-face labels, padding 0, text-align start, guard radius 8px and title/description 13px/12px. Do **not** invent a new look. Do **not** reopen #445 / #446 / #460 / #462 sizing, clip, or invert unless Host GUI proves a regression.

## Decision (user)

| Topic | Choice |
| --- | --- |
| Approach | **2 — Full host parity** (approved) |
| Font | `--font-mermaid` → note face (`var(--text-font)`) |
| Host box | `padding: 0`, `text-align: start` (drop `40px 0 8px` + center) |
| Guard | radius `8px`; title `13px`; description `12px` |
| Keep | #462 contain / overflow-x / overflow-y; dark CSS invert; `pointer-events: all`; Copy / Inspect / Edit |
| Out | Node/edge paint, themeVariables colors, Mermaid 11↔12 downgrade, interaction parity with Obsidian embed select |

## Obsidian REA baseline (live + static)

Obsidian **1.14.4**, vault note `463-mermaid-fixtures.md`, four `.mermaid` hosts (small flowchart, wide LR, deploy flowchart, class diagram). Light and dark computed dumps agree except the SVG filter.

| Fact | Obsidian measured |
| --- | --- |
| Host padding / margin | **0** / **0** |
| Host overflow | `overflow-x: auto`, `overflow-y: auto` |
| Host text-align | **start** (SVG `display: inline`; Mermaid does not center itself) |
| Dark SVG filter | `invert(1) hue-rotate(180deg) saturate(1.25)` |
| Light SVG filter | `none` |
| `--font-mermaid` | equals `--font-text` (note proportional stack) |
| nodeLabel | family from `--font-mermaid`; size **16px**; weight 400 (class title 700) |
| Node fill / stroke | `#ECECFF` / `#9370DB` (Mermaid default; no app.css `.node` rules) |
| Wide LR scroll | scrollWidth **2144** vs clientWidth **700** |
| LP host CSS (static) | only `.cm-embed-block > .mermaid { overflow-x: auto; }` — no padding, no text-align |
| Guard `.is-guarded` | `border-radius: var(--radius-m)` → **8px**; title **13px**; description **12px** |

**Interaction (document only, not this PR):** click in SVG gap selects the embed (`</>` control) and does not open source. Lumière keeps `pointer-events: all` so gap clicks stay on the widget (caret / dblclick-to-edit behavior from earlier LP work).

## Current Lumière gap (post-#462 on `main`)

```css
/* diagrams.css — host */
pre[data-fence="mermaid"]:has(> svg) {
  padding: 40px 0 8px;   /* Obsidian: 0 */
  contain: inline-size;  /* #462 — keep */
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;    /* #462 — keep (wheel; Obsidian y computes auto on note) */
  text-align: center;    /* Obsidian: start */
  background: none;
}
```

```css
/* base.css */
--font-mermaid: var(--vscode-editor-font-family, inherit); /* Obsidian: var(--font-text) */
```

```css
/* diagrams.css — guard */
.mermaid-wrapper.is-guarded { border-radius: 6px; } /* Obsidian: 8px */
.mermaid-guard-title { font-size: 0.875em; }        /* Obsidian: 13px */
.mermaid-guard-description { font-size: 0.8125em; } /* Obsidian: 12px */
```

`renderer.ts` already passes `themeVariables.fontFamily: "var(--font-mermaid, …)"` — it picks up the token change with no init rewrite.

## Design

### 1. Font token → note face

In `packages/markdown/src/webview/styles/base.css`:

```css
/* Obsidian: --font-mermaid: var(--font-text); */
--font-mermaid: var(--text-font);
```

Leave `renderer.ts` `themeVariables.fontFamily` on `--font-mermaid`. Do **not** pass `fontSize` / `fontWeight` overrides (Obsidian does not; Mermaid default 16px matches `--text-size`).

### 2. Host padding and alignment

In `packages/markdown/src/plugins/diagrams/diagrams.css`, on `pre[data-fence="mermaid"]:has(> svg)`:

- Set `padding: 0`
- Set `text-align: start`
- Update the file header comment (no longer “centred”)
- **Keep** `contain: inline-size`, `max-width: 100%`, `overflow-x: auto`, `overflow-y: hidden`, dark invert selectors, SVG `pointer-events` / `user-select` / link underline

**Hover controls trade-off (accepted):** Copy / Inspect / Edit stay `position: absolute; top: 10px`. With padding 0 they may sit on the SVG corner when visible — same idea as Obsidian’s separate embed-actions chrome, which does not inflate Mermaid host padding.

### 3. Guarded chrome sizes

In the same `diagrams.css`:

```css
.mermaid-wrapper.is-guarded {
  border-radius: 8px; /* was 6px; Obsidian --radius-m */
}
.mermaid-guard-title {
  font-size: 13px; /* was 0.875em; Obsidian --font-ui-small */
}
.mermaid-guard-description {
  font-size: 12px; /* was 0.8125em; Obsidian --font-ui-smaller */
}
```

No structural or color-token changes to the guard (VS Code tokens remain stand-ins).

### 4. Explicit non-goals

- No `.node` / `.edge` / cluster / edgeLabel CSS; no `themeVariables` color keys
- No Mermaid package downgrade (11.13.0 ↔ 12.2.0 core fills already match LIVE)
- No change to #462 scrollport, #460 invert, #446 useMaxWidth map, #445 lightbox id keep
- No change to gap-click / caret / `pointer-events` behavior for Obsidian embed-select parity

## Files touched

| File | Change |
| --- | --- |
| `packages/markdown/src/webview/styles/base.css` | `--font-mermaid: var(--text-font)` + comment |
| `packages/markdown/src/plugins/diagrams/diagrams.css` | host padding/align; guard radius + title/desc sizes; comment |
| `packages/markdown/src/plugins/diagrams/renderer.ts` | none expected (token pickup only) |

## Risk · Testing · How to revert

**Risk:** Medium (product UI / LP Mermaid chrome).

**Testing**

- `pnpm check` and relevant `pnpm test:browser` for diagrams
- Host GUI on real Cursor / VS Code LP with #463 fixtures (small flowchart, wide LR, class diagram, guarded failure)
- Before/after screenshots in the PR (GitHub-hosted)
- Confirm: labels use note face; host flush (pad 0, start-aligned); wide diagram still scrolls horizontally inside the column; dark invert unchanged; hover controls still usable; guard radius 8px and title/desc 13/12

**How to revert:** Revert the single squash-merge commit (CSS / token only).

## Process (standing)

After the impl PR is open and stable: self-verify with evidence → spawn short-lived **reviewer bot** (comments only, max 3 rounds; skill `lumiere-pr-review`) → CI green on current head → Host GUI / screenshots → merge ask to **user** only. No new Cursor Cloud Agents. Local implement only.

## Success criteria

- LIVE-measured host facts (pad 0, text-align start, note-face labels) match Lumière LP after Host GUI
- #462 wide-flowchart horizontal scroll still works; no vertical wheel trap regression
- Guard chrome matches Obsidian radius + title/desc sizes
- PR body has Risk / Testing / How to revert + before/after screenshots
