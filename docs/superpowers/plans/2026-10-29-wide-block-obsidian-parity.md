# Wide-block Obsidian parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Mermaid, images, and tables at natural readable size in Live Preview with horizontal scroll instead of shrink-to-fit, matching Obsidian REA.

**Architecture:** CSS-first changes plus Mermaid `initialize` `useMaxWidth` flags from Obsidian. No shared viewport component. Lightbox Mermaid zoom and Lumière image zoom/resize chrome stay as they are.

**Tech Stack:** TypeScript, Mermaid, CodeMirror 6 Live Preview widgets, CSS in plugin stylesheets, Node test runner (`node:test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-29-wide-block-obsidian-parity-design.md`
- Mermaid: `useMaxWidth: false` for flowchart, sequence, git, er; `true` for gantt, journey, class, state, pie
- Inline Mermaid: `overflow-x: auto` only; height grows with diagram; no vertical cap; zoom only in lightbox
- Images/tables: natural width + `overflow-x` scroll; keep image zoom/resize and table col-resize
- Do not introduce a shared wide-block wrapper
- Host GUI after VSIX when code lands; never commit PNGs

---

### Task 1: Mermaid `useMaxWidth` + fontFamily init

**Files:**
- Modify: `packages/markdown/src/plugins/diagrams/renderer.ts` (mermaid.initialize block ~140–147)
- Modify: `packages/markdown/src/plugins/diagrams/mermaid-guard.test.ts` (init assertion in existing initialize test)
- Modify: `packages/markdown/src/plugins/diagrams/README.md` (one short paragraph on sizing)

**Interfaces:**
- Consumes: existing `DiagramRenderer.renderMermaidSvg` init gate (`lastInitKey`)
- Produces: `mermaid.initialize` options including Obsidian per-type `useMaxWidth` and `themeVariables.fontFamily`

- [ ] **Step 1: Extend the initialize test to require Obsidian flags**

In `mermaid-guard.test.ts`, inside `DiagramRenderer initializes mermaid only when theme or trust changes`, capture the object passed to `mermaid.initialize` and assert:

```ts
assert.equal(initArg.flowchart?.useMaxWidth, false);
assert.equal(initArg.sequence?.useMaxWidth, false);
assert.equal(initArg.git?.useMaxWidth, false);
assert.equal(initArg.er?.useMaxWidth, false);
assert.equal(initArg.gantt?.useMaxWidth, true);
assert.equal(initArg.journey?.useMaxWidth, true);
assert.equal(initArg.class?.useMaxWidth, true);
assert.equal(initArg.state?.useMaxWidth, true);
assert.equal(initArg.pie?.useMaxWidth, true);
assert.equal(
  initArg.themeVariables?.fontFamily,
  "var(--font-mermaid, var(--vscode-editor-font-family, inherit))",
);
```

Keep existing htmlLabels/theme/trust init-once behavior.

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd packages/markdown && pnpm exec tsx --test src/plugins/diagrams/mermaid-guard.test.ts`

Expected: FAIL on missing `useMaxWidth` / `themeVariables`.

- [ ] **Step 3: Implement initialize options**

Replace the `mermaid.initialize({...})` call body with (preserve `htmlLabels`, `flowchart.htmlLabels`, `suppressErrorRendering`, `theme`, `securityLevel`, `startOnLoad`):

```ts
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  htmlLabels: trusted,
  flowchart: { htmlLabels: trusted, useMaxWidth: false },
  sequence: { useMaxWidth: false },
  git: { useMaxWidth: false },
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
  theme,
});
```

Note: if Mermaid’s typed options use `class:` as reserved, use the same shape Obsidian uses (`class:{useMaxWidth:!0}`) via a typed cast only if the build requires it.

- [ ] **Step 4: Run test — expect PASS**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Document in diagrams README**

Add under sizing / Live Preview: Obsidian per-type `useMaxWidth`; inline host scrolls horizontally; no shrink via CSS `max-width: 100%` (Task 2).

- [ ] **Step 6: Commit**

```bash
git add packages/markdown/src/plugins/diagrams/renderer.ts \
  packages/markdown/src/plugins/diagrams/mermaid-guard.test.ts \
  packages/markdown/src/plugins/diagrams/README.md
