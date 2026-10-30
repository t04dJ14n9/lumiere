# Mermaid Obsidian visual parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Obsidian Live Preview Mermaid: CSS-invert dark colors (not Mermaid `theme:"dark"`), `--font-mermaid` token, and native SVG size for `useMaxWidth:false` types by dropping the fit-width height model.

**Architecture:** Keep #445/#446 sizing CSS and the per-type `useMaxWidth` map. Always initialize Mermaid with the default (light) palette; apply Obsidian’s `filter: invert(100%) hue-rotate(180deg) saturate(1.25)` under Lumière dark body classes (LP fence + diagram inspector). Remove Mermaid theme from init/cache keys. Stop `fitted()` in `mermaid-height.ts` for flowchart/sequence so scroll reserves match native pixel SVGs.

**Tech Stack:** Lumière `packages/markdown` (TypeScript, node:test), Mermaid 12.2.0, VS Code webview CSS (`vscode-light` / `vscode-high-contrast-light`).

**Spec:** `docs/superpowers/specs/2026-10-30-mermaid-obsidian-visual-parity-design.md`  
**Audit:** `/workspace/mermaid-parity-rea/FITWIDTH-AUDIT.md`  
**REA:** `/workspace/mermaid-parity-rea/REPORT.md`

## Global Constraints

- Cloud Agent: latest Grok only, max context + max reasoning, fast mode off; never third-party models.
- PR descriptions must include before/after screenshots (repro + after).
- Host GUI verify on a real Cursor/VS Code client before merge; message @Slave (`0eafd44d-7507-4ef1-a47d-151125f7ab46`) when ready.
- Do not redo #446 CSS `max-width: none` / overflow-x unless Host GUI proves residual shrink.
- Do not invent custom dark `themeVariables`; do not downgrade Mermaid 12→11 in this work.
- Settings precedence for mapped Obsidian keys: explicit VS Code/Cursor setting wins, then Obsidian `.obsidian/app.json`, then Lumière defaults; never write those VS Code settings from app.json.

## File map

| File | Responsibility |
| --- | --- |
| `packages/markdown/src/plugins/diagrams/diagrams.css` | Dark invert on LP Mermaid SVG + inspector SVG; optional `--font-mermaid` |
| `packages/markdown/src/webview/styles/base.css` | Prefer defining `--font-mermaid` on `:root` / `body` once |
| `packages/markdown/src/plugins/diagrams/renderer.ts` | Always default Mermaid theme; trust-only init/cache keys |
| `packages/markdown/src/plugins/diagrams/diagrams.test.ts` | Assert invert CSS present; keep max-width/overflow tests |
| `packages/markdown/src/plugins/diagrams/mermaid-guard.test.ts` | Init asserts theme default / omit dark; rename theme-axis test |
| `packages/markdown/src/webview/ui/mermaid-height.ts` | Drop `fitted()` for flowchart + sequence |
| `packages/markdown/src/webview/ui/mermaid-height.test.ts` | Width-invariant DRAWN for native types |

---

### Task 1: Dark CSS invert + `--font-mermaid`

**Files:**
- Modify: `packages/markdown/src/webview/styles/base.css` (`:root` block ~L29+)
- Modify: `packages/markdown/src/plugins/diagrams/diagrams.css`
- Modify: `packages/markdown/src/plugins/diagrams/diagrams.test.ts`
- Test: `packages/markdown/src/plugins/diagrams/diagrams.test.ts`

**Interfaces:**
- Consumes: existing fence selectors `pre[data-fence="mermaid"]`; inspector class `diagram-inspector` from `diagram-dialog.ts`
- Produces: CSS filter matching Obsidian; `--font-mermaid` available to Mermaid `themeVariables.fontFamily`

- [ ] **Step 1: Write the failing CSS tests**

In `diagrams.test.ts`, after the existing overflow-x test, add:

