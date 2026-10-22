# Obsidian Live Preview: when is raw Markdown revealed?

Measured on 2026-10-10 in **real Obsidian 1.14.4** (Live Preview, default settings, `/tmp/obsidian-test-vault`), driven over the Chrome DevTools protocol (`--remote-debugging-port`).
For every case the caret was moved to every character offset (`editor.setCursor`) and the *visible* text of the editor DOM was read. Text inside `.cm-transparent`, or in a `display:none` element, counts as hidden. The probes and raw results are in `/workspace/obsidian-probe/` (`inline.mjs`, `block.mjs`, `dump.mjs`, `sel.mjs`).

## Answer

**Obsidian does not reveal the whole line. It reveals only the element the caret touches, with a few line-level and block-level exceptions.**

1. **Inline elements** (bold, italic, strike, highlight, inline code, links, wikilinks, embeds, math, inline HTML, autolinks): the raw syntax of an element shows when the caret or selection is inside it **or touching its first or last character** (inclusive on both ends). Other elements on the same line stay rendered. **Images** (embedded or Markdown, inline or alone on a line) are the exception since Obsidian 1.13: they stay rendered whatever the caret or selection does, and show their source only after Enter or Tab on a selected image, until the caret leaves it (measured on 1.14.4).
2. **Elements that directly abut each other** (zero characters between them, e.g. `**a**~~b~~` or `[x](y)[[z]]**c**`) are revealed **together as a chain**. One character or a space between them breaks the chain.
3. **Nested elements** (e.g. `**b _i_ b**`, `[t **b** t](u)`, `==h `c` h==`): touching the **outermost** element reveals the outer *and every inner* element, even if the caret is not inside the inner one.
4. **Selections** (non-empty): every element the selected range overlaps or touches is revealed. With multiple cursors, each cursor reveals the elements it touches.
5. **Line-level exceptions** (revealed when the caret is anywhere on the line, regardless of position):
   - backslash escapes (`\*`, `\[`): all escapes on the line are shown;
   - heading `#` marks;
   - the `>` of a quote line (only the line the caret is on; the other lines of the quote keep their bars);
   - horizontal rules (`---`, `***`): source replaces the rule.
6. **Block-level exceptions** (revealed when the caret is anywhere in the block):
   - fenced code: the opening fence line (with language) and the closing fence are both shown; the body is always raw;
   - callouts: a rendered widget until the caret enters it; then every line becomes source (`> [!note] title`), with `>` shown only on the caret's line and inline elements still per-element;
   - display math `$$ … $$`: widget until the caret is inside, then the whole source, with the rendered formula kept below it (measured 2026-10-17: same height as before, under the closing `$$`). **Lumière differs (BH-009 / BH-004):** revealed display math is source only — no stacked preview under the `$$` lines;
   - HTML blocks: widget until the caret is inside, then the whole source.
7. **Task items**: `- [ ]` is revealed only when the caret touches that range (columns 0 to 5 inclusive, so not after the space); the item text never changes.
8. **Footnote definitions** `[^1]: text`: the `[^1]:` marker is revealed when the caret is on the line (a rendered number otherwise); inline elements in it follow rule 1.
9. **Never hidden** (raw always visible): list bullets and numbers (drawn by CSS), tags `#tag`, comments `%%…%%` (the `%%` stay visible), footnote references `[^1]` and `^[inline]` (Obsidian shows them raw).
10. **Never raw in Live Preview**: tables (a widget; the caret reveals the raw text of the *cell* it is in only) and frontmatter (Properties widget; raw only in Source mode or `propertiesInDocument: source`).

11. **Clicking a rendered block** (measured 2026-10-17 in a throwaway vault, by mouse clicks over the DevTools protocol): display math and callouts reveal on a click, which selects the formula (without the `$$` lines) or the whole callout, with the selection's head at its start. Inline math selects the formula without its `$`. Mermaid and other rendered code blocks stay rendered on a click or double-click; their "Edit this block" button reveals them with the code between the fences selected. The button does the same for math (the formula) and callouts (the whole block).

