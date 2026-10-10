# Obsidian measurements

Scripts and raw results behind Obsidian parity decisions. They drive a real
Obsidian 1.14.x through the Chrome DevTools Protocol, so the numbers can be
measured again when Obsidian changes.

Run (Linux, any display):

1. Start Obsidian with a throw-away config and a test vault:
   `obsidian --remote-debugging-port=9333 --user-data-dir=/tmp/obsidian-config`
   (add `--no-sandbox --disable-gpu` in a container) and open the vault once.
2. `node font-size.mjs [size]` measures the note typography at a base font
   size (default 16): the body, H1 to H6, inline code, code lines, table,
   properties, footnotes and line numbers, with the CSS variables behind them.
   `font-size-results-16.json` and `font-size-results-24.json` are the recorded
   answers: at 16px the body is 16px with a 24px line, headings are 1.618,
   1.462, 1.318, 1.188, 1.076 and 1 times the body with line heights 1.2, 1.2,
   1.3, 1.4, 1.5 and 1.5, inline code and code lines 0.875em, the footnote
   reference 0.8em and its text 0.875em; every line height is 1.5 times the font size (24px at 16px, 36px at 24px; headings 1.2, 1.2, 1.3, 1.4, 1.5, 1.5 times their size; code and footnotes 1.5; table cells 1.3); at 24px every size and line height is
   exactly 1.5 times larger, except the line-number font, which stays 12px.
   `font-size-shot.mjs note.md size out.png` screenshots a note at a size.
   `playwright-core` must be resolvable; `lib.mjs` connects to port 9333.

The scripts are measurement tools, not tests: nothing in CI runs them.