git commit -m "fix(markdown): Mermaid useMaxWidth per Obsidian diagram types"
```

---

### Task 2: Mermaid CSS — stop SVG shrink-to-fit

**Files:**
- Modify: `packages/markdown/src/plugins/diagrams/diagrams.css`
- Create or modify: `packages/markdown/src/plugins/diagrams/diagrams.test.ts` (CSS string assertions)

**Interfaces:**
- Consumes: existing `pre[data-fence="mermaid"]` host with `overflow-x: auto`
- Produces: SVG without `max-width: 100%` shrink

- [ ] **Step 1: Write failing CSS regression test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "diagrams.css"),
  "utf8",
);

test("mermaid SVG is not shrink-to-fit with max-width 100%", () => {
  const svgRule = css.match(
    /pre\[data-fence="mermaid"\] svg\s*\{[^}]*\}/,
  )?.[0];
  assert.ok(svgRule, "expected svg rule");
  assert.equal(/\bmax-width\s*:\s*100%/.test(svgRule), false);
});

test("mermaid fence keeps overflow-x auto", () => {
  const host = css.match(
    /pre\[data-fence="mermaid"\]:has\(> svg\)\s*\{[^}]*\}/,
  )?.[0];
  assert.ok(host);
  assert.match(host, /overflow-x\s*:\s*auto/);
});
```

If `diagrams.test.ts` already exists with other tests, append these; do not delete existing coverage.

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd packages/markdown && pnpm exec tsx --test src/plugins/diagrams/diagrams.test.ts`

Expected: FAIL on `max-width: 100%` still present.

- [ ] **Step 3: Remove shrink from CSS**

In `diagrams.css`, change:

```css
pre[data-fence="mermaid"] svg {
  max-width: 100%;
  height: auto;
  /* ... pointer-events / user-select unchanged ... */
}
```

to:

```css
pre[data-fence="mermaid"] svg {
  /* Obsidian: native SVG size (useMaxWidth false types); host scrolls. */
  max-width: none;
  height: auto;
  /* ... keep pointer-events / user-select ... */
}
```

Keep `pre[data-fence="mermaid"]:has(> svg) { overflow-x: auto; ... }`. Do not add max-height.

- [ ] **Step 4: Run test — expect PASS**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/markdown/src/plugins/diagrams/diagrams.css \
  packages/markdown/src/plugins/diagrams/diagrams.test.ts
git commit -m "fix(markdown): stop Mermaid SVG shrink-to-fit; overflow-x host"
```

---

### Task 3: Images — natural width + overflow-x

**Files:**
- Modify: `packages/markdown/src/plugins/embeds/embeds.css` (`.image-embed` / `.image-wrapper img` Live Preview rules only — not `.image-inspector` lightbox fit rules)
- Create: `packages/markdown/src/plugins/embeds/wide-block.test.ts` (CSS assertions)

**Interfaces:**
- Consumes: existing `.image-embed` host
- Produces: host that can scroll horizontally when image is wider than pane; img not forced to `max-width: 100%` shrink for natural-size display

- [ ] **Step 1: Write failing CSS tests**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "embeds.css"),
  "utf8",
);

