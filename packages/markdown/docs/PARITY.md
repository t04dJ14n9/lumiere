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
| `embeds` | 2026-10-17, measured by clicking the same rendered element in a throwaway vault over the DevTools protocol: a click selects an embedded note, links inside it open, a click on an image does nothing | Matches the measured behaviour (docs/OBSIDIAN_REVEAL_RULES.md rule 12) | Differential click probe (Obsidian and the browser harness); unit tests pin each rule | behaviour measured; visual parity not observed |
| `tables` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
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
| `stickyScroll` | No Obsidian core equivalent | Opt-in pinned section headings in Live Preview and Source | Unit model/lifecycle/overlay coverage; owner-run stickyScroll manual scenarios pending | Intentional extension |
| `vim` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `autoPair` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: pairs, wrap-only = ~ $ %, fence completion | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `smartLists` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: Enter, Shift+Enter, Backspace and quotes | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
| `pasteHtml` | 2026-10-17, measured by pasting the same HTML into a throwaway vault over the DevTools protocol: 60 cases (formatting, headings, lists, tables, code, quotes, links, images, Google Docs and GitHub markup) | Matches the measured Markdown in 59; Markdown characters in the text are escaped on purpose (src/plugins/pasteHtml/README.md) | Differential paste probe (Obsidian and the browser harness); unit tests pin each rule | behaviour measured; visual parity not observed |
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
| `toggleHighlight` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `toggleCode` | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| `toggleComment` | 2026-10-17, behaviour measured over the DevTools protocol in a throwaway vault: wraps the word or selection in %% … %%; unwrap also removes the padding (deliberate) | Matches the measured behaviour (docs/OBSIDIAN_KEYS.md) | Differential probe (Obsidian and the browser harness, same keys); unit tests pin each rule | behaviour measured; visual parity not observed |
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
| **links**: plain click opens a rendered link | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Cmd/Ctrl-click opens revealed   source | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
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
| **quickSwitcher**: **Markdown Workshop: Quick Switcher** opens a quick pick   over notes, aliases and unresolved links, with Obsidian's scoring | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Enter   opens | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| an unresolved or new name creates the note in the configured   new-note folder. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **wordCount**: words and characters for the note or selection in the status   bar, counting CJK characters individually. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **properties**: everything in the source, including types per vault (now   keyed by vault root from §12.1, not the `AGENTS.md`+`SCHEMA.md` heuristic),   chips, sorting, drag ordering, structured clipboard (`obsidian/properties`),   draft reconciliation, and `Cmd/Ctrl+;` **Add file property**. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| **search**: query parsing and evaluation stay (`search/query.ts`,   `evaluate.ts`, worker) | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| File discovery and reading use the vault index and   its content cache instead of `findFiles` per run | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Operators backed by the   index (`tag:`, `path:`, `file:`, `[property:value]`) skip reading files. | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.insertCallout | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.save | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.undo | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.redo | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.close | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.saveClose | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.openAsText | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.ideContext.copy | no Obsidian equivalent | Copy deeper IDE-context packet (clipboard-first) | Unit tests in test/unit/ide-context/ and test/unit/ideContext/ | not observed |
| Command: markdownWorkshop.ideContext.send | no Obsidian equivalent | Send IDE-context packet via forced/sole-agent/picker (never silent-guess) | Unit tests in test/unit/ide-context/ and test/unit/ideContext/ | not observed |
| Command: markdownWorkshop.cursorBridge.chat | no Obsidian equivalent | Cursor Chat with MW selection (Cursor-host only) | Unit tests in test/unit/cursor-bridge/ | not observed |
| Command: markdownWorkshop.cursorBridge.edit | no Obsidian equivalent | Cursor Edit with MW selection; native apply | Unit tests in test/unit/cursor-bridge/ | not observed |
| Command: markdownWorkshop.copyLinkForAgent | no Obsidian equivalent | VS Code chat prefilled or Cursor agent chat + clipboard when that is the only agent; otherwise copy to paste (no guessing between agents); `copyLinkForAgent.target` forces Claude Code (prefilled) or Codex (attached file) | Unit tests in test/unit/copy-link-for-agent/chat.test.ts; local DeepSeek round trip recorded in HANDOVER.md | not observed |
| Command: markdownWorkshop.insertEmbed | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.foldAll | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.unfoldAll | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleFold | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.insertFootnote | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleBold | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleItalics | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleStrikethrough | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleHighlight | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleCode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleComment | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.insertLink | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.insertHorizontalRule | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.insertCodeBlock | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: fences around the selected lines | Differential probe; unit tests | behaviour measured |
| Command: markdownWorkshop.insertTag | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: `#` before the selection | Differential probe; unit tests | behaviour measured |
| Command: markdownWorkshop.clearFormatting | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches, except links keep their syntax (Obsidian turns `[l](u)` into `lu`) | Differential probe; unit tests | behaviour measured |
| Command: markdownWorkshop.deleteParagraph | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: CodeMirror's delete line, as Obsidian's; unbound (Cmd+D is VS Code's) | Differential probe; unit tests | behaviour measured |
| Command: markdownWorkshop.addCursorAbove | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches; bound to Cmd+Alt+Up as in VS Code (Obsidian binds no key) | Differential probe; unit tests | behaviour measured |
| Command: markdownWorkshop.addCursorBelow | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches; bound to Cmd+Alt+Down as in VS Code (Obsidian binds no key) | Differential probe; unit tests | behaviour measured |
| Command: markdownWorkshop.toggleBulletList | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleNumberedList | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleBlockquote | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.swapLineUp | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.swapLineDown | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.setHeading0 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.setHeading1 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.setHeading2 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.setHeading3 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.setHeading4 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.setHeading5 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.setHeading6 | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.insertWikilink | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.followLink | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.openLinkToSide | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.openLinkInNewTab | 2026-10-17, measured against Obsidian's Open link under cursor in new tab (Cmd-click opens the same tab) in a throwaway vault | Opens the link in a tab VS Code keeps | Differential click probe; unit tests | behaviour measured |
| Command: markdownWorkshop.renameHeading | 2026-10-17, measured against Obsidian's Rename heading in a throwaway vault | Matches: the heading and its single-level `#subpath` links in the note and in linking notes (aliases, embeds, Markdown links); nested subpaths are left, as in Obsidian | Unit tests; real VS Code check | behaviour measured |
| Command: markdownWorkshop.toggleSourceMode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleInlineMath | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.insertMathBlock | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.addProperty | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.openSettings | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.setNoteFontSize | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.changeSetting | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleLineNumbers | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.gitDiffEditor.open | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleInlineGitChanges | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.gitGutter.nextChange | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.gitGutter.previousChange | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.gitGutter.showChange | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleReadableLineWidth | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleMermaid | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleInlineTitle | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleVim | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleSpellcheck | Obsidian's Toggle spellcheck | Flips `plugins.spellcheck.enabled`, the Settings UI's own key | Unit tests (settings toggles) | not observed |
| Command: markdownWorkshop.quickSwitcher | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.insertTable | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableInsertRowAbove | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableInsertRowBelow | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableInsertColumnLeft | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableInsertColumnRight | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableDeleteRow | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableDeleteColumn | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableDuplicateRow | Obsidian's Duplicate row | Duplicates the row in the grid | Unit tests | not observed |
| Command: markdownWorkshop.tableDuplicateColumn | Obsidian's Duplicate column | Duplicates the column in the grid | Unit tests | not observed |
| Command: markdownWorkshop.tableMoveRowUp | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableMoveRowDown | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableMoveColumnLeft | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableMoveColumnRight | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableAlignLeft | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableAlignCenter | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableAlignRight | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableSortAscending | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.tableSortDescending | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.toggleChecklist | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.cycleListChecklist | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.consumeVimHostShortcut | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.autoPair.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.backlinks.enabled | not observed | not manually observed | Off by default (owner decision): turn the switch on first. Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.callouts.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.codeBlocks.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.ideContext.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.cursorBridge.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.agentBridge.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.diagrams.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.embeds.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.onlineVideos.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.folding.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.footnotes.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.formatting.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.indentGuides.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.stickyScroll.enabled | No Obsidian core equivalent | Default false | Owner-run stickyScroll manual scenarios pending | Intentional extension |
| Setting: markdownWorkshop.stickyScroll.maxLines | No Obsidian core equivalent | Default 5; 1–6, rounded down, with a pane-height limit | Unit row-budget coverage; owner-run stickyScroll manual scenarios pending | Intentional extension |
| Setting: markdownWorkshop.plugins.inlineTitle.enabled | not observed | Default false | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.lineNumbers.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.gitDiffEditor.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.gitDiffEditor.diffEditor | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.gitBlame.enabled | No Obsidian core equivalent | Default on; one plugin switch | Manual acceptance in docs/MANUAL_TEST_PLAN.md | Intentional extension |
| Setting: markdownWorkshop.plugins.gitInline.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.gitGutter.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.gitGutter.compareTo | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.linkUpdates.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.links.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.math.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.outgoingLinks.enabled | not observed | not manually observed | Off by default (owner decision): turn the switch on first. Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.outline.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.pagePreview.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.pasteHtml.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.properties.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.quickSwitcher.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.search.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.smartLists.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.spellcheck.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.suggest.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.tables.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.tags.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.tasks.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.vim.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.plugins.wordCount.enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.autoPair.brackets | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.autoPair.markdown | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.editor.defaultMode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.editor.readableLineLength | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.editor.reclaimTextEditor | not applicable (Cursor-only) | not manually observed | Unit tests for the decision; verified in Cursor 3.24.9 | not applicable |
| Setting: markdownWorkshop.editor.warmTextDocument | not applicable (Cursor-only) | not manually observed | Unit tests for the decision; workaround for Cursor uninitialized custom-editor documents | not applicable |
| Setting: markdownWorkshop.editor.strictLineBreaks | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.editor.rightToLeft | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.editor.useTabs | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.editor.tabSize | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.editor.dragScrollSpeed | not observed; Workshop-specific speed control | not manually observed | Unit speed/schema/lifecycle coverage; Editor manual scenario 8 | deliberate configurable default (4x CodeMirror) |
| Setting: markdownWorkshop.editor.fontSize | Obsidian 1.14.4 default body 16px; H1-H6 1.618/1.462/1.318/1.188/1.076/1em (docs/obsidian-measurements/font-size-results-16.json) | not manually observed | Browser and real VS Code specs: body size equals the setting, heading ratios, line-number alignment | matches at the default |
| Setting: markdownWorkshop.editor.lineHeight | Obsidian 1.14.4 default 1.5 (24px at 16px) | not manually observed | Browser and real VS Code specs: line height equals the setting times the size, line-number alignment | matches at the default |
| Setting: markdownWorkshop.folding.heading | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.folding.indent | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.linkUpdates.mode | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.links.newLinkFormat | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.links.useWikilinks | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.links.folderNote | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.files.newNoteFolder | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.files.attachmentFolder | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.properties.display | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.onlineVideos.bilibiliPlayer | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.tags.viewSort | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.tags.viewNested | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.vault.rootMarkers | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.vault.excludedFiles | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Setting: markdownWorkshop.preset | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Add File Property and Open as Text title actions | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Native static context menu; contextual table/property menus | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Vim host-collision keys only while Vim is enabled | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Vim :w, :q, :wq, :x, :u and :red | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Verify bindings left unbound | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| VS Code owns save, undo/redo, hot exit and settings | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Note line height is Obsidian's 1.5 times the note's own font size; family, weight, spacing and ligatures follow VS Code's editor settings for Markdown | Obsidian 1.14.4: body 1.5 (24px at 16px, 36px at 24px), headings 1.2/1.2/1.3/1.4/1.5/1.5, code and footnotes 1.5, table cells 1.3 (`docs/obsidian-measurements/font-size-results-16.json`, `-24.json`) | Owner decision, 2026-10-10: `markdownWorkshop.editor.lineHeight` (default 1.5, a multiple) replaces following `editor.lineHeight` and VS Code's 1.35 rule; table cells keep the note's ratio, not Obsidian's 1.3 | Browser `font-size.spec.ts`, `stable-blocks.spec.ts`; real VS Code `font-size.spec.ts`, `font.spec.ts` | not observed |
| Theme follows VS Code colors | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Rename link updates prompt by default | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Native outline/backlinks/tags views | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Webview CSP (DESIGN §19): `default-src 'none'`, nonce scripts, `connect-src ${cspSource} blob:`, no remote content in untrusted workspaces | not applicable | not manually observed | Manual scenario pending; `test/unit/editor/webview-html.test.ts` | not observed |
| External application schemes prompt; own application scheme opens directly | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |
| Command: markdownWorkshop.titleActions | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.selectionActions | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.external | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.copyLinkForAgent.target | no Obsidian equivalent | forces the agent Copy Link for Agent opens | Unit tests in test/unit/copy-link-for-agent/chat.test.ts | not observed |
| Setting: markdownWorkshop.debug.logging | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.useForMarkdownInWorkspace | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.managePlugins | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.showPluginStatus | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.jumpBack | separate per-pane note history | not manually observed | Local precise-jump manual scenarios; host history units | not observed |
| Command: markdownWorkshop.jumpForward | separate per-pane note history | not manually observed | Local precise-jump manual scenarios; host history units | not observed |
| Command: markdownWorkshop.openCopiedAgentReference | no Obsidian equivalent | not manually observed | Copied-reference manual scenarios and API units | not observed |
| Command: markdownWorkshop.assets.import | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.bridge.copyEnvelope | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.bridge.envelope | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.marp.preview | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.marp.export | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.marp.toggle | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.marp.moveOutside | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.marp.keepInWorkshop | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.scratch.new | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.scratch.promote | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.wiki.copyForAgent | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.wiki.copyEnvelope | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.wiki.showLayout | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.wiki.refresh | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.assets.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.bridge.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.marp.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.scratch.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.wiki.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.assets.path | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.marp.open | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.scratch.folder | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.outline.expandAll | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.outline.enableFollowCursor | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.outline.disableFollowCursor | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.outline.toggle | not observed | not manually observed | Unit command routing and shortcut guard tests; relocated-view manual scenario pending | not observed |
| Command: markdownWorkshop.outline.goToHeading | not observed | not manually observed | Unit picker, source-offset, stale-selection and shortcut tests; manual scenario pending | not observed |
| Setting: markdownWorkshop.outline.followCursor | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.graph.open | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.graph.chooseBundle | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.graph.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.okfCore.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.sourcesProperty.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.graph.maxNodes | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.graph.maxEdges | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.graph.defaultMode | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.graph.localDepth | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.graph.colorBy | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.okfCore.bundles | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.plugins.obsidianCompat.enabled | not observed | not manually observed | Manual scenario pending | not observed |
| Setting: markdownWorkshop.obsidianCompat.configFolder | not observed | not manually observed | Manual scenario pending | not observed |
| Command: markdownWorkshop.foldMore | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches the measured behaviour | Differential fold probe; unit tests | behaviour measured |
| Command: markdownWorkshop.foldLess | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches the measured behaviour | Differential fold probe; unit tests | behaviour measured |
| Command: markdownWorkshop.toggleFoldProperties | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches the measured behaviour | Differential probe | behaviour measured |
| Command: markdownWorkshop.addAlias | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: an empty `aliases` property (a new header right before the text), then the caret in it | Differential probe; unit tests | behaviour measured |
| Command: markdownWorkshop.clearProperties | 2026-10-17, measured against Obsidian's command of the same name in a throwaway vault | Matches: the whole properties block goes | Differential probe; unit tests | behaviour measured |
