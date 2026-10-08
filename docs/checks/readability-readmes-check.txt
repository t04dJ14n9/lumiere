(node:16500) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

> vscode-markdown-workbench@0.1.0 check /Users/t04dj14n9/Code/vscode-markdown-workbench
> pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm contributions --check

(node:16534) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

> vscode-markdown-workbench@0.1.0 format:check /Users/t04dj14n9/Code/vscode-markdown-workbench
> prettier --check .

(node:16555) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
Checking formatting...
All matched files use Prettier code style!
(node:16608) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

> vscode-markdown-workbench@0.1.0 lint /Users/t04dj14n9/Code/vscode-markdown-workbench
> eslint . --max-warnings=0

(node:16628) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:16657) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

> vscode-markdown-workbench@0.1.0 typecheck /Users/t04dj14n9/Code/vscode-markdown-workbench
> tsc -p tsconfig.json && tsc -p src/host && tsc -p src/webview && tsc -p src/plugins/tsconfig.host.json && tsc -p src/plugins/tsconfig.webview.json && tsc -p src/workers && tsc -p test

(node:16805) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

> vscode-markdown-workbench@0.1.0 test /Users/t04dj14n9/Code/vscode-markdown-workbench
> node scripts/test.mjs

(node:16853) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:16854) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:16860) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:16861) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ callout insertion quotes every selected line in one source transaction [90m(5.161125ms)[39m[39m
(node:16862) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ callout transfer remaps local and nested identity and refreshes live disclosures [90m(0.851583ms)[39m[39m
(node:16863) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ highlighted clicks map indentation and UTF-16 back to fenced and indented source [90m(0.44275ms)[39m[39m
[32m✔ editable fence selection includes final characters but excludes a following line start [90m(0.447416ms)[39m[39m
(node:16864) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ command registration preserves async results, duplicate rejection and removal [90m(1.582833ms)[39m[39m
(node:16865) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ diagrams claim only the Mermaid fence language [90m(0.426209ms)[39m[39m
(node:16866) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ document flush rejects draft errors before transport and unregisters stopped participants [90m(1.331792ms)[39m[39m
(node:16867) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ plain input grouping follows adjacency, timing and selection boundaries [90m(1.776708ms)[39m[39m
[32m✔ explicit and remote edits end plain-input groups without overriding their annotations [90m(0.230833ms)[39m[39m
(node:16868) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ clipboard routes reads and writes through validated host RPC and removes handlers [90m(1.084209ms)[39m[39m
(node:16869) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ late view-state contributors restore validated data and carry unknown keys [90m(0.900916ms)[39m[39m
[32m✔ invalid contribution data is ignored independently; legacy keys restore on late registration [90m(0.255875ms)[39m[39m
[32m✔ disposing one contribution preserves its snapshot without reading it again or affecting another [90m(0.108291ms)[39m[39m
(node:16870) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ extension slots, rank and per-owner order survive removal and re-registration [90m(2.700916ms)[39m[39m
[32m✔ equal-ranked extension owners sort by ID independent of registration history [90m(0.3215ms)[39m[39m
(node:16871) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ editor indentation settings reconfigure without replacing document, selection or unrelated state [90m(1.570083ms)[39m[39m
(node:16872) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ image zoom restoration validates scale before using the legacy actual-size flag [90m(0.439375ms)[39m[39m
(node:16873) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ note transclusion retains full-document line offsets and detects cycles and missing sections [90m(4.903417ms)[39m[39m
(node:16874) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ WebM metadata identifies video and audio tracks without guessing the extension [90m(33.040875ms)[39m[39m
[32m✔ streaming preserves unknown-size cluster boundaries and orders complete blocks [90m(2.254125ms)[39m[39m
[32m✔ WebM rejects truncated and invalid unknown-size elements [90m(1.252333ms)[39m[39m
(node:16875) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ insertion uses an unused label, moves selection to its definition and supports EOF [90m(6.593708ms)[39m[39m
(node:16876) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ rendered-block footnotes resolve definitions and inline numbering in the owning note [90m(8.167208ms)[39m[39m
[32m✔ footnote preprocessing leaves missing references intact and reuses repeated definitions [90m(0.612667ms)[39m[39m
(node:16877) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ formatting toggles exact markers while retaining selection and obeying read-only [90m(34.302ms)[39m[39m
[32m✔ line commands exclude a final column-zero line and numbered lists toggle as a group [90m(0.436458ms)[39m[39m
[32m✔ insert link selects the URL while keeping the selected label [90m(0.120708ms)[39m[39m
[32m✔ clearing inline formatting retains comment contents, links and escaped literals [90m(0.843791ms)[39m[39m
[32m✔ caret formatting unwraps enclosing syntax and wraps a plain word [90m(10.803541ms)[39m[39m
[32m✔ formatting handles selected delimiters and independent multiple ranges [90m(13.269459ms)[39m[39m
(node:16878) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ links host owns handlers, fixes source identity, confirms schemes and routes side opens [90m(10.234791ms)[39m[39m
(node:16879) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ links retain aliases, Unicode fragments and source caret identity [90m(3.037875ms)[39m[39m
[32m✔ link requests reject malformed values and ambiguous paths [90m(0.262ms)[39m[39m
(node:16880) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ reveal includes both endpoints and every selection range [90m(3.314875ms)[39m[39m
[32m✔ vertical navigation skips rendered blocks and Escape leaves final source [90m(0.822458ms)[39m[39m
[32m✔ kernel disposal and Source mode remove the engine; registry effects add and remove [90m(2.476ms)[39m[39m
[32m✔ explicit renderer ranges cover multiline definitions without overlapping later nodes [90m(0.853625ms)[39m[39m
(node:16881) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ inline decorations retain basic marks, rendered links and deduplicated heading lines [90m(8.240208ms)[39m[39m
[32m✔ custom inline renderers can retain detached context functions and replace core behavior [90m(0.314125ms)[39m[39m
(node:16882) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ math commands preserve selected formulas and unwrap the same source [90m(1.317292ms)[39m[39m
[32m✔ display math inserts a leading newline only inside an existing line [90m(0.224667ms)[39m[39m
(node:16883) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ page previews load only internal targets and fragments [90m(0.463375ms)[39m[39m
[32m✔ note previews retain source offsets and disable embedded task edits [90m(12.105792ms)[39m[39m
[32m✔ preview labels decode valid escapes and preserve malformed targets [90m(1.516458ms)[39m[39m
(node:16884) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property removal focuses the next surviving row, then the previous row [90m(0.4325ms)[39m[39m
[32m✔ property row keys preserve motion priority and Vim-only actions [90m(0.189084ms)[39m[39m
(node:16885) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property transactions combine a rename or removal with current displayed order [90m(4.469042ms)[39m[39m
[32m✔ property transactions reject stale input and preserve empty or explicit-order changes [90m(16.074583ms)[39m[39m
(node:16886) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property edits reject stale headers and combine displayed ordering with one source transaction [90m(6.975334ms)[39m[39m
[32m✔ chip editing tracks duplicate occurrences through concurrent list additions and removals [90m(0.106125ms)[39m[39m
[32m✔ property RPC rejects arbitrary preference types and oversized keys [90m(1.706ms)[39m[39m
[32m✔ type conversion leaves nested objects in source but permits scalar lists [90m(0.3285ms)[39m[39m
(node:16887) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property RPC shares preferences, validates keys and disposes handlers on disable [90m(7.250417ms)[39m[39m
(node:16888) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property lists accept YAML scalars without coercing values [90m(0.754833ms)[39m[39m
[32m✔ chip occurrence matching distinguishes scalar identity after concurrent changes [90m(0.108875ms)[39m[39m
(node:16889) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property sheet distinguishes editable scalars, list chips and escaped nested values [90m(5.704ms)[39m[39m
[32m✔ forced property types preserve warnings and editable control selection [90m(0.835875ms)[39m[39m
[32m✔ property rendering bounds recursive aliases and leaves absent frontmatter alone [90m(0.645792ms)[39m[39m
(node:16891) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property type preferences serialize concurrent writes and stay within their vault [90m(4.952208ms)[39m[39m
[32m✔ preference subscriptions notify separate panel consumers only until disposed [90m(0.185666ms)[39m[39m
(node:16893) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ render passes dispose in reverse order and immediately clean late registrations [90m(0.742917ms)[39m[39m
(node:16894) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ resource kinds preserve note and PDF precedence and unknown-file fallback [90m(0.9655ms)[39m[39m
(node:16895) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ cell projection preserves table syntax and the surrounding document [90m(0.925875ms)[39m[39m
[32m✔ axis selections and reverse rectangles use inclusive cell bounds [90m(0.471125ms)[39m[39m
[32m✔ cell movement wraps columns while retaining exit and append-row targets [90m(0.087542ms)[39m[39m
[32m✔ table menus preserve axis bounds, command focus and action order [90m(0.372625ms)[39m[39m
[32m✔ table command parsing keeps alignment validation and movement boundaries [90m(0.11825ms)[39m[39m
(node:16896) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ cell source projection retains entered whitespace and escapes pipes without a second history [90m(3.12375ms)[39m[39m
[32m✔ every contributed table command produces a valid operation and preserves an editable table [90m(5.300334ms)[39m[39m
[32m✔ table hit testing uses physical coordinates in RTL and source disclosure maps through edits [90m(0.405208ms)[39m[39m
(node:16897) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ task RPC authorizes known notes, rejects stale lines and stops with its fiber [90m(5.058375ms)[39m[39m
(node:16899) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ checkbox changes check the expected line and preserve quotes, labels and custom states [90m(1.312542ms)[39m[39m
[32m✔ checklist cycling preserves list identity and excludes a final column-zero line [90m(0.418042ms)[39m[39m
[32m✔ cycling a completed task without trailing text preserves the next line [90m(0.093083ms)[39m[39m
(node:16900) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ linked lines give one trimmed context line per link to the target [90m(23.669208ms)[39m[39m
[32m✔ unlinked mentions match whole words, any case, outside links and properties [90m(3.934042ms)[39m[39m
[32m✔ long context lines are cut around the mention [90m(1.150875ms)[39m[39m
(node:16901) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ package contributions match the generator [90m(90.818625ms)[39m[39m
[32m✔ the source ledger preserves the complete pinned inventory [90m(0.485959ms)[39m[39m
[32m✔ manifest surfaces match the host and webview registries [90m(2.310917ms)[39m[39m
(node:16902) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ document actions serialize across panels and a rejected action does not poison later actions [90m(2.14625ms)[39m[39m
[32m✔ a failed final document flush rejects native save despite event listener error isolation [90m(1.521042ms)[39m[39m
[32m✔ overlapping saves wait for the actual saved event and release their listener [90m(6.081208ms)[39m[39m
[32m✔ save failure releases subscriptions without declaring the document saved [90m(0.372375ms)[39m[39m
(node:16903) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ view capture flushes before reading version and rejects concurrent changes [90m(1.046709ms)[39m[39m
[32m✔ two panels keep independent transfer state and rename retains old disclosure identity [90m(0.176708ms)[39m[39m
[32m✔ restore clamps selection, replaces folds, and restores raw scroll without centering [90m(1.899916ms)[39m[39m
[32m✔ view-state rejects malformed fold ranges and accepts fractional scroll anchors [90m(0.32825ms)[39m[39m
(node:16904) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ feature modules never supply editor-wide singleton settings [90m(272.51775ms)[39m[39m
(node:16905) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ host feature commands disappear when disabled and target the current panel after switching [90m(27.357375ms)[39m[39m
(node:16906) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ tables: disabling and re-enabling disposes its extensions and commands [90m(4.172459ms)[39m[39m
[32m✔ properties: disabling and re-enabling disposes its extensions and commands [90m(2.496375ms)[39m[39m
[32m✔ pagePreview: disabling and re-enabling disposes its extensions and commands [90m(0.588958ms)[39m[39m
[32m✔ embeds: disabling and re-enabling disposes its extensions and commands [90m(0.837166ms)[39m[39m
[32m✔ tasks: disabling and re-enabling disposes its extensions and commands [90m(0.708ms)[39m[39m
[32m✔ footnotes: disabling and re-enabling disposes its extensions and commands [90m(7.716875ms)[39m[39m
[32m✔ callouts: disabling and re-enabling disposes its extensions and commands [90m(0.733333ms)[39m[39m
[32m✔ diagrams: disabling and re-enabling disposes its extensions and commands [90m(0.646542ms)[39m[39m
[32m✔ math: disabling and re-enabling disposes its extensions and commands [90m(0.465042ms)[39m[39m
[32m✔ codeBlocks: disabling and re-enabling disposes its extensions and commands [90m(0.625042ms)[39m[39m
[32m✔ links: disabling and re-enabling disposes its extensions and commands [90m(40.738916ms)[39m[39m
[32m✔ formatting: disabling and re-enabling disposes its extensions and commands [90m(0.626208ms)[39m[39m
[32m✔ lineNumbers: disabling and re-enabling disposes its extensions and commands [90m(0.50325ms)[39m[39m
[32m✔ folding: disabling and re-enabling disposes its extensions and commands [90m(0.68525ms)[39m[39m
[32m✔ indentGuides: disabling and re-enabling disposes its extensions and commands [90m(0.258791ms)[39m[39m
[32m✔ spellcheck: disabling and re-enabling disposes its extensions and commands [90m(0.200959ms)[39m[39m
[32m✔ autoPair: disabling and re-enabling disposes its extensions and commands [90m(0.301292ms)[39m[39m
[32m✔ smartLists: disabling and re-enabling disposes its extensions and commands [90m(0.200625ms)[39m[39m
[32m✔ vim: disabling and re-enabling disposes its extensions and commands [90m(0.458083ms)[39m[39m
[32m✔ queued setting updates settle on the latest configuration and recover after invalid input [90m(0.335583ms)[39m[39m
[32m✔ heading and indent folding respect independent settings and section boundaries [90m(0.5995ms)[39m[39m
[32m✔ pair settings separate Markdown from brackets and indentation uses tab stops [90m(0.075875ms)[39m[39m
[32m✔ catalog composition has the same ordered owners after every toggle as a fresh editor [90m(51.342208ms)[39m[39m
[32m✔ seeded catalog toggle sequence ends with fresh-start owner order [90m(44.445209ms)[39m[39m
[32m✔ folding owns ranges, restores late and preserves folds across configuration update [90m(2.587667ms)[39m[39m
[32m✔ catalog configuration changes preserve fresh-start ordered owners [90m(237.686916ms)[39m[39m
[32m✔ heading folding queries share metadata by Text identity and invalidate after edits [90m(0.864417ms)[39m[39m
[32m✔ each feature leaves core settings and other plugin folds intact when toggled [90m(20.479958ms)[39m[39m
[32m✔ fold gutter refreshes on configuration and tab width without requiring an edit [90m(0.333459ms)[39m[39m
(node:16907) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ caller-bound reads cache per context and refresh across provider replacement [90m(1.542333ms)[39m[39m
[32m✔ event slots and owner rank survive reversed loading, update and toggles [90m(0.645959ms)[39m[39m
[32m✔ equal-rank event owners keep lexical order across restart [90m(0.214584ms)[39m[39m
(node:16908) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ emit uses registration order, prepend, listener isolation, and effect cleanup [90m(1.286709ms)[39m[39m
[32m✔ serial awaits listeners; parallel starts all before awaiting [90m(0.236875ms)[39m[39m
[32m✔ bail skips throwing listeners and stops at first non-undefined; waterfall awaits transformations [90m(0.2375ms)[39m[39m
(node:16909) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ required services gate, withdraw, and resume independent of load order [90m(4.5035ms)[39m[39m
[32m✔ effects are LIFO, then children, then provided services withdraw; disposal errors are isolated [90m(0.429875ms)[39m[39m
[32m✔ duplicate providers fail without affecting consumers; replacement stacks restore the prior provider [90m(0.4165ms)[39m[39m
[32m✔ undeclared services throw; optional injection is allowed and refreshes on availability [90m(0.289209ms)[39m[39m
[32m✔ update reconfigures or restarts with validated config; failed apply retries and rolls back [90m(2.53225ms)[39m[39m
[32m✔ async failure rolls back effects and does not fail siblings [90m(5.436542ms)[39m[39m
[32m✔ disposal during async apply rejects late effects and never publishes a service [90m(0.192583ms)[39m[39m
[32m✔ Service class publishes only after async start and is withdrawn on stop [90m(0.502417ms)[39m[39m
[32m✔ logs identify plugin and record load and stop timings [90m(0.854084ms)[39m[39m
[32m✔ service withdrawal during loading invalidates the old activation and gates before restarting [90m(1.081417ms)[39m[39m
[32m✔ contexts can cross async boundaries without being mistaken for thenables [90m(0.168833ms)[39m[39m
(node:16910) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ RPC namespaces methods, validates results, and unregistering disables a channel [90m(1.450959ms)[39m[39m
[32m✔ RPC rejects invalid outbound params, drops malformed envelopes and inbound params [90m(3.039084ms)[39m[39m
[32m✔ invalid handler results and forged response payloads reject callers [90m(0.335666ms)[39m[39m
[32m✔ notifications validate both directions and isolate listeners [90m(1.616208ms)[39m[39m
[32m✔ timeout defaults to ten seconds, cancels remote work, and ignores a late result [90m(0.982709ms)[39m[39m
[32m✔ explicit cancellation and disposal reject requests and clean subscriptions [90m(0.355375ms)[39m[39m
[32m✔ disabling a handler cancels in-flight work and rejects its caller [90m(0.147417ms)[39m[39m
[32m✔ cancellation listeners can detach and late listeners observe cancellation immediately [90m(0.070416ms)[39m[39m
[32m✔ duplicate request IDs cannot replace an in-flight handler [90m(0.140875ms)[39m[39m
(node:16911) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ schemas validate every setting type, apply independent defaults and emit JSON Schema [90m(1.449208ms)[39m[39m
[32m✔ schema errors identify nested paths and record keys cannot pollute prototypes [90m(0.205ms)[39m[39m
[32m✔ schema bounds keep numeric, array and string measurement and JSON keywords aligned [90m(0.172417ms)[39m[39m
(node:16912) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ kernel stays under 1,000 formatted production lines [90m(0.8495ms)[39m[39m
[32m✔ typed event call sites use the declared dispatch mode [90m(536.257958ms)[39m[39m
(node:16913) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ pure tsconfig rejects DOM [90m(203.509291ms)[39m[39m
[32m✔ pure tsconfig rejects VS Code [90m(203.08125ms)[39m[39m
[32m✔ pure tsconfig rejects Node [90m(213.037458ms)[39m[39m
(node:16914) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ a rename asks once and returns one edit list for every linking note [90m(26.247667ms)[39m[39m
[32m✔ declining, or the never mode, changes nothing; always does not ask [90m(11.220792ms)[39m[39m
[32m✔ renaming a folder updates links to every file in it [90m(0.638333ms)[39m[39m
(node:16915) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ links to a renamed note keep their form, subpath and alias [90m(28.738208ms)[39m[39m
[32m✔ an attachment keeps its extension; formats follow the setting [90m(1.11625ms)[39m[39m
[32m✔ a name that becomes ambiguous is written as a path [90m(0.333375ms)[39m[39m
[32m✔ a moved note rewrites its own path-style links, not bare names [90m(0.277625ms)[39m[39m
[32m✔ links that do not touch a renamed file are left alone [90m(1.6225ms)[39m[39m
(node:16916) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ canvas validation rejects duplicate identities and invalid node payloads [90m(0.999667ms)[39m[39m
[32m✔ canvas edges require existing endpoints and valid side/end metadata [90m(0.207834ms)[39m[39m
[32m✔ canvas curves choose facing sides and route self loops around node bounds [90m(0.423959ms)[39m[39m
(node:16917) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ definition segments map continuations across blank lines without borrowing following prose [90m(3.162958ms)[39m[39m
[32m✔ candidate collection drops unmappable ranges and duplicate definitions retain last-label resolution [90m(1.196833ms)[39m[39m
(node:16919) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ callout aliases, fallback kinds and fold flags preserve distinct containers [90m(4.257375ms)[39m[39m
[32m✔ math delimiters and paragraph block IDs retain literal boundary behavior [90m(0.347083ms)[39m[39m
(node:16926) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property comparison keeps typed null, numeric operators and exact scalar matching [90m(0.647334ms)[39m[39m
[32m✔ search comparison guards recursive arrays and keeps regex sensitivity caches separate [90m(0.165792ms)[39m[39m
[32m✔ search file kinds use case-insensitive final extensions [90m(0.115583ms)[39m[39m
(node:16928) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ headings nest by level, and skipped levels nest under the nearest heading [90m(4.23775ms)[39m[39m
[32m✔ the caret's section is the last heading at or before it [90m(7.447417ms)[39m[39m
(node:16929) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ formats exact Markdown agent references [90m(0.472625ms)[39m[39m
[32m✔ rejects URI schemes and all Windows drive-prefixed Markdown paths [90m(0.227708ms)[39m[39m
(node:16930) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ delayed acknowledgements preserve edits typed after a submitted batch [90m(2.010125ms)[39m[39m
[32m✔ two split views converge when both edit before receiving the other change [90m(0.43075ms)[39m[39m
[32m✔ external changes are rebased against unconfirmed typing [90m(12.073709ms)[39m[39m
[32m✔ retried batches are acknowledged once [90m(0.25725ms)[39m[39m
[32m✔ actual host changes override a mismatched expected edit [90m(0.553625ms)[39m[39m
[32m✔ multi-transaction batch remains individually confirmable [90m(0.919875ms)[39m[39m
[32m✔ invalid revisions and malformed edit lengths do not mutate the authority [90m(0.17725ms)[39m[39m
[32m✔ random concurrent insertions, removals and replacements converge [90m(18.898083ms)[39m[39m
[32m✔ LF transport normalizes CRLF without counting CR as a source character [90m(0.171292ms)[39m[39m
[32m✔ rendering without a DOM sanitizer escapes HTML and rejects script links [90m(30.970125ms)[39m[39m
(node:16931) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ complete syntax is shared by outline and footnote indexes and retained for selections [90m(63.267875ms)[39m[39m
[32m✔ incremental syntax reparses fences, frontmatter and math boundaries beyond the edit [90m(194.016875ms)[39m[39m
[32m✔ incremental syntax and indexes match fresh parses through deterministic structural edits [90m(1475.063333ms)[39m[39m
(node:16932) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ footnotes number references in reading order and retain exact source positions [90m(5.10025ms)[39m[39m
[32m✔ code, escaped references and frontmatter do not become footnotes [90m(10.731916ms)[39m[39m
[32m✔ inline footnotes share numbering and preserve nested brackets and code [90m(0.435ms)[39m[39m
[32m✔ escaped, code and unclosed inline notes remain literal [90m(0.283ms)[39m[39m
[32m✔ references inside definition bodies map through removed indentation [90m(24.93325ms)[39m[39m
[32m✔ section fragments include only needed definitions and terminate cyclic dependencies [90m(37.8665ms)[39m[39m
[32m✔ multiline inline notes omit surrounding quote and list markers from their body [90m(0.603042ms)[39m[39m
[32m✔ comment markers inside inline code do not hide later footnotes [90m(0.241917ms)[39m[39m
(node:16933) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ webview accepts its real wrapper after VS Code masks window.parent [90m(0.411333ms)[39m[39m
(node:16936) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ link suggestions use the Obsidian boundary, gap, spread and length penalties [90m(16.226041ms)[39m[39m
[32m✔ every query word must match, in any field, case-insensitively [90m(0.54675ms)[39m[39m
[32m✔ CJK characters are separate tokens and repeated query tokens cannot reuse one occurrence [90m(2.178542ms)[39m[39m
[32m✔ mixed CJK tokens and compatibility normalization preserve original UTF-16 highlight ranges [90m(0.607084ms)[39m[39m
[32m✔ whole tokens may reorder while subsequence fallback preserves query order [90m(0.1815ms)[39m[39m
[32m✔ repeated tokens skip occupied matches and normalized ranges coalesce [90m(0.126792ms)[39m[39m
(node:16937) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ one metadata result contains positions, aliases, links, embeds, blocks and tasks [90m(65.535542ms)[39m[39m
[32m✔ reference links resolve through definitions and syntax inside code remains opaque [90m(0.6235ms)[39m[39m
[32m✔ renderer instances isolate line-break configuration and emit generic fence placeholders [90m(5.124ms)[39m[39m
[32m✔ footnote metadata maps links, tags and nested list parents back to source [90m(1.280167ms)[39m[39m
[32m✔ block IDs exclude opaque syntax and standalone IDs target preceding blocks [90m(1.062792ms)[39m[39m
(node:16938) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ outline recognizes real headings and excludes properties, code and math [90m(8.644375ms)[39m[39m
[32m✔ fold ranges respect quote boundaries and repeated headings get distinct identities [90m(0.563459ms)[39m[39m
(node:16939) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ recursive YAML properties render without throwing or mistaking shared aliases for cycles [90m(6.278208ms)[39m[39m
[32m✔ nested property values preserve links, empty lists and multiline text [90m(5.399542ms)[39m[39m
[32m✔ boolean property edits preserve anchors, comments, flow syntax and CRLF [90m(0.744041ms)[39m[39m
[32m✔ property strings cannot introduce extra interactive property controls [90m(1.52525ms)[39m[39m
[32m✔ text property edits preserve quote style and string types [90m(6.745834ms)[39m[39m
[32m✔ numeric property edits preserve neighboring text and reject non-finite values [90m(5.875833ms)[39m[39m
[32m✔ boolean property edits reject aliases, strings and duplicate keys [90m(0.61125ms)[39m[39m
[32m✔ list edits preserve neighboring YAML, string types and line endings [90m(1.937125ms)[39m[39m
[32m✔ scalar serialization preserves negative zero and quotes multiline replacements [90m(0.452667ms)[39m[39m
(node:16941) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ empty headers and new properties preserve the note body and line endings [90m(6.360542ms)[39m[39m
[32m✔ rename and removal preserve unrelated comments, multiline values and formatting [90m(1.476709ms)[39m[39m
[32m✔ property edits retain flow mappings and reject removal of a referenced anchor [90m(2.56575ms)[39m[39m
[32m✔ explicit value editing changes scalar types and retains unrelated inline comments [90m(2.632084ms)[39m[39m
[32m✔ adding properties distinguishes an unfinished header from ordinary Markdown [90m(0.454ms)[39m[39m
[32m✔ new properties reject non-finite scalar and list values [90m(0.128708ms)[39m[39m
[32m✔ structured property paste merges nested values and unions lists without touching other YAML [90m(2.83375ms)[39m[39m
[32m✔ structured property paste handles flow maps, empty values and null merge rules [90m(1.574209ms)[39m[39m
[32m✔ an invalid property in a paste rejects the whole batch [90m(0.274833ms)[39m[39m
[32m✔ structured paste treats inherited-looking names as ordinary own properties [90m(0.42825ms)[39m[39m
[32m✔ key edits reject missing and duplicate keys without partial removal [90m(0.419334ms)[39m[39m
[32m✔ structured merge retains truthy values on null and replaces falsy values [90m(0.977917ms)[39m[39m
(node:16943) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ property order moves complete entries with comments and multiline values [90m(7.034334ms)[39m[39m
[32m✔ flow property maps retain values, quotes and comments through a reorder [90m(3.011583ms)[39m[39m
[32m✔ invalid key permutations cannot remove or duplicate a property [90m(0.467625ms)[39m[39m
[32m✔ alias dependencies remain valid and forward-alias reorders are rejected [90m(1.064375ms)[39m[39m
[32m✔ empty values, empty headers and punctuation in keys keep their source meaning [90m(0.332333ms)[39m[39m
[32m✔ flow reordering retains CRLF and rejects non-string YAML keys [90m(0.429458ms)[39m[39m
(node:16949) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ protocol rejects unknown actions and invalid message shapes [90m(0.652708ms)[39m[39m
(node:16952) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ hybrid syntax keeps code opaque while parsing highlights, comments and formulas [90m(2.430792ms)[39m[39m
[32m✔ properties parse scalar and list types without accepting duplicate keys [90m(3.973667ms)[39m[39m
[32m✔ nested and folded callouts preserve inline formatting and independent containers [90m(8.283083ms)[39m[39m
[32m✔ diagram and formula payloads are encoded before becoming HTML attributes [90m(0.25075ms)[39m[39m
[32m✔ aliases and image dimensions handle escaped table pipes [90m(0.322667ms)[39m[39m
[32m✔ heading fragments include descendants and stop before a sibling, ignoring fenced headings [90m(2.513667ms)[39m[39m
[32m✔ block fragments support a paragraph and a separately identified list [90m(0.864417ms)[39m[39m
[32m✔ rendered note embeds hide block identifiers while fenced code remains literal [90m(0.283792ms)[39m[39m
[32m✔ named footnotes and collapsed reference links retain their separate syntax [90m(0.949625ms)[39m[39m
(node:16953) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ inline projections retain source offsets through nested formatting and escapes [90m(11.286042ms)[39m[39m
[32m✔ inline projections preserve entities, links and literal code source [90m(17.664541ms)[39m[39m
[32m✔ inline projection maps expanded Unicode entities and stripped-only text [90m(0.747917ms)[39m[39m
(node:16958) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ search gives implicit AND precedence over OR and supports grouped negation [90m(11.488792ms)[39m[39m
[32m✔ search parses quoted paths, escaped phrases, regexes and nested scopes [90m(0.25675ms)[39m[39m
[32m✔ search property filters preserve existence, alternatives and numeric comparisons [90m(0.127208ms)[39m[39m
[32m✔ malformed or unsupported searches fail rather than silently becoming literal text [90m(0.277ms)[39m[39m
[32m✔ document search evaluates Boolean expressions, paths and scoped case sensitivity [90m(0.5595ms)[39m[39m
[32m✔ line, block and section scopes keep all terms inside the requested region [90m(2.726167ms)[39m[39m
[32m✔ task search excludes code and distinguishes custom completion markers [90m(19.8875ms)[39m[39m
[32m✔ property filters distinguish null and empty values and compare numeric properties [90m(30.245958ms)[39m[39m
[32m✔ tag search uses parsed tags and Canvas search uses card contents [90m(7.803583ms)[39m[39m
[32m✔ file-search detection traverses negation and Boolean groups but not property literals [90m(0.167ms)[39m[39m
[32m✔ parser retains exact error offsets after groups and property values [90m(0.147833ms)[39m[39m
(node:16959) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ source selections and annotation positions round trip across mixed newlines and Unicode [90m(0.646917ms)[39m[39m
[32m✔ empty files, bounds and positions inside CRLF separators stay in range [90m(0.113125ms)[39m[39m
(node:16961) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ table ranges select exact source cells and preserve escaped pipes and alignments [90m(1.05975ms)[39m[39m
[32m✔ rectangular clipboard and paste grow the table without destroying untouched cells [90m(0.367292ms)[39m[39m
[32m✔ structural inserts preserve the header and column alignment [90m(0.207041ms)[39m[39m
[32m✔ omitted trailing cells gain delimiters without rewriting existing rows [90m(0.172959ms)[39m[39m
[32m✔ short table separators retain HTML line breaks and empty trailing cells [90m(0.08175ms)[39m[39m
[32m✔ pasted text splits into rows and tab-separated cells [90m(0.110333ms)[39m[39m
[32m✔ range texts keep source escapes that copying removes [90m(0.0795ms)[39m[39m
[32m✔ formatting markers toggle and leave empty cells empty [90m(0.0625ms)[39m[39m
[32m✔ an offset inside a cell's padding finds that cell [90m(0.124208ms)[39m[39m
(node:16964) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ row operations can exchange or replace the header without losing cell content [90m(1.292916ms)[39m[39m
[32m✔ column moves and duplication keep alignment with the source values [90m(0.2185ms)[39m[39m
[32m✔ alignment and sorting preserve the header and unrelated cell contents [90m(6.043417ms)[39m[39m
(node:16966) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ tag hierarchy merges case variants and counts each note once in parent totals [90m(7.851ms)[39m[39m
[32m✔ flat tags retain full paths while frequency sorting orders each level [90m(0.254792ms)[39m[39m
(node:16970) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ tags combine Markdown and YAML while excluding code, escapes, comments and numeric tags [90m(50.165417ms)[39m[39m
[32m✔ rendered tag controls preserve hierarchy and leave code literal [90m(10.432042ms)[39m[39m
[32m✔ tags in footnote definitions remain searchable [90m(5.456083ms)[39m[39m
(node:16971) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ task markers preserve quote prefixes, ordered lists and custom status [90m(1.509833ms)[39m[39m
(node:16972) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ logical groups replay native undo steps in both directions [90m(0.52275ms)[39m[39m
[32m✔ unexpected native state stops grouped replay rather than undoing unrelated edits [90m(0.092125ms)[39m[39m
(node:16973) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ an empty query lists notes by most recent change [90m(9.554292ms)[39m[39m
[32m✔ prefix matches rank first, names above paths; aliases and not-created links are found; excluded files are not [90m(58.080917ms)[39m[39m
[32m✔ no create item when a note already has that name [90m(0.862209ms)[39m[39m
(node:16988) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ resource containment rejects sibling prefixes, traversal and different authorities [90m(5.513042ms)[39m[39m
[32m✔ realpath checks reject symlink escapes while permitting contained files [90m(18.817083ms)[39m[39m
[32m✔ virtual resource checks reject symlinked ancestor directories [90m(0.510792ms)[39m[39m
(node:16989) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ cold start lists, parses each note once, resolves links and saves a snapshot [90m(188.692208ms)[39m[39m
[32m✔ warm start serves the snapshot before listing and re-reads only changed notes [90m(167.933833ms)[39m[39m
[32m✔ file events keep the index current; a rename keeps metadata without reading [90m(1.12875ms)[39m[39m
[32m✔ an open note is indexed from its unsaved text until it closes [90m(13.067209ms)[39m[39m
[32m✔ excluded files stay resolvable and are flagged; hidden folders are not indexed [90m(0.44275ms)[39m[39m
[32m✔ a listing over the limit reports a partial index [90m(0.141958ms)[39m[39m
[32m✔ an unreadable note is reported and does not stop indexing [90m(1.8545ms)[39m[39m
[32m✔ deleting a folder removes every file in it [90m(0.342334ms)[39m[39m
(node:16990) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ link maps count links, embeds and property links, and skip external and in-note links [90m(26.8525ms)[39m[39m
[32m✔ markdown link destinations are decoded before resolving [90m(0.522083ms)[39m[39m
[32m✔ backlinks invert resolved links and exclude the note itself [90m(0.483125ms)[39m[39m
[32m✔ creating a file resolves links that mention its name, and only those [90m(0.304ms)[39m[39m
[32m✔ a nearer file with the same name takes over an ambiguous link [90m(0.293833ms)[39m[39m
[32m✔ deleting a target makes its links unresolved; deleting a source drops its links [90m(0.265959ms)[39m[39m
[32m✔ renaming re-resolves incoming links by name and the renamed note's own relative links [90m(0.288792ms)[39m[39m
[32m✔ a new folder note resolves links to its folder [90m(0.148416ms)[39m[39m
[32m✔ changing the folder-note setting re-resolves every note [90m(0.169958ms)[39m[39m
[32m✔ tags count every occurrence, from text and properties [90m(8.440417ms)[39m[39m
[32m✔ change listeners receive each change, and resolve listeners fire on request [90m(0.229834ms)[39m[39m
(node:16991) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ notes in one vault share one index; a marker folder starts its own vault [90m(10.734459ms)[39m[39m
[32m✔ typing in an open note updates its vault's index; closing restores the file [90m(404.086ms)[39m[39m
[32m✔ index changes become vault/changed and vault/resolved events with the vault root [90m(0.654584ms)[39m[39m
[32m✔ a note outside the workspace is a vault of its own folder [90m(0.224625ms)[39m[39m
[32m✔ each panel's vault service is the shared index of its note's vault [90m(0.299291ms)[39m[39m
[32m✔ locate and text give a note's vault, path and current text [90m(0.52ms)[39m[39m
(node:16992) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ resolveLink: empty path means the source note [90m(0.873042ms)[39m[39m
[32m✔ resolveLink: exact path without extension [90m(0.137375ms)[39m[39m
[32m✔ resolveLink: exact path with extension [90m(0.07625ms)[39m[39m
[32m✔ resolveLink: exact path ignores subpath and case [90m(0.072708ms)[39m[39m
[32m✔ resolveLink: unique basename anywhere [90m(0.079333ms)[39m[39m
[32m✔ resolveLink: unique basename for attachments keeps extension [90m(0.083208ms)[39m[39m
[32m✔ resolveLink: unique basename ignores case [90m(0.067417ms)[39m[39m
[32m✔ resolveLink: ./ resolves from the source folder [90m(0.165834ms)[39m[39m
[32m✔ resolveLink: ../ climbs from the source folder [90m(0.2845ms)[39m[39m
[32m✔ resolveLink: ../ beyond the vault root does not resolve [90m(0.64425ms)[39m[39m
[32m✔ resolveLink: leading slash starts at the vault root [90m(0.346542ms)[39m[39m
[32m✔ resolveLink: ambiguous name prefers the same folder [90m(0.204834ms)[39m[39m
[32m✔ resolveLink: ambiguous name prefers the nearest folder [90m(0.07175ms)[39m[39m
[32m✔ resolveLink: ambiguous name with equal distance sorts by path [90m(0.095959ms)[39m[39m
[32m✔ resolveLink: path suffix narrows ambiguous names [90m(0.060708ms)[39m[39m
[32m✔ resolveLink: unknown note does not resolve [90m(0.060125ms)[39m[39m
[32m✔ resolveLink: folder link without a folder note does not resolve [90m(0.050292ms)[39m[39m
[32m✔ resolveLink: alias text is not part of the path [90m(0.128792ms)[39m[39m
[32m✔ resolveLink: a folder link opens the configured folder note [90m(0.592209ms)[39m[39m
[32m✔ resolveLinkCandidates lists every ambiguous match nearest first [90m(1.463958ms)[39m[39m
[32m✔ linkText follows the new link format [90m(1.620708ms)[39m[39m
(node:16993) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ the vault root is the nearest folder with a marker, else the workspace folder [90m(0.864916ms)[39m[39m
[32m✔ excluded-file filters: prefixes as in Obsidian, globs when wildcards are present [90m(0.389959ms)[39m[39m
[32m✔ hidden folders and node_modules are never indexed [90m(0.079166ms)[39m[39m
[32m✔ snapshots round-trip in shards, rewrite only what changed and drop orphans [90m(176.000958ms)[39m[39m
[32m✔ snapshots from another version or unreadable files start empty [90m(0.197959ms)[39m[39m
[32m✔ snapshots keep Maps in metadata, such as footnote references [90m(169.288166ms)[39m[39m
[32m✔ packing positions round-trips real metadata exactly [90m(8.089542ms)[39m[39m
[32m✔ unpacking never lets a stored key set a prototype [90m(0.202584ms)[39m[39m
[32m✔ nested vaults get separate property scopes within one opened workspace [90m(0.130458ms)[39m[39m
(node:16995) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ backlinks list linking notes with context lines, and unlinked mentions on request [90m(10.453291ms)[39m[39m
[32m✔ a line opens its note at the mention [90m(0.985583ms)[39m[39m
[32m✔ outgoing links list resolved files with counts, then links not created yet [90m(0.819667ms)[39m[39m
[32m✔ view plugins follow the active note and their setting, and clean up when turned off [90m(439.439959ms)[39m[39m
(node:16996) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ menu navigation wraps enabled choices and reserves submenu/dismissal keys [90m(0.422417ms)[39m[39m
(node:16997) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[32m✔ words skip properties and Markdown punctuation; CJK characters count one each [90m(1.51275ms)[39m[39m
[32m✔ characters exclude line breaks; a selection counts its properties too [90m(2.138542ms)[39m[39m
[32m✔ counts read like Obsidian's status bar [90m(20.518625ms)[39m[39m
[34mℹ tests 352[39m
[34mℹ suites 0[39m
[34mℹ pass 352[39m
[34mℹ fail 0[39m
[34mℹ cancelled 0[39m
[34mℹ skipped 0[39m
[34mℹ todo 0[39m
[34mℹ duration_ms 3033.155792[39m
(node:17005) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

> vscode-markdown-workbench@0.1.0 contributions /Users/t04dj14n9/Code/vscode-markdown-workbench
> tsx scripts/generate-contributions.ts --check

(node:17025) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:17036) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