test("Live Preview image-embed allows overflow-x for wide images", () => {
  // After change: a dedicated LP rule or updated .image-embed includes overflow-x: auto
  assert.match(css, /\.image-embed[^{]*\{[^}]*overflow-x\s*:\s*auto/s);
});

test("Live Preview image-embed does not clamp with max-width 100%", () => {
  // Strip lightbox .image-inspector rules before asserting LP host
  const withoutInspector = css.replace(/\.image-inspector[\s\S]*?(?=\n\/\*|\n\.file-embed|\n\.pdf-embed|$)/, "");
  // Prefer: no max-width:100% on .image-embed { ... } blocks used in LP
  const hosts = [...withoutInspector.matchAll(/\.image-embed\s*\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(hosts.length >= 1);
  for (const rule of hosts) {
    assert.equal(/\bmax-width\s*:\s*100%/.test(rule), false, rule);
  }
});
```

Adjust the strip regex if needed so lightbox `.image-inspector img { max-width: 100% }` remains allowed.

- [ ] **Step 2: Run — expect FAIL**

`cd packages/markdown && pnpm exec tsx --test src/plugins/embeds/wide-block.test.ts`

- [ ] **Step 3: CSS change**

For each Live Preview `.image-embed { ... }` block (there may be two duplicates — update both consistently):

- Set `max-width: none` (or remove `max-width: 100%`)
- Add `overflow-x: auto`
- Keep `width: fit-content`, resize corner, embed-actions

Do **not** change `.image-inspector` fit/actual-size rules.

If `.image-wrapper img` or `img:not([width]) { width: 100% }` exists and forces shrink inside a clamped host, stop that clamp for LP natural size (prefer Obsidian-like: host scrolls; optional `width: auto; max-width: none` on the img when no explicit width attribute is required for “don’t shrink”). Document the chosen rule in a one-line CSS comment citing the spec.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/markdown/src/plugins/embeds/embeds.css \
  packages/markdown/src/plugins/embeds/wide-block.test.ts
git commit -m "fix(markdown): image-embed natural width + overflow-x"
```

---

### Task 4: Tables — confirm overflow-x; fix only if shrink remains

**Files:**
- Modify only if needed: `packages/markdown/src/plugins/tables/tables.css`
- Create: `packages/markdown/src/plugins/tables/wide-block.test.ts`

**Interfaces:**
- Consumes: existing `.table-scroll` (`overflow-x: auto`, `contain: inline-size`) and `.table-wrapper { width: max-content }`
- Produces: documented guarantee that tables are not shrink-to-fit

- [ ] **Step 1: Write regression test asserting current Obsidian-like layout**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "tables.css"),
  "utf8",
);

test("table-scroll uses overflow-x auto", () => {
  const rule = css.match(/\.table-scroll\s*\{[^}]*\}/)?.[0];
  assert.ok(rule);
  assert.match(rule, /overflow-x\s*:\s*auto/);
});

test("table-wrapper is max-content width (no shrink-to-fit)", () => {
  const rule = css.match(/\.table-wrapper\s*\{[^}]*\}/)?.[0];
  assert.ok(rule);
  assert.match(rule, /width\s*:\s*max-content/);
});
```

- [ ] **Step 2: Run — expect PASS** (tables already match)

If FAIL, fix CSS minimally to restore `overflow-x: auto` + `width: max-content` without adding height caps.

- [ ] **Step 3: Commit**

```bash
git add packages/markdown/src/plugins/tables/wide-block.test.ts \
  packages/markdown/src/plugins/tables/tables.css
git commit -m "test(markdown): lock table wide-block overflow-x parity"
```

---

### Task 5: Package test + Host GUI prep note

**Files:**
- Modify: PR body / Host GUI brief under `/workspace/plans/lumiere-verify-merge-queue/` only on the bot box when verifying (not committed)

- [ ] **Step 1: Run markdown unit suite**

`cd packages/markdown && pnpm test` (or project’s usual unit script)

Expected: all pass.

- [ ] **Step 2: Commit any leftover doc nits on the feature branch; open/update PR**

Branch tip should include Tasks 1–4. PR description links the design spec and lists Host GUI checks: wide flowchart readable + h-scroll; image wider than pane scrolls; wide table still scrolls; lightbox Mermaid still works (#445 behavior).

- [ ] **Step 3: Host GUI (parent)**

Build VSIX, Reload Window, verify fixtures; upload shots as user-attachments; merge only after PASS + CI green.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Mermaid per-type useMaxWidth | 1 |
| font-mermaid / editor font | 1 |
| Remove SVG max-width 100% | 2 |
| overflow-x; no height cap | 2 |
| Lightbox zoom unchanged | 2 (no code change) |
| Images natural width + overflow-x | 3 |
| Keep image zoom chrome | 3 |
| Tables overflow-x / no shrink | 4 |
| No shared viewport | all |
| Host GUI | 5 |
