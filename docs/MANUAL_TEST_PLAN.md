# Manual acceptance plan

The owner runs these scenarios with computer use. Results are **not run**;
passing automated smoke checks is not evidence of manual acceptance or Obsidian
parity. Use a disposable copy of `test/fixtures/vault`, never an owner's vault.
Never install this development extension into an existing VS Code/Cursor profile.
The native smoke harness creates its own `/tmp/markdown-workbench-e2e-*` profile.

## document and editor (Phase 3)

1. **Typing, saving and native history.** Setup: open `Core.md` with Markdown
   Workbench. Steps: type ASCII, CJK with IME, emoji and multiple lines; save;
   undo and redo; use Save and Close then reopen. Expected: text and disk agree,
   IME characters are not duplicated, save finishes pending edits, undo/redo
   follows native history and focus returns to the editor.
2. **Two panels and external changes.** Setup: split `Core.md` into two
   Workbench panels and open it as text in another group. Steps: place distinct
   selections and scroll positions in both panels, edit in each, undo from
   the other, then edit in the text editor. Expected: all three share one
   document; selections and scroll remain independent; edits synchronize
   without replacing newer text. Repeat with a filesystem edit of a saved note.
3. **CRLF.** Setup: save a disposable copy of `Core.md` as CRLF using the text
   editor. Steps: edit across lines in Workbench, save, undo, and inspect EOL
   in the text editor. Expected: file stays CRLF; source selection offsets,
   emoji and edits do not drift.
4. **Clipboard and focus.** Setup: `Core.md`. Steps: keyboard copy/cut/paste a
   selection containing Markdown; undo a cut/paste; copy to a text editor.
   Expected: exact source text is copied; native history owns the edit.
   Host clipboard read/write is available to plugin menus through the editor
   service. Structured property clipboard and HTML conversion are Phase 4.
5. **Recovery and view transfer.** Setup: two panels of `Core.md` with distinct
   selections/modes/scroll. Steps: reload the window, reopen the note, and
   restore a captured view after a rename (inlineTitle scenario in Phase 4).
   Expected: unsaved text follows VS Code recovery; each view restores its own
   selection, mode, disclosure and scroll, without contaminating the other.
   During transfer edit the document: stale captures must be rejected.

## livePreview, dialect and render (Phase 3)

1. **Reveal and modes.** Setup: `Core.md`. Steps: move the caret into and out
   of each emphasis, heading, list and block; select across syntax; switch
   Live Preview/Source in one of two panels; use the minimal preset in a
   disposable workspace. Expected: syntax reveals at the selection (including
   the last character of a block); Source/minimal show source without widgets;
   the other panel's mode stays independent. IME and drag selections remain
   stable while crossing syntax.
2. **Block rendering and motion.** Setup: `Core.md`. Steps: click Edit on the
   code/HTML block, edit it, Escape out, move ArrowUp/Down over the rendered
   block. Repeat with a block at EOF. Expected: sanitized block rendering
   returns; arrows cross the block as one unit; Escape at EOF goes before it.
   A block occupying the entire file has no outside caret position and remains
   source until navigation or new text creates one.
3. **Renderer lifetime.** Setup: rendered blocks in `Core.md`. Steps: switch
   Source/Live Preview repeatedly, close/reopen and edit blocks quickly.
   Expected: no duplicate widgets, stale asynchronous output or controls from
   disposed render passes. Feature-specific rendering belongs to Phase 4.
4. **Sanitization.** Setup: copy `Core.md` and add script, iframe, event-handler
   HTML and remote media. Steps: open in an untrusted disposable workspace.
   Expected: scripts/handlers do not execute and remote content does not load;
   editor typing and saving still work.

## commands and resources (Phase 3)

1. **Core commands.** Setup: `Core.md`. Steps: run Save, Undo, Redo, Save and
   Close, Close, Open as Text, Toggle Live Preview/Source from the palette;
   repeat save/undo/redo using their keys. Expected: commands act on the active
   panel/document; pending edits flush before the host action.
2. **Containment.** Setup: disposable vault with an inside file and a symlink
   pointing outside it. Steps: request the files from a resource-using plugin
   once Phase 4 is delivered. Expected: inside files resolve; traversal,
   sibling-prefix and symlink escape requests fail. Remote virtual filesystem
   symlinks also fail. Vault refresh/root discovery is Phase 5.

## Later plugin acceptance (not yet delivered)

Retired source scenarios remain discoverable individually in TEST_LEDGER.md.
Their retirement changes the testing method, not the delivery requirements.
Phase 4 will add runnable setup/steps/results for folding, lineNumbers,
indentGuides, spellcheck, autoPair, smartLists, vim, formatting, links,
codeBlocks, math, diagrams, callouts, footnotes, tasks, embeds, pagePreview,
properties, tables, inlineTitle, tags, suggest, search, pasteHtml, copyForAgent
and markers. Include table row drag with scrolling before a single drop and
split-view footnote undo (the source's two intermittent scenarios).

Unbound pending owner verification: strikethrough, highlight, inline code,
comment (including Mod+/), and cycle list/checklist. No `verify` key is bound.
The old fuzzers are retired: manually exercise repeated typing/deleting,
selection replacement, commands and Vim sequences; no fuzz operation count is
claimed by this plan.
