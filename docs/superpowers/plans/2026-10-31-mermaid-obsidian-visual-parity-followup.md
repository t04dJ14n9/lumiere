# Mermaid Obsidian visual parity follow-up (#463) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lumière LP Mermaid host chrome match Obsidian 1.14.4: note-face labels, padding 0, text-align start, guard radius 8px + title/desc 13/12px, without reopening #462/#460/#446/#445.

**Architecture:** CSS/token-only follow-up. Point `--font-mermaid` at `--text-font`; drop host padding/centering; bump guarded chrome sizes. Keep #462 scrollport and #460 invert. Update the diagrams package CSS snapshot test and README that still claim the editor font.

**Tech Stack:** Lumière markdown webview CSS (`base.css`, `diagrams.css`), node:test CSS assertions, pnpm.

## Global Constraints

- No new Cursor Cloud Agents; local implement only.
- Do not invent node/edge paint or themeVariables colors.
- Do not change Mermaid package version, useMaxWidth map, lightbox id keep, contain/overflow-y, dark invert, or pointer-events.
- PR screenshots + Host GUI on real Cursor/VS Code before merge ask; user merges only.
- Risk: Medium. Spec: `docs/superpowers/specs/2026-10-31-mermaid-obsidian-visual-parity-followup-design.md`.

---

## File map

| File | Responsibility |
| --- | --- |
| `packages/markdown/src/webview/styles/base.css` | `--font-mermaid` token |
| `packages/markdown/src/plugins/diagrams/diagrams.css` | Host pad/align + guard sizes |
| `packages/markdown/src/plugins/diagrams/diagrams.test.ts` | Assert font token + new host/guard rules |
| `packages/markdown/src/plugins/diagrams/README.md` | Note-face (not editor font) |

---

### Task 1: Font token → note face

**Files:**
- Modify: `packages/markdown/src/webview/styles/base.css:48-49`
- Modify: `packages/markdown/src/plugins/diagrams/diagrams.test.ts:80-92`
- Modify: `packages/markdown/src/plugins/diagrams/README.md:53`
- Test: `packages/markdown/src/plugins/diagrams/diagrams.test.ts`

**Interfaces:**
- Consumes: existing `--text-font` on `:root`
- Produces: `--font-mermaid: var(--text-font)` for Mermaid `themeVariables.fontFamily`

- [ ] **Step 1: Update the failing assertion first**

In `diagrams.test.ts`, replace the editor-font test with:

```ts
test("markdown webview defines --font-mermaid from the note text font", () => {
  const base = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../webview/styles/base.css",
    ),
    "utf8",
  );
  assert.match(base, /--font-mermaid:\s*var\(--text-font\)/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd /workspace/lumiere && pnpm --filter @workshop/markdown exec node --test packages/markdown/src/plugins/diagrams/diagrams.test.ts`
(or the repo’s usual markdown test entry for this file)

Expected: FAIL — base.css still has `var(--vscode-editor-font-family, inherit)`.

- [ ] **Step 3: Change the token**

In `base.css`:

```css
  /* Obsidian: --font-mermaid: var(--font-text); */
  --font-mermaid: var(--text-font);
```

- [ ] **Step 4: README one-liner**

In `README.md` Limits section, change `` `--font-mermaid` is the editor font. `` to `` `--font-mermaid` follows the note text font (`--text-font`, Obsidian `--font-text`). ``

- [ ] **Step 5: Run test — expect PASS**

Same command as Step 2. Expected: PASS for the font test.

- [ ] **Step 6: Commit**

```bash
git add packages/markdown/src/webview/styles/base.css \
  packages/markdown/src/plugins/diagrams/diagrams.test.ts \
  packages/markdown/src/plugins/diagrams/README.md
git commit -m "fix(markdown): Mermaid labels use note text font (#463)"
```

---

### Task 2: Host padding 0 + text-align start + guard sizes

**Files:**
- Modify: `packages/markdown/src/plugins/diagrams/diagrams.css:1-20` (host)
- Modify: `packages/markdown/src/plugins/diagrams/diagrams.css:74-101` (guard)
- Modify: `packages/markdown/src/plugins/diagrams/diagrams.test.ts` (add host/guard assertions)
- Test: `packages/markdown/src/plugins/diagrams/diagrams.test.ts`

**Interfaces:**
- Consumes: Task 1 token (unchanged here)
- Produces: Obsidian-measured host chrome; keep `#462` contain / overflow-y