12. **Clicking links, tags, embeds, images and rules** (measured 2026-10-17 in a throwaway vault, 74 click cases, by clicking the same rendered element in Obsidian and in Workshop's editor and comparing the selection, the note and what was opened):
    - a plain click on a rendered link, wikilink, bare URL or autolink opens it and leaves the caret where it was, anywhere on its text including its first and last pixel, and inside headings, lists, quotes, callouts (body and title) and table cells; a double click opens it twice;
    - Cmd-click opens a note in a new tab, Cmd+Alt-click in a split; Alt-click places the caret in the link's source and Shift-click extends the selection there, without opening;
    - an unresolved wikilink opens (Obsidian creates the note);
    - a click on a tag places the caret where it was clicked and searches for `tag:#name`;
    - a click on an embedded note's content selects the whole embed source, the head at its start; a link inside the embedded note opens instead;
    - a click on an image, embedded or inline, selects it (Obsidian 1.13 and
      later; 1.12 did nothing), and so does ArrowRight with the caret just
      before it or ArrowLeft just after it (the next press moves past it):
      it stays rendered, outlined, with no Edit button; then `+` and `-`
      resize it in steps of 25 px
      (up to the text's width), `0` removes the size, Enter selects the file
      name, Tab goes where the size is written, Backspace or Delete removes
      the embed, and Escape or moving the caret lets it go;
    - a click on a drawn horizontal rule selects its source, the head at its start;
    - checkboxes toggle on a click, in lists, nested lists and callouts.

    Obsidian's Live Preview does not render a list inside a plain quote (`> - [ ] task` stays text), so there is no checkbox there to click. Workshop renders and toggles it, as Obsidian's reading view does: a deliberate difference.

Decision for our editor: follow all of this, **except** footnote references: ours stay LaTeX-style superscript with raw text when the caret is inside (the user's preference).

## Detail

Offsets are relative to the element's start; "touch" means `caret >= from && caret <= to`.

| Element | Example | Revealed when | Verified by |
|---|---|---|---|
| bold, italic, strike, highlight, inline code (several per line) | `aa **b** bb *i* cc ~~s~~ dd ==h== ee `c`` | caret in `[from,to]` of that element only | `inline.mjs` case "emphasis x5" |
| abutting elements | `**a**~~b~~==c==`d`_e_` | caret anywhere in the chain `[3,38]` reveals all five | "adjacent", "adj2", "adj-link" |
| elements separated by 1 char or a space | `**a**x~~b~~y==c==` | each independently | "gap1", "gap-space" |
| nested | `**b _i_ b**`, `==h `c` h==`, `***bi***` | caret touching the outer reveals outer + inner | "nested", "link-with-format" |
| link `[t](u)`, `[t][ref]`, `[t](<a b.md>)` | | element only | "links", "link variants" |
| wikilink `[[A]]`, `[[A|alias]]`, `[[A#H]]`, `[[A^b]]` | | element only | same |
| autolink `<https://…>` | | element only | "links" |
| bare URL | `https://z.io` | nothing to hide | "links" |
| embeds `![[x]]`, `![alt](x)`, `![[x|100]]` | | element only | "embeds" |
| math `$x$`, `$$x$$` inline | | element only | "math" |
| inline HTML `<b>x</b>`, `<span>` | | element only | "misc" |
| escapes `\*` `\[` | | **whole line** | "escapes" |
| tag, comment `%%c%%`, footnote ref `[^1]`, `^[inline]` | | never hidden | "misc", "footnote-inline" |
| selection | `aa **b1** bb **b2** cc **b3**`, select 5–17 | b1 (touched at 5) and b2 revealed, b3 hidden; select 10–11 (between) reveals none | `sel.mjs` |
| multi-cursor | cursors in b1 and b3 | b1 and b3 revealed, b2 hidden | `sel.mjs` |
| heading `# x` | `## H **b**` | `##` anywhere on the line; `**b**` only when touching | `block.mjs` b1 |
| list bullet / number | `- a`, `1. a` | never hidden | b1 |
| task `- [ ]` | | caret 0..5 | b2 (per column) |
| quote `> x` | 2 lines | `>` on the caret line only | b1 |
| callout | `> [!note] T`, `> body` | whole callout becomes source lines when the caret is in it; `>` only on the caret line | b3, c2, c3 |
| code fence | ```` ```js … ``` ```` | both fences when the caret is anywhere in the block | f.md |
| hr `---`, `***` | | that line | f.md |
| table | | never (cell-level raw only) | t.md |
| frontmatter | | never (Properties widget) | fm.md |
| footnote definition | `[^1]: text` | `[^1]:` on the caret line | fn.md |
| `$$` block | | whole block when the caret is inside | mix.md |
| HTML block `<div>` | | whole block when the caret is inside | mix.md |
| `%% … %%` comment block | | `%%` always visible; inner formatting per element | mix.md |

## Differences found in our editor (before this change)

Our rule was "an element is revealed when a selection range touches its own node", which matches rule 1 and 4, but:

- nested elements: the inner element stayed hidden when the caret was only in the outer one (rule 3);
- abutting elements were not chained (rule 2);
- escapes were revealed per escape, not per line (rule 5);
- quote marks were revealed for the whole quote, not per line (rule 5);
- see the results section below for the rest.

## Measured facts and our contract

Everything above the table's "boundary" rows is a **measured fact** about
Obsidian 1.14.4 (raw results and scripts: `obsidian-measurements/`). What our
tests pin is the **compatibility contract** derived from those facts, and each
exact-boundary rule (a caret touching an element's first or last character,
task columns 0-5, the quote marker) has a measured case behind it in
`inline-cases*.json` / `r*.json`. If Obsidian changes, re-measure with the
scripts, update the facts, and then change the contract and its tests.

## Intentional divergence: footnote references

Obsidian shows a footnote reference as a small superscript widget. Ours renders
LaTeX-style superscript and reveals the raw `[^id]` text when the caret is
inside. This is a deliberate product decision, not a measurement gap, and the
reveal tests for footnotes pin our rule, not Obsidian's.
