# Obsidian parity observations

Reference: Obsidian 1.13.7, to be compared by the owner in a disposable vault. Never use the owner's vault. Record date, method, observed result and any issue link in each row. Automated checks do not establish visual or behavioral parity. All rows start not observed.

| Action or behavior (DESIGN §13–§15) | Obsidian observation: date and method | Workshop result | How checked | Status |
| --- | --- | --- | --- | --- |
| `document` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `editor` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: Tab, Shift+Tab, Home and Cmd+Left measured | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `dialect` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `commands` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `vault` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `resources` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `render` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `livePreview` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `markers` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `properties` | 2026-10-17, measured by editing the same properties in a throwaway vault over the DevTools protocol: adding and removing list items, items that need quoting, new properties and headers, Add alias, Clear file properties | Matches the measured YAML: block lists two spaces in, an empty list as a bare key, quotes only where needed; a list followed by a comment keeps its style | Differential probe (Obsidian and the browser harness); unit tests pin each rule | behaviour measured; visual parity not observed |
| `inlineTitle` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `links` | 2026-10-17, measured by clicking the same rendered element in a throwaway vault over the DevTools protocol: plain, Cmd, Cmd+Alt, Alt, Shift and double clicks; edges of the text; links in headings, lists, quotes, callouts and tables; unresolved wikilinks | Matches the measured behaviour (docs/OBSIDIAN_REVEAL_RULES.md rule 12); Cmd-click opens a tab VS Code keeps | Differential click probe (Obsidian and the browser harness); unit tests pin each rule | behaviour measured; visual parity not observed |
| `embeds` | 2026-10-17, measured by clicking the same rendered element in a throwaway vault over the DevTools protocol: a click selects an embedded note, links inside it open; on Obsidian 1.14.4 a click selects an image, and `+`, `-`, `0`, Enter, Tab and Backspace resize, reset, edit and remove it | Matches the measured behaviour (docs/OBSIDIAN_REVEAL_RULES.md rule 12), checked in an isolated VS Code | Differential probes (Obsidian, the browser harness and a throwaway VS Code spec); unit tests pin the size rules | behaviour measured; visual parity not observed |
| `tables` | 2026-10-18, measured over the DevTools protocol in a throwaway vault: which lines after a table are rows (a header starting with `\|` takes rows starting with `\|` at the margin; a bare header takes rows with a `\|` that do not start with one); Vim in tables measured 2026-10-12 (obsidian-measurements/tables/vim-obsidian.md) | Matches the measured row rule | Parser probe and unit tests | behaviour measured; visual parity not observed |
| `callouts` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: a click selects the whole callout | Matches the measured behaviour (docs/OBSIDIAN_REVEAL_RULES.md rule 11) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `math` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: preview kept below the source while editing; a click selects the formula; source highlighted | Matches the measured behaviour (docs/OBSIDIAN_REVEAL_RULES.md rule 6 and 11) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `diagrams` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: click and double-click keep the diagram; Edit selects the code | Matches the measured behaviour (docs/OBSIDIAN_REVEAL_RULES.md rule 11) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `codeBlocks` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `footnotes` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `tasks` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: Cmd+L toggles the checkbox status | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `tags` | 2026-10-17, measured by clicking the same rendered element in a throwaway vault over the DevTools protocol: a click places the caret and searches for the tag | Matches the measured behaviour (docs/OBSIDIAN_REVEAL_RULES.md rule 12) | Differential click probe (Obsidian and the browser harness); unit tests pin each rule | behaviour measured; visual parity not observed |
| `suggest` | 2026-10-17, measured by typing and accepting the same suggestions in a throwaway vault over the DevTools protocol (Enter, Tab and Escape on links, headings and tags, with `]]` already there, mid-line, and while an alias is typed); ranking re-measured on Obsidian 1.14.4, whose fuzzy search now ranks letters that start words higher | Matches: Enter finishes the link or adds a tag's space, Tab takes the text only, the note stays offered while an alias is typed; scores and ranges equal Obsidian's own on 2,463 query and text pairs; lists for 36 queries match except exact ties, which follow each app's file order | Differential probe (Obsidian's suggester and its public fuzzy search, and Workshop's, over the same notes); unit tests pin each rule | behaviour measured |
| `pagePreview` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `outline` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `backlinks` | not observed | not manually observed | Off by default (owner decision): turn the switch on first. Manual scenario pending; automated evidence is in phase records | not observed |
| `outgoingLinks` | not observed | not manually observed | Off by default (owner decision): turn the switch on first. Manual scenario pending; automated evidence is in phase records | not observed |
| `search` | 2026-10-17, measured by running the same 55 queries with Obsidian's search over the same notes: words, phrases, OR, negation, regex, case, `tag:`, `path:`, `file:`, `[property]`, `task:`, `line:`, `block:`, `section:`, `content:` | Matches the measured results in all 55 | Differential probe (Obsidian's search and Workshop's evaluator over the same files); unit tests pin the rules | behaviour measured; the results view not compared |
| `folding` | 2026-10-17, measured by running the same fold commands on the same notes in a throwaway vault over the DevTools protocol: Fold all, Unfold all, Toggle fold on every line, Fold more, Fold less, Toggle fold properties; headings, lists, indented text, code blocks, callouts | Matches the measured behaviour in all 122 cases (src/plugins/folding/README.md) | Differential fold probe (Obsidian and the browser harness); unit tests pin each rule | behaviour measured; visual parity not observed |
| `lineNumbers` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `gitDiffEditor` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `gitBlame` | No Obsidian core equivalent | Current-line authorship in Live Preview | Manual acceptance in docs/MANUAL_TEST_PLAN.md; snapshot/epoch/porcelain unit coverage | Intentional extension |
| `gitInline` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `gitGutter` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `indentGuides` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `stickyScroll` | No Obsidian core equivalent | On-by-default pinned section headings in Live Preview and Source | Unit model/lifecycle/overlay coverage; owner-run stickyScroll manual scenarios pending | Intentional extension |
| `vim` | 2026-10-29, engine keymap/`defaultExCommandMap` match Obsidian 1.14.4 vim.js (plus Lumière folds/IME/tables); intentional fix for real-Vim `: 123` go-to-line (Obsidian/vim-core share the leading-space bug). Prior: 2026-10-18, measured by typing the same keys in Obsidian 1.14.4 (Vim on) in a throwaway vault over the DevTools protocol: 76 cases of input in Live Preview (lists, tasks, quotes, auto-pairing, links, headings, code, counts, operators, visual mode, undo, dot repeat, renumbering, motions into tables, math, code and callouts) | 72 of 76 match the note and caret; the 4 left are an Obsidian `fT` quirk and table cases where the probe placed the caret inside a table without a key, not a path users take (keyed entry is measured in obsidian-measurements/tables/vim-obsidian.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each fix | behaviour measured; visual parity not observed |
| `autoPair` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: pairs, wrap-only = ~ $ %, fence completion | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `smartLists` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: Enter, Shift+Enter, Backspace and quotes | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `pasteHtml` | 2026-10-17, measured by pasting the same HTML into a throwaway vault over the DevTools protocol: 60 cases (formatting, headings, lists, tables, code, quotes, links, images, Google Docs and GitHub markup) | Matches the measured Markdown in 59; Markdown characters in the text are escaped on purpose (src/plugins/pasteHtml/README.md) | Differential paste probe (Obsidian and the browser harness); unit tests pin each rule | behaviour measured; visual parity not observed |
| `attachments` | not observed | Drop/paste/HTML-paste images into `files.attachmentFolder` with timestamp names; Import Asset removed | Unit tests (attachments core, sketch placement) | not observed |
| `spellcheck` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `formatting` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: Cmd+B, Cmd+I, Cmd+K and Cmd+/ | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `copyLinkForAgent` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `linkUpdates` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `settings` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `quickSwitcher` | 2026-10-17, read from Obsidian 1.14.4's switcher and checked with its public fuzzy search | Same scoring as suggestions: name, then path a point lower, attachments listed, excluded files 10 lower; an empty query lists recently modified rather than recently opened notes (src/plugins/quickSwitcher/README.md) | Unit tests pin each rule | behaviour measured; visual parity not observed |
| `wordCount` | 2026-10-17, measured by reading Obsidian 1.14.4's status bar for the same 76 texts in a throwaway vault over the DevTools protocol: punctuation, numbers, hyphens, apostrophes, Markdown, Han, kana, Korean, Hindi, Tamil, Thai, emoji, properties, line breaks | Matches all 76 (src/plugins/wordCount/README.md) | Differential probe (Obsidian's counts and Workshop's over the same texts); unit tests pin each rule | behaviour measured; visual parity not observed |
| `toggleBold` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: caret, word, selection and unwrap | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `toggleItalics` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: caret, word, selection and unwrap | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `toggleStrikethrough` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `toggleHighlight` | 2026-10-17, measured against Obsidian 1.14.4 in a throwaway vault: a caret or selection inside a highlight (a coloured one too) unwraps it whole; a selection over highlights merges them | Matches the measured text (test/unit/formatting/highlight-colours.test.ts) | Differential probe; unit tests | behaviour measured |
| `toggleCode` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `toggleComment` | 2026-10-17, measured against Obsidian 1.14.4 in a throwaway vault: wraps the word or selection in `%%…%%` (1.12 padded it with spaces); unwrapping keeps the spaces inside | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `toggleInlineMath` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `insertMathBlock` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `insertLink` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: [sel](|) and [|]() | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `insertWikilink` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `insertEmbed` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `insertTable` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `insertHorizontalRule` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `insertFootnote` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `insertCallout` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `setHeading0`…`setHeading6` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `toggleChecklist` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: text, bullet, number, quote and empty line | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `cycleListChecklist` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `toggleBulletList`, `toggleNumberedList`, `toggleBlockquote` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `swapLineUp`, `swapLineDown` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `followLink` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `openLinkToSide` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `foldAll`, `unfoldAll`, `toggleFold` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `addProperty` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| table commands (insert/move/delete row and column, align, sort) | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `toggleSourceMode` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `openAsText` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `toggleTextEditor` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `goToLine` | Go to line | Ctrl+G prompts for a line and jumps in Live Preview / Source (Host GUI BH-033) | Unit + Host GUI BH-033 | not observed |
| Default editing mode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Readable line length | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Strict line breaks | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Properties in document | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Show inline title | not observed | Off by default (owner decision, 2026-10-09; Obsidian shows it); when on, the file name above line 1 | Manual scenario pending; automated evidence is in phase records | not observed |
| Fold heading, Fold indent | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Show line numbers | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Show indentation guides | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Right-to-left | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Spellcheck | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Auto pair brackets / Markdown syntax | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Smart lists | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Indent using tabs, Tab indent size | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Auto convert HTML | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Vim key bindings | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| New link format | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Use [[Wikilinks]] | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Automatically update internal links | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Default location for new notes | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Default location for new attachments | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Excluded files | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| (no equivalent) | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **links**: plain click reveals a rendered link (BH-020) | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Cmd/Ctrl-click follows in the same editor (BH-020) | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| a click that ends a text selection only selects | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Unresolved   wikilinks get `is-unresolved` styling while not revealed, from   `vault.unresolvedLinks` (the host pushes the note's set when it changes after   each re-resolution, through `VaultIndex.onDidResolve`: panel kernels do not   see the window's `vault/resolved` event) | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Opening goes through `links/open` (§16) | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Cmd/Ctrl+Alt+click   opens to the side. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **suggest**: sources are `[[` files and frontmatter `aliases` and unresolved   link texts | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `[[Note#` headings | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `[[Note#^` and `[[^^` blocks | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `#` tags | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Scoring uses Obsidian's fuzzy formula (study §8 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `src/shared/fuzzy.ts`   replaces `shared/match.ts`), with each CJK character its own token | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Accepting   closes `]]` (reusing an auto-inserted one) and inserts `vault.linkText`. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **outline**: a native Explorer tree view (like PDF Outline) of the active editor's headings, with click to reveal and current-heading tracking, plus Go to Heading on Ctrl+Shift+O in Workshop; VS Code's built-in Markdown provider supplies Outline and breadcrumbs in the plain text editor | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| This removes the in-webview outline panel and its   **Toggle Outline** title action. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **backlinks** and **outgoingLinks**: native views (an Explorer section, or a   view container per §25) | not observed | not manually observed | Off by default (owner decision): turn the switch on first. Manual scenario pending; automated evidence is in phase records | not observed |
| Group by file, one trimmed context line per   reference, collapsed **Unlinked mentions** section (basename occurrences   outside links, computed on demand), and a status bar count for the active   note (inverting `resolvedLinks`). | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **tags**: the **Tags** view is hierarchical (`a/b/c` counts toward `a/b` and   `a`), merges case and keeps the most frequent casing, and searches on click | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Tag search uses the index, not a full read of the workspace. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **linkUpdates**: on `files/willRename` (from   `workspace.onWillRenameFiles`), rewrite incoming links and embeds through   `vault.backlinks`, keeping aliases, subpaths and the link style | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| The default,   `prompt`, shows a **Update links in N files?** dialog | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `always` and `never`   skip it | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Heading renames are a later enhancement. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **quickSwitcher**: **Lumière: Quick Switcher** opens a quick pick   over notes, aliases and unresolved links, with Obsidian's scoring | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Enter   opens | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| an unresolved or new name creates the note in the configured   new-note folder. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **wordCount**: words and characters for the note or selection in the status   bar, counting CJK characters individually. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **properties**: everything in the source, including types per vault (now   keyed by vault root from §12.1, not the `AGENTS.md`+`SCHEMA.md` heuristic),   chips, sorting, drag ordering, structured clipboard (`obsidian/properties`),   draft reconciliation, and `Cmd/Ctrl+;` **Add file property**. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **search**: query parsing and evaluation stay (`search/query.ts`,   `evaluate.ts`, worker) | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| File discovery and reading use the vault index and   its content cache instead of `findFiles` per run | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Operators backed by the   index (`tag:`, `path:`, `file:`, `[property:value]`) skip reading files. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.insertCallout | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.save | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.undo | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.redo | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.close | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.saveClose | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.openAsText | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleTextEditor | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.goToLine | Go to line | Ctrl+G Go to Line… on custom editor (Host GUI BH-033) | Unit + Host GUI BH-033 | not observed |
| Command: lumiere.markdown.ideContext.copy | no Obsidian equivalent | Copy deeper IDE-context packet (clipboard-first) | Unit tests in test/unit/ide-context/ and test/unit/ideContext/ | not observed |
| Command: lumiere.markdown.ideContext.send | no Obsidian equivalent | Send IDE-context packet via forced/sole-agent/picker (never silent-guess) | Unit tests in test/unit/ide-context/ and test/unit/ideContext/ | not observed |
| Command: lumiere.markdown.cursorBridge.chat | no Obsidian equivalent | Cursor Chat with MW selection (Cursor-host only) | Unit tests in test/unit/cursor-bridge/ | not observed |
| Command: lumiere.markdown.cursorBridge.edit | no Obsidian equivalent | Cursor Edit with MW selection; native apply | Unit tests in test/unit/cursor-bridge/ | not observed |
| Command: lumiere.markdown.cursorBridge.dismissEditMirror | no Obsidian equivalent | Status-bar dismiss of Cursor Edit mirror; returns to Lumière | Unit tests in test/unit/cursor-bridge/ | not observed |
| Command: lumiere.markdown.copyLinkForAgent | no Obsidian equivalent | VS Code chat prefilled or Cursor agent chat + clipboard when that is the only agent; otherwise copy to paste (no guessing between agents); `copyLinkForAgent.target` forces Claude Code (prefilled) or Codex (attached file) | Unit tests in test/unit/copy-link-for-agent/chat.test.ts; local DeepSeek round trip recorded in HANDOVER.md | not observed |
| Command: lumiere.markdown.insertEmbed | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.foldAll | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.unfoldAll | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleFold | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.insertFootnote | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleBold | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleItalics | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleStrikethrough | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleHighlight | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleHighlightRed | 2026-10-17, measured against Obsidian 1.14.4's command of the same name in a throwaway vault | Matches the measured text in all 30 cases: wraps, recolours, splits, merges and removes (test/unit/formatting/highlight-colours.test.ts); the selection after a split stays on the selected text | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.toggleHighlightOrange | 2026-10-17, measured against Obsidian 1.14.4's command of the same name in a throwaway vault | Matches the measured text in all 30 cases: wraps, recolours, splits, merges and removes (test/unit/formatting/highlight-colours.test.ts); the selection after a split stays on the selected text | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.toggleHighlightYellow | 2026-10-17, measured against Obsidian 1.14.4's command of the same name in a throwaway vault | Matches the measured text in all 30 cases: wraps, recolours, splits, merges and removes (test/unit/formatting/highlight-colours.test.ts); the selection after a split stays on the selected text | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.toggleHighlightGreen | 2026-10-17, measured against Obsidian 1.14.4's command of the same name in a throwaway vault | Matches the measured text in all 30 cases: wraps, recolours, splits, merges and removes (test/unit/formatting/highlight-colours.test.ts); the selection after a split stays on the selected text | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.toggleHighlightBlue | 2026-10-17, measured against Obsidian 1.14.4's command of the same name in a throwaway vault | Matches the measured text in all 30 cases: wraps, recolours, splits, merges and removes (test/unit/formatting/highlight-colours.test.ts); the selection after a split stays on the selected text | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.toggleHighlightPurple | 2026-10-17, measured against Obsidian 1.14.4's command of the same name in a throwaway vault | Matches the measured text in all 30 cases: wraps, recolours, splits, merges and removes (test/unit/formatting/highlight-colours.test.ts); the selection after a split stays on the selected text | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.toggleCode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleComment | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.insertLink | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.insertHorizontalRule | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.insertCodeBlock | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: fences around the selected lines | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.insertTag | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: `#` before the selection | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.clearFormatting | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches, except links keep their syntax (Obsidian turns `[l](u)` into `lu`) | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.deleteParagraph | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: CodeMirror's delete line, as Obsidian's; unbound (Cmd+D is VS Code's) | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.addCursorAbove | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches; bound to Cmd+Alt+Up as in VS Code (Obsidian binds no key) | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.addCursorBelow | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches; bound to Cmd+Alt+Down as in VS Code (Obsidian binds no key) | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.toggleBulletList | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleNumberedList | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleBlockquote | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.swapLineUp | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.swapLineDown | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.setHeading0 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.setHeading1 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.setHeading2 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.setHeading3 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.setHeading4 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.setHeading5 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.setHeading6 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.insertWikilink | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.followLink | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.openLinkToSide | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.openLinkInNewTab | 2026-10-17, measured against Obsidian's Open link under cursor in new tab (Cmd-click opens the same tab) in a throwaway vault | Opens the link in a tab VS Code keeps | Differential click probe; unit tests | behaviour measured |
| Command: lumiere.markdown.renameHeading | 2026-10-17, measured against Obsidian's Rename heading in a throwaway vault | Matches: the heading and its single-level `#subpath` links in the note and in linking notes (aliases, embeds, Markdown links); nested subpaths are left, as in Obsidian | Unit tests; real VS Code check | behaviour measured |
| Command: lumiere.markdown.toggleSourceMode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleInlineMath | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.insertMathBlock | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.addProperty | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.openSettings | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.setNoteFontSize | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.increaseFontSize | 2026-10-17, measured against Obsidian 1.14.4's command of the same name in a throwaway vault | Matches: a pixel a step, at most 30, no notice; it changes the note font size setting | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.decreaseFontSize | 2026-10-17, measured against Obsidian 1.14.4's command of the same name in a throwaway vault | Matches: a pixel a step, at least 10, no notice; it changes the note font size setting | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.changeSetting | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleLineNumbers | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.gitDiffEditor.open | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleInlineGitChanges | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.gitGutter.nextChange | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.gitGutter.previousChange | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.gitGutter.showChange | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleReadableLineWidth | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleMermaid | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleInlineTitle | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleVim | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleSpellcheck | Obsidian's Toggle spellcheck | Flips `plugins.spellcheck.enabled`, the Settings UI's own key | Unit tests (settings toggles) | not observed |
| Command: lumiere.markdown.quickSwitcher | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.insertSketch | Apple Notes' drawings (Obsidian has none built in) | Opens the canvas where the host has one (the iPad), saves `*.sketch.svg` in the attachment folder and embeds it | Unit tests (sketch flows, placement) | not observed |
| Command: lumiere.markdown.insertTable | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableInsertRowAbove | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableInsertRowBelow | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableInsertColumnLeft | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableInsertColumnRight | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableDeleteRow | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableDeleteColumn | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableDuplicateRow | Obsidian's Duplicate row | Duplicates the row in the grid | Unit tests | not observed |
| Command: lumiere.markdown.tableDuplicateColumn | Obsidian's Duplicate column | Duplicates the column in the grid | Unit tests | not observed |
| Command: lumiere.markdown.tableMoveRowUp | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableMoveRowDown | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableMoveColumnLeft | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableMoveColumnRight | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableAlignLeft | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableAlignCenter | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableAlignRight | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableSortAscending | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tableSortDescending | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.toggleChecklist | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.cycleListChecklist | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.consumeVimHostShortcut | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.attachments.enabled | not observed | Default on; saves dropped/pasted images under `files.attachmentFolder` | Unit tests (attachments core) | not observed |
| Setting: lumiere.markdown.plugins.autoPair.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.backlinks.enabled |
| Setting: lumiere.markdown.backlinks.sortOrder | not observed | not manually observed | Manual scenario pending | not observed | not observed | not manually observed | Off by default (owner decision): turn the switch on first. Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.callouts.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.codeBlocks.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.ideContext.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.cursorBridge.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.agentBridge.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.diagrams.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.embeds.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.onlineVideos.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.folding.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.footnotes.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.formatting.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.indentGuides.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.stickyScroll.enabled | No Obsidian core equivalent | Default true | Owner-run stickyScroll manual scenarios pending | Intentional extension |
| Setting: lumiere.markdown.stickyScroll.maxLines | No Obsidian core equivalent | Default 5; 1–6, rounded down, with a pane-height limit | Unit row-budget coverage; owner-run stickyScroll manual scenarios pending | Intentional extension |
| Setting: lumiere.markdown.plugins.inlineTitle.enabled | not observed | Default false | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.lineNumbers.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.gitDiffEditor.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.gitDiffEditor.diffEditor | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.gitBlame.enabled | No Obsidian core equivalent | Default off; one plugin switch | Manual acceptance in docs/MANUAL_TEST_PLAN.md | Intentional extension |
| Setting: lumiere.markdown.plugins.gitInline.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.gitGutter.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.gitGutter.compareTo | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.linkUpdates.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.links.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.math.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.outgoingLinks.enabled | not observed | not manually observed | Off by default (owner decision): turn the switch on first. Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.outline.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.pagePreview.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.pasteHtml.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.properties.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.quickSwitcher.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.search.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.sketch.enabled | not applicable | Turns Insert Sketch and tap-to-edit off; sketches still show as images | Unit tests (sketch host) | not observed |
| Setting: lumiere.markdown.plugins.smartLists.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.spellcheck.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.suggest.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.tables.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.tags.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.tasks.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.vim.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.vim.caretStyle | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.plugins.wordCount.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.autoPair.brackets | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.autoPair.markdown | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.editor.defaultMode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.editor.readableLineLength | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.editor.reclaimTextEditor | not applicable (Cursor-only) | not manually observed | Unit tests for the decision; verified in Cursor 3.24.9 | not applicable |
| Setting: lumiere.markdown.editor.warmTextDocument | not applicable (Cursor-only) | not manually observed | Unit tests for the decision; workaround for Cursor uninitialized custom-editor documents | not applicable |
| Setting: lumiere.markdown.editor.strictLineBreaks | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.editor.rightToLeft | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.editor.useTabs | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.editor.tabSize | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.editor.dragScrollSpeed | not observed; Workshop-specific speed control | not manually observed | Unit speed/schema/lifecycle coverage; Editor manual scenario 8 | deliberate configurable default (4x CodeMirror) |
| Setting: lumiere.markdown.editor.fontSize | Obsidian 1.14.4 default body 16px; H1-H6 1.618/1.462/1.318/1.188/1.076/1em (docs/obsidian-measurements/font-size-results-16.json) | not manually observed | Browser and real VS Code specs: body size equals the setting, heading ratios, line-number alignment | matches at the default |
| Setting: lumiere.markdown.editor.lineHeight | Obsidian 1.14.4 default 1.5 (24px at 16px) | not manually observed | Browser and real VS Code specs: line height equals the setting times the size, line-number alignment | matches at the default |
| Setting: lumiere.markdown.folding.heading | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.folding.indent | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.linkUpdates.mode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.links.newLinkFormat | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.links.useWikilinks | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.links.folderNote | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.files.newNoteFolder | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.files.attachmentFolder | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.properties.display | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.properties.listPreviewCount | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.onlineVideos.bilibiliPlayer | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.tags.viewSort | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.tags.viewNested | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tags.sortByFrequency | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tags.sortByName | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tags.enableNested | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.tags.disableNested | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.vault.rootMarkers | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.vault.excludedFiles | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: lumiere.markdown.preset | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Add File Property and Open as Text title actions | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Native static context menu; contextual table/property menus | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Vim host-collision keys only while Vim is enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Vim :w, :q, :wq, :x, :u and :red | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Verify bindings left unbound | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| VS Code owns save, undo/redo, hot exit and settings | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Note line height is Obsidian's 1.5 times the note's own font size; family, weight, spacing and ligatures follow VS Code's editor settings for Markdown | Obsidian 1.14.4: body 1.5 (24px at 16px, 36px at 24px), headings 1.2/1.2/1.3/1.4/1.5/1.5, code and footnotes 1.5, table cells 1.3 (`docs/obsidian-measurements/font-size-results-16.json`, `-24.json`) | Owner decision, 2026-10-10: `lumiere.markdown.editor.lineHeight` (default 1.5, a multiple) replaces following `editor.lineHeight` and VS Code's 1.35 rule; table cells keep the note's ratio, not Obsidian's 1.3 | Browser `font-size.spec.ts`, `stable-blocks.spec.ts`; real VS Code `font-size.spec.ts`, `font.spec.ts` | not observed |
| Theme follows VS Code colors | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Rename link updates prompt by default | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Native outline/backlinks/tags views | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Webview CSP (DESIGN §19): `default-src 'none'`, nonce scripts, `connect-src ${cspSource} blob:`, no remote content in untrusted workspaces | not applicable | not manually observed | Manual scenario pending; `test/unit/editor/webview-html.test.ts` | not observed |
| External application schemes prompt; own application scheme opens directly | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: lumiere.markdown.titleActions | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.selectionActions | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.plugins.external | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.copyLinkForAgent.target | no Obsidian equivalent | forces the agent Copy Link for Agent opens | Unit tests in test/unit/copy-link-for-agent/chat.test.ts | not observed |
| Setting: lumiere.markdown.debug.logging | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.useForMarkdownInWorkspace | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.managePlugins | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.showPluginStatus | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.jumpBack | separate per-pane note history | not manually observed | Local precise-jump manual scenarios; host history units | not observed |
| Command: lumiere.markdown.jumpForward | separate per-pane note history | not manually observed | Local precise-jump manual scenarios; host history units | not observed |
| Command: lumiere.markdown.openCopiedAgentReference | no Obsidian equivalent | not manually observed | Copied-reference manual scenarios and API units | not observed |
| Command: lumiere.markdown.bridge.copyEnvelope | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.bridge.envelope | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.marp.preview | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.marp.export | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.marp.toggle | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.marp.moveOutside | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.marp.keepInWorkshop | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.scratch.new | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.scratch.promote | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.wiki.copyForAgent | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.wiki.copyEnvelope | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.wiki.showLayout | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.wiki.refresh | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.plugins.bridge.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.plugins.marp.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.plugins.scratch.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.plugins.wiki.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.marp.open | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.scratch.folder | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.backlinks.sortByAlphabetical | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.backlinks.sortByAlphabeticalReverse | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.backlinks.sortByModifiedTime | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.backlinks.sortByModifiedTimeReverse | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outgoingLinks.sortByAlphabetical | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outgoingLinks.sortByAlphabeticalReverse | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outgoingLinks.sortByModifiedTime | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outgoingLinks.sortByModifiedTimeReverse | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outline.expandAll | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outline.enableFollowCursor | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outline.disableFollowCursor | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outline.toggle | not observed | not manually observed | Unit command routing and shortcut guard tests; relocated-view manual scenario pending | not observed |
| Command: lumiere.markdown.outline.goToHeading | not observed | not manually observed | Unit picker, source-offset, stale-selection and shortcut tests; manual scenario pending | not observed |
| Setting: lumiere.markdown.outgoingLinks.sortOrder | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.outline.followCursor | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.outline.expandMode | No Obsidian core equivalent | Default accordion; all expands every parent | Unit accordion follow tests; manual scenario pending | Intentional extension |
| Command: lumiere.markdown.graph.open | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.graph.chooseBundle | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.plugins.graph.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.plugins.okfCore.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.graph.maxNodes | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.graph.maxEdges | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.graph.defaultMode | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.graph.localDepth | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.graph.colorBy | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.okfCore.bundles | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.plugins.obsidianCompat.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.obsidianCompat.configFolder | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.foldMore | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches the measured behaviour | Differential fold probe; unit tests | behaviour measured |
| Command: lumiere.markdown.foldLess | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches the measured behaviour | Differential fold probe; unit tests | behaviour measured |
| Command: lumiere.markdown.toggleFoldProperties | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches the measured behaviour | Differential probe | behaviour measured |
| Command: lumiere.markdown.addAlias | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: an empty `aliases` property (a new header right before the text), then the caret in it | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.clearProperties | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: the whole properties block goes | Differential probe; unit tests | behaviour measured |
| Command: lumiere.markdown.backlinks.enableExtraContext | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.backlinks.disableExtraContext | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.backlinks.extraContext | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.math.macros | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outgoingLinks.enableExtraContext | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.outgoingLinks.disableExtraContext | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: lumiere.markdown.outgoingLinks.extraContext | not observed | not manually observed | Manual scenario pending | not observed |
| Command: lumiere.markdown.handleVimCtrlN | not observed | not manually observed | Manual scenario pending | not observed |
| Submenu: lumiere.markdown.menu.format | not observed | not manually observed | Manual scenario pending | not observed |
| Submenu: lumiere.markdown.menu.highlight | not observed | not manually observed | Manual scenario pending | not observed |
| Submenu: lumiere.markdown.menu.insert | not observed | not manually observed | Manual scenario pending | not observed |