- [ ] **Step 1: Add failing CSS assertions**

Append to `diagrams.test.ts` (reuse existing `css` read at top of file):

```ts
test("mermaid host has no padding and start alignment (Obsidian LP)", () => {
  assert.match(
    css,
    /pre\[data-fence="mermaid"\]:has\(> svg\)\s*\{[^}]*padding:\s*0;/,
  );
  assert.match(
    css,
    /pre\[data-fence="mermaid"\]:has\(> svg\)\s*\{[^}]*text-align:\s*start;/,
  );
  assert.match(
    css,
    /pre\[data-fence="mermaid"\]:has\(> svg\)\s*\{[^}]*contain:\s*inline-size;/,
  );
  assert.match(
    css,
    /pre\[data-fence="mermaid"\]:has\(> svg\)\s*\{[^}]*overflow-y:\s*hidden;/,
  );
});

test("mermaid guarded chrome matches Obsidian radius and UI font sizes", () => {
  assert.match(
    css,
    /\.mermaid-wrapper\.is-guarded\s*\{[^}]*border-radius:\s*8px;/,
  );
  assert.match(css, /\.mermaid-guard-title\s*\{[^}]*font-size:\s*13px;/);
  assert.match(
    css,
    /\.mermaid-guard-description\s*\{[^}]*font-size:\s*12px;/,
  );
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Same test command as Task 1. Expected: FAIL on padding/align/radius/sizes.

- [ ] **Step 3: Edit diagrams.css host**

```css
/* Mermaid diagrams; Obsidian LP host has no pad/center. Failures use is-guarded chrome. */
pre[data-fence="mermaid"]:has(> svg) {
  padding: 0;
  /*
   * Scrollport for a native-size SVG. … (keep existing #462 comment block unchanged)
   */
  contain: inline-size;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: start;
  background: none;
}
```

- [ ] **Step 4: Edit guard sizes**

```css
.mermaid-wrapper.is-guarded {
  overflow: hidden;
  border: 1px solid var(--vscode-widget-border, var(--line, #8884));
  border-radius: 8px;
  text-align: start;
}
.mermaid-guard-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--vscode-editor-foreground, inherit);
}
.mermaid-guard-description {
  color: var(--vscode-descriptionForeground, var(--muted, #888));
  font-size: 12px;
  white-space: pre-wrap;
}
```

Leave invert, SVG pointer-events, inspect button positions, and guard source padding unchanged.

- [ ] **Step 5: Run tests — expect PASS**

Same command. Expected: all diagrams.test.ts PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/markdown/src/plugins/diagrams/diagrams.css \
  packages/markdown/src/plugins/diagrams/diagrams.test.ts
git commit -m "fix(markdown): Obsidian Mermaid host pad/align and guard sizes (#463)"
```

---

### Task 3: Verify + PR

**Files:**
- No new code; PR body + screenshots

- [ ] **Step 1: Run package checks**

Run: `cd /workspace/lumiere && pnpm check` (or the repo’s documented subset if full check is long)  
Expected: PASS on markdown / diagrams.

- [ ] **Step 2: Push branch and open PR**

Push `fix/mermaid-463-obsidian-visual-parity`. Open PR against `main` linking #463 with Risk (Medium) / Testing / How to revert + placeholder for Host GUI before/after shots.

- [ ] **Step 3: Host GUI on real Cursor/VS Code**

Fixtures: small flowchart, wide LR, class diagram, guarded failure — light and dark. Confirm note-face labels, flush host, horizontal scroll on wide LR, invert, hover controls usable, guard 8px/13/12. Attach GitHub-hosted shots to the PR body.

- [ ] **Step 4: Reviewer bot + merge ask**

Per `lumiere-pr-review`: self-verify → spawn short-lived reviewer (comments only, ≤3 rounds) → CI green → ask user to squash-merge. Do not merge yourself.

---

## Spec coverage self-check

| Spec item | Task |
| --- | --- |
| `--font-mermaid: var(--text-font)` | Task 1 |
| Host padding 0 + text-align start | Task 2 |
| Keep #462 contain / overflow-y | Task 2 assertions |
| Guard 8px / 13px / 12px | Task 2 |
| No node/edge / themeVariables / CA | Global constraints |
| Screenshots + Host GUI + merge ask | Task 3 |