```ts
test("dark Mermaid SVG uses Obsidian invert filter", () => {
  assert.match(
    css,
    /body:not\(\.vscode-light\):not\(\.vscode-high-contrast-light\)[\s\S]*?pre\[data-fence="mermaid"\][\s\S]*?>\s*svg[\s\S]*?filter:\s*invert\(100%\)\s+hue-rotate\(180deg\)\s+saturate\(1\.25\)/,
  );
});

test("diagram inspector Mermaid SVG uses the same dark invert", () => {
  assert.match(
    css,
    /body:not\(\.vscode-light\):not\(\.vscode-high-contrast-light\)[\s\S]*?\.diagram-inspector[\s\S]*?svg[\s\S]*?filter:\s*invert\(100%\)\s+hue-rotate\(180deg\)\s+saturate\(1\.25\)/,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/markdown && pnpm exec node --import tsx --test src/plugins/diagrams/diagrams.test.ts`

Expected: FAIL — invert assertions do not match.

- [ ] **Step 3: Add `--font-mermaid` on `:root` in base.css**

Inside the existing `:root { ... }` block in `base.css`, add:

```css
  /* Obsidian: --font-mermaid: var(--font-text); editor face is the Lumière stand-in */
  --font-mermaid: var(--vscode-editor-font-family, inherit);
```

- [ ] **Step 4: Add invert rules to diagrams.css**

After the existing `pre[data-fence="mermaid"] svg { ... }` block (before `svg text` rules), add:

```css
/*
 * Obsidian app.css: .theme-dark .mermaid > svg {
 *   filter: invert(100%) hue-rotate(180deg) saturate(1.25);
 * }
 * Lumière webview: light = vscode-light | vscode-high-contrast-light.
 */
body:not(.vscode-light):not(.vscode-high-contrast-light)
  pre[data-fence="mermaid"]
  > svg {
  filter: invert(100%) hue-rotate(180deg) saturate(1.25);
}

body:not(.vscode-light):not(.vscode-high-contrast-light)
  .diagram-inspector
  .media-area
  > svg {
  filter: invert(100%) hue-rotate(180deg) saturate(1.25);
}
```

Keep `max-width: none` / `overflow-x: auto` unchanged.

- [ ] **Step 5: Run CSS tests to verify they pass**

Run: `cd packages/markdown && pnpm exec node --import tsx --test src/plugins/diagrams/diagrams.test.ts`

Expected: PASS (including existing max-width / overflow-x tests).

- [ ] **Step 6: Commit**

```bash
git add packages/markdown/src/webview/styles/base.css \
  packages/markdown/src/plugins/diagrams/diagrams.css \
  packages/markdown/src/plugins/diagrams/diagrams.test.ts
git commit -m "feat(mermaid): Obsidian dark invert filter and --font-mermaid"
```

---

### Task 2: Always default Mermaid theme; trust-only init/cache keys

**Files:**
- Modify: `packages/markdown/src/plugins/diagrams/renderer.ts` (`cacheKeyFor` ~L118–126, `renderMermaidSvg` ~L128–160)
- Modify: `packages/markdown/src/plugins/diagrams/mermaid-guard.test.ts` (init test ~L326–399)
- Test: `packages/markdown/src/plugins/diagrams/mermaid-guard.test.ts`

**Interfaces:**
- Consumes: `this.trust.isTrusted()`, Mermaid `initialize` / `render`
- Produces: init without `theme: "dark"`; `lastInitKey` / cache key without appearance axis

- [ ] **Step 1: Extend the init test for default theme and trust-only re-init**

Update `MermaidInitArg` to include `theme?: string`. Rename the test to:

`DiagramRenderer initializes mermaid only when trust changes`

After the existing useMaxWidth / fontFamily asserts, add:

```ts
    assert.ok(
      initArg.theme === undefined || initArg.theme === "default",
      `expected default Mermaid theme, got ${initArg.theme}`,
    );
```

Keep the trust flip → `initCalls === 2` behavior. Do **not** require a body class flip to re-init.

- [ ] **Step 2: Run test (may still pass theme assert as fail if theme is dark in jsdom)**

