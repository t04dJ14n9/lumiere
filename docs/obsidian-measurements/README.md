# Obsidian measurements

Scripts and raw results behind `../OBSIDIAN_REVEAL_RULES.md` (and the Properties
and Tables behaviour notes next to this file). They drive a real Obsidian 1.14.x
through the Chrome DevTools Protocol, so the rules can be measured again when
Obsidian changes.

Run (Linux, any display):

1. Start Obsidian with a throw-away config and a test vault:
   `obsidian --remote-debugging-port=9333 --user-data-dir=/tmp/obsidian-config`
   (and open the vault once; the scripts create their own notes in it).
2. `node inline.mjs` / `node block.mjs` / `node sel.mjs` / `node dump.mjs`
   (`playwright-core` must be resolvable; `lib.mjs` connects to port 9333).
   `inline-cases*.json` hold the inline cases; `r1-r3.json` are the recorded
   answers the document was written from. `e1`-`e6`, `props*.mjs`, `pk.mjs`
   measure the Properties view; `tb1.mjs` the table editor.

The scripts are measurement tools, not tests: nothing in CI runs them.