Run: `cd packages/markdown && pnpm exec node --import tsx --test src/plugins/diagrams/mermaid-guard.test.ts`

Expected: FAIL on theme assert if body is not `vscode-light` (current code sets `"dark"`).

- [ ] **Step 3: Change `cacheKeyFor`**

Replace theme detection with trust + source only:

```ts
  private cacheKeyFor(source: string): string {
    const trust = this.trust.isTrusted() ? "t" : "u";
    return `${trust}|${source}`;
  }
```

- [ ] **Step 4: Change `renderMermaidSvg` initialize**

Remove the `theme` local and `theme` property from `mermaid.initialize`. Set:

```ts
    const trusted = this.trust.isTrusted();
    const initKey = trusted ? "t" : "u";
    if (this.lastInitKey !== initKey) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: trusted,
        flowchart: { htmlLabels: trusted, useMaxWidth: false },
        sequence: { useMaxWidth: false },
        gitGraph: { useMaxWidth: false },
        er: { useMaxWidth: false },
        gantt: { useMaxWidth: true },
        journey: { useMaxWidth: true },
        class: { useMaxWidth: true },
        state: { useMaxWidth: true },
        pie: { useMaxWidth: true },
        themeVariables: {
          fontFamily:
            "var(--font-mermaid, var(--vscode-editor-font-family, inherit))",
        },
        suppressErrorRendering: true,
        // Obsidian omits theme → Mermaid default (light); dark UI uses CSS invert.
      });
      this.lastInitKey = initKey;
    }
```

(Optionally set `theme: "default"` explicitly; either is fine if tests accept both.)

- [ ] **Step 5: Run mermaid-guard tests**

Run: `cd packages/markdown && pnpm exec node --import tsx --test src/plugins/diagrams/mermaid-guard.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/markdown/src/plugins/diagrams/renderer.ts \
  packages/markdown/src/plugins/diagrams/mermaid-guard.test.ts
git commit -m "fix(mermaid): use default theme; CSS invert handles dark"
```

---

### Task 3: Drop fit-width height guesses for native Mermaid types

**Files:**
- Modify: `packages/markdown/src/webview/ui/mermaid-height.ts`
- Modify: `packages/markdown/src/webview/ui/mermaid-height.test.ts`
- Test: `packages/markdown/src/webview/ui/mermaid-height.test.ts`

**Interfaces:**
- Consumes: `mermaidBlockHeight(source, widthPx)` callers in `markdown-block-height.ts` (signature unchanged)
- Produces: flowchart/sequence heights independent of `widthPx`; DRAWN at731 = at1211 for those fixtures

- [ ] **Step 1: Update DRAWN fixtures that only differed via fit-width**

In `mermaid-height.test.ts`, for native (`useMaxWidth: false`) fixtures whose at731 < at1211 solely due to scale-down, set `at731` equal to `at1211` (wide-pane = native height):

- `messages`: `at731: 595` (was 448)
- `pipeline`: `at731: 238` (was 191)
- `conversation`: `at731: 686` (was 643)

Leave fixtures that already match at both widths. Leave gantt/class/state/pie as measured (gantt/class/state/pie estimators mostly ignore width already).

Add an explicit regression:

```ts
test("flowchart and sequence height guesses do not shrink with a narrower pane", () => {
  const flow = fence("flowchart TB\n  A --> B --> C --> D --> E");
  const seq = fence(
    "sequenceDiagram\n  Alice->>Bob: hi\n  Bob->>Alice: yo\n  Alice->>Bob: ok",
  );
  assert.equal(mermaidBlockHeight(flow, 731), mermaidBlockHeight(flow, 1211));
  assert.equal(mermaidBlockHeight(seq, 731), mermaidBlockHeight(seq, 1211));
});
```

- [ ] **Step 2: Run height tests to verify failure**

Run: `cd packages/markdown && pnpm exec node --import tsx --test src/webview/ui/mermaid-height.test.ts`

Expected: FAIL — guesses still shrink; new regression fails; some DRAWN quarters may fail.

- [ ] **Step 3: Remove `fitted()` usage for flowchart and sequence**

In `mermaid-height.ts`:

1. Delete or stop using `fitted` for flowchart/sequence.
2. Change flowchart:

```ts
function flowchart(diagram: Diagram, _width: number): number {
  const direction = diagram.header.split(/\s+/u)[1] ?? "tb";
  const { count, widest } = layers(graphEdges(diagram.statements, FLOW_ARROW));
  const subgraphs = diagram.statements.filter((line) =>
    line.startsWith("subgraph"),
  ).length;
  if (direction === "lr" || direction === "rl") {
    return 40 + widest * 75 + subgraphs * 90;
  }
  return count * 105 + subgraphs * 90;
}
```

3. Change sequence — return the accumulated `height` without `fitted(...)`.
4. Replace the file comment that says diagrams “scale down to fit” with: native-size types (`useMaxWidth: false`) keep full height; pane width does not scale the reserve.

Keep `width` parameter on `mermaidBlockHeight` / helpers for API stability (callers still pass pane width).

- [ ] **Step 4: Run height tests**

Run: `cd packages/markdown && pnpm exec node --import tsx --test src/webview/ui/mermaid-height.test.ts`

Expected: PASS. If a DRAWN fixture fails the ±25% band after removing fitted, adjust that fixture’s `at1211`/`at731` to the new guess only when the guess matches the **intent** of native size; prefer Host GUI remount of true SVG height for any large miss before inventing numbers.

- [ ] **Step 5: Commit**

```bash
git add packages/markdown/src/webview/ui/mermaid-height.ts \
  packages/markdown/src/webview/ui/mermaid-height.test.ts
git commit -m "fix(mermaid): stop fit-width height reserves for native diagrams"
```

---

### Task 4: Package test sweep + Host GUI / PR handoff

**Files:**
- None required beyond prior tasks (verification + process)

**Interfaces:**
- Consumes: Tasks 1–3 commits
- Produces: green unit suite; @Slave Host GUI request; PR with screenshots

- [ ] **Step 1: Run diagram + height related tests together**

Run:

```bash
cd packages/markdown && pnpm exec node --import tsx --test \
  src/plugins/diagrams/diagrams.test.ts \
  src/plugins/diagrams/mermaid-guard.test.ts \
  src/plugins/diagrams/clone-svg.test.ts \
  src/webview/ui/mermaid-height.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Message @Slave for Host GUI**

Ask Slave to verify on a real Cursor/VS Code client:

1. Dark theme: small flowchart + wide flowchart — colors match Obsidian invert (not stock Mermaid dark).
2. Light theme: no invert; default Mermaid palette.
3. Small flowchart does not stretch to pane width; wide flowchart scrolls horizontally; readable node size.
4. Inspect/lightbox dark: same invert on cloned SVG.
5. Dump computed SVG `width` / `style` for flowchart (expect pixel width, not `100%`).
6. Capture before/after screenshots for the PR description.

- [ ] **Step 3: Open PR (after Host GUI)**

Branch from main; PR body must include repro + before/after screenshots. Note #445/#446 unchanged for sizing CSS. Link the design spec path.

- [ ] **Step 4: Final commit only if Host GUI forced a small fix**

If Host GUI found residual shrink or missing inspector filter, fix in a follow-up commit on the same branch; do not expand scope.

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| CSS invert dark (LP) | Task 1 |
| CSS invert dark (lightbox) | Task 1 |
| `--font-mermaid` token | Task 1 |
| Always Mermaid default theme | Task 2 |
| Cache/init ignore appearance | Task 2 |
| Keep useMaxWidth map / max-width none | Tasks 1–2 (unchanged) |
| Drop `fitted()` for native types | Task 3 |
| Re-baseline height tests | Task 3 |
| Host GUI + PR screenshots | Task 4 |
| Out of scope (Mermaid downgrade, new skin) | Not tasked |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-30-mermaid-obsidian-visual-parity.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with checkpoints  

Which approach?
